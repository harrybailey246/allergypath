-- Track immunotherapy plans and doses with automated gap handling.
create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

create table if not exists public.immunotherapy_plans (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  regimen_stage text not null,
  protocol_name text,
  planned_total_doses integer,
  status text not null default 'planned',
  current_dose_number integer default 0,
  allowed_gap_days integer default 14,
  next_due_at timestamptz,
  recommended_gap_action text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint immunotherapy_plans_submission_unique unique (submission_id)
);

create table if not exists public.immunotherapy_doses (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.immunotherapy_plans(id) on delete cascade,
  submission_id uuid not null references public.submissions(id) on delete cascade,
  dose_number integer not null,
  scheduled_at timestamptz,
  planned_dose numeric(10,2),
  planned_dose_unit text,
  administered_dose numeric(10,2),
  administered_dose_unit text,
  administered_at timestamptz,
  lot_number text,
  lot_expiration_date date,
  gap_days integer,
  gap_flag boolean not null default false,
  gap_notes text,
  recommendation text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint immunotherapy_doses_plan_dose_unique unique (plan_id, dose_number)
);

create index if not exists immunotherapy_doses_submission_idx on public.immunotherapy_doses (submission_id);
create index if not exists immunotherapy_doses_plan_gap_idx on public.immunotherapy_doses (plan_id, gap_flag);

create or replace function public.tg_set_row_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_timestamp before update on public.immunotherapy_plans
for each row execute function public.tg_set_row_updated_at();

create trigger set_timestamp before update on public.immunotherapy_doses
for each row execute function public.tg_set_row_updated_at();

create or replace function public.handle_immunotherapy_gap()
returns trigger as $$
declare
  plan_record public.immunotherapy_plans;
  threshold integer;
  last_admin timestamptz;
begin
  select * into plan_record from public.immunotherapy_plans where id = new.plan_id;
  threshold := coalesce(plan_record.allowed_gap_days, 14);

  if new.scheduled_at is null and new.administered_at is null then
    -- nothing to compare against
    new.gap_days := null;
    new.gap_flag := false;
  else
    if new.administered_at is not null then
      if new.scheduled_at is not null then
        new.gap_days := floor(extract(epoch from (new.administered_at - new.scheduled_at)) / 86400);
      else
        select administered_at into last_admin
        from public.immunotherapy_doses
        where plan_id = new.plan_id
          and id <> new.id
          and administered_at is not null
        order by administered_at desc
        limit 1;
        if last_admin is not null then
          new.gap_days := floor(extract(epoch from (new.administered_at - last_admin)) / 86400);
        end if;
      end if;
    elsif new.scheduled_at is not null then
      select administered_at into last_admin
      from public.immunotherapy_doses
      where plan_id = new.plan_id
        and (new.id is null or id <> new.id)
        and administered_at is not null
      order by administered_at desc
      limit 1;
      if last_admin is not null then
        new.gap_days := floor(extract(epoch from (new.scheduled_at - last_admin)) / 86400);
      end if;
    end if;

    if new.gap_days is not null then
      new.gap_days := greatest(new.gap_days, 0);
      new.gap_flag := new.gap_days > threshold;
      if new.gap_flag then
        new.recommendation := coalesce(
          new.recommendation,
          format(
            'Gap of %s days exceeds %s-day protocol for %s stage. Consider repeating prior dose or consult protocol.',
            new.gap_days,
            threshold,
            coalesce(plan_record.regimen_stage, 'current')
          )
        );
      end if;
    else
      new.gap_flag := false;
    end if;
  end if;

  return new;
end;
$$ language plpgsql;

create trigger handle_gap before insert or update on public.immunotherapy_doses
for each row execute function public.handle_immunotherapy_gap();

create or replace function public.immunotherapy_plan_snapshot(submission_id uuid)
returns jsonb
language plpgsql
stable
as $$
declare
  plan_rec record;
  overdue_count integer;
  next_dose record;
  completed_count integer;
  doses_json jsonb;
  recommendation jsonb;
begin
  select p.*
  into plan_rec
  from public.immunotherapy_plans p
  where p.submission_id = submission_id
  order by p.created_at desc
  limit 1;

  if not found then
    return null;
  end if;

  select count(*)
  into completed_count
  from public.immunotherapy_doses d
  where d.plan_id = plan_rec.id
    and d.administered_at is not null;

  select count(*)
  into overdue_count
  from public.immunotherapy_doses d
  where d.plan_id = plan_rec.id
    and d.administered_at is null
    and d.scheduled_at is not null
    and d.scheduled_at < now();

  select jsonb_agg(
           jsonb_build_object(
             'id', d.id,
             'dose_number', d.dose_number,
             'scheduled_at', d.scheduled_at,
             'planned_dose', d.planned_dose,
             'planned_dose_unit', d.planned_dose_unit,
             'administered_dose', d.administered_dose,
             'administered_dose_unit', d.administered_dose_unit,
             'administered_at', d.administered_at,
             'lot_number', d.lot_number,
             'lot_expiration_date', d.lot_expiration_date,
             'gap_days', d.gap_days,
             'gap_flag', d.gap_flag,
             'gap_notes', d.gap_notes,
             'recommendation', d.recommendation
           )
           order by d.dose_number
         )
  into doses_json
  from public.immunotherapy_doses d
  where d.plan_id = plan_rec.id;

  select *
  into next_dose
  from public.immunotherapy_doses d
  where d.plan_id = plan_rec.id
    and d.administered_at is null
  order by coalesce(d.scheduled_at, now()), d.dose_number
  limit 1;

  if found then
    recommendation := jsonb_build_object(
      'dose_id', next_dose.id,
      'dose_number', next_dose.dose_number,
      'scheduled_at', next_dose.scheduled_at,
      'planned_dose', next_dose.planned_dose,
      'planned_dose_unit', next_dose.planned_dose_unit,
      'administered_dose', next_dose.administered_dose,
      'administered_dose_unit', next_dose.administered_dose_unit,
      'administered_at', next_dose.administered_at,
      'gap_flag', next_dose.gap_flag,
      'gap_days', next_dose.gap_days,
      'recommendation', coalesce(
        next_dose.recommendation,
        case
          when next_dose.gap_flag then format('Gap flagged (%s days). Review protocol before administering.', next_dose.gap_days)
          else 'Proceed as scheduled.'
        end
      ),
      'lot_number', next_dose.lot_number,
      'lot_expiration_date', next_dose.lot_expiration_date
    );
  end if;

  return jsonb_build_object(
    'plan', jsonb_build_object(
      'id', plan_rec.id,
      'status', plan_rec.status,
      'regimen_stage', plan_rec.regimen_stage,
      'protocol_name', plan_rec.protocol_name,
      'allowed_gap_days', plan_rec.allowed_gap_days,
      'next_due_at', plan_rec.next_due_at,
      'recommended_gap_action', plan_rec.recommended_gap_action,
      'planned_total_doses', plan_rec.planned_total_doses,
      'completed_doses', completed_count
    ),
    'overdue_count', overdue_count,
    'next_recommendation', recommendation,
    'doses', coalesce(doses_json, '[]'::jsonb)
  );
end;
$$;
