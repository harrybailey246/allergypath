-- Create audit and emergency checklist tables plus analytics helpers
create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (char_length(trim(event_type)) > 0),
  occurred_at timestamptz not null default timezone('utc', now()),
  location text,
  description text,
  staff_participants jsonb not null default '[]'::jsonb check (jsonb_typeof(staff_participants) = 'array'),
  outcomes text,
  outcome_status text check (outcome_status in ('pass','fail','follow_up','in_progress')),
  attachments jsonb not null default '[]'::jsonb check (jsonb_typeof(attachments) = 'array'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists audit_events_type_idx on public.audit_events (event_type);
create index if not exists audit_events_occurred_at_idx on public.audit_events (occurred_at desc);

create table if not exists public.emergency_checklists (
  id uuid primary key default gen_random_uuid(),
  checklist_type text not null check (checklist_type in ('emergency_drug_check','evacuation_drill','equipment_check','other')),
  performed_on date not null default current_date,
  location text,
  staff_participants jsonb not null default '[]'::jsonb check (jsonb_typeof(staff_participants) = 'array'),
  outcome_status text not null check (outcome_status in ('pass','fail','follow_up')),
  outcomes text,
  corrective_actions text,
  attachments jsonb not null default '[]'::jsonb check (jsonb_typeof(attachments) = 'array'),
  next_steps text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists emergency_checklists_type_idx on public.emergency_checklists (checklist_type);
create index if not exists emergency_checklists_performed_on_idx on public.emergency_checklists (performed_on desc);

alter table public.audit_events enable row level security;
alter table public.emergency_checklists enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'audit_events'
       and policyname = 'audit-events-select'
  ) then
    create policy "audit-events-select"
      on public.audit_events
      for select
      using (public.has_staff_role(array['admin','clinician']));
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'audit_events'
       and policyname = 'audit-events-manage'
  ) then
    create policy "audit-events-manage"
      on public.audit_events
      for all
      using (public.has_staff_role(array['admin','clinician']))
      with check (public.has_staff_role(array['admin','clinician']));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'emergency_checklists'
       and policyname = 'emergency-checklists-select'
  ) then
    create policy "emergency-checklists-select"
      on public.emergency_checklists
      for select
      using (public.has_staff_role(array['admin','clinician']));
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'emergency_checklists'
       and policyname = 'emergency-checklists-manage'
  ) then
    create policy "emergency-checklists-manage"
      on public.emergency_checklists
      for all
      using (public.has_staff_role(array['admin','clinician']))
      with check (public.has_staff_role(array['admin','clinician']));
  end if;
end;
$$;

-- Analytics helpers for compliance and overdue tracking
create or replace view public.analytics_emergency_compliance as
with schedule as (
  select *
    from (values
      ('emergency_drug_check'::text, 30),
      ('evacuation_drill'::text, 180),
      ('equipment_check'::text, 90)
    ) as s(checklist_type, interval_days)
), base as (
  select
    checklist_type,
    count(*) filter (where outcome_status = 'pass') as pass_count,
    count(*) as total_count,
    max(performed_on) as last_performed_on
  from public.emergency_checklists
  group by checklist_type
), joined as (
  select
    s.checklist_type,
    s.interval_days,
    coalesce(b.pass_count, 0) as pass_count,
    coalesce(b.total_count, 0) as total_count,
    b.last_performed_on,
    case
      when coalesce(b.total_count, 0) > 0 then
        round((coalesce(b.pass_count, 0)::numeric / nullif(b.total_count, 0)) * 100, 1)
      else null
    end as compliance_rate,
    case
      when b.last_performed_on is not null then
        (b.last_performed_on + (s.interval_days || ' days')::interval)::date
      else null
    end as next_due_on
  from schedule s
  left join base b on b.checklist_type = s.checklist_type
)
select
  checklist_type,
  interval_days,
  pass_count,
  total_count,
  compliance_rate,
  last_performed_on,
  next_due_on,
  case
    when next_due_on is null then true
    else current_date > next_due_on
  end as is_overdue,
  case
    when next_due_on is null then null
    else greatest(0, (current_date - next_due_on))
  end as days_overdue
from joined;

create or replace view public.analytics_audit_event_summary as
select
  event_type,
  count(*) as event_count,
  max(occurred_at) as last_occurred_at
from public.audit_events
group by event_type;

create or replace function public.emergency_checklist_due(days_ahead integer default 7)
returns table (
  checklist_type text,
  interval_days integer,
  next_due_on date,
  is_overdue boolean,
  days_overdue integer
)
language sql
security definer
set search_path = public
as $$
  select
    checklist_type,
    interval_days,
    next_due_on,
    is_overdue,
    days_overdue
  from public.analytics_emergency_compliance
  where next_due_on is null
     or next_due_on <= current_date + make_interval(days => coalesce(days_ahead, 0))
  order by next_due_on nulls first;
$$;

