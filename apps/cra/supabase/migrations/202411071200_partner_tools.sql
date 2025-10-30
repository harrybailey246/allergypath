-- Partner tools data sources & policies

-- Helper functions to centralise role checks for partner portal access.
create or replace function public.has_staff_role(roles text[])
returns boolean
language sql
stable
as $$
  select exists(
    select 1
      from public.clinician_emails ce
     where lower(ce.email) = lower(coalesce(current_setting('request.jwt.claim.email', true), ''))
       and ce.role = any(roles)
  );
$$;

create or replace function public.has_partner_portal_access()
returns boolean
language sql
stable
as $$
  select public.has_staff_role(array['admin','clinician','partner']);
$$;

-- Tables backing each partner tool card.
create table if not exists public.partner_checkins (
  id uuid primary key default gen_random_uuid(),
  patient_name text not null unique,
  status text not null,
  arrived_at timestamptz default timezone('utc', now()) not null,
  updated_at timestamptz default timezone('utc', now()) not null
);

create table if not exists public.partner_label_queue (
  id uuid primary key default gen_random_uuid(),
  label_code text not null unique,
  patient_name text not null,
  request_type text not null,
  priority text not null default 'normal',
  created_at timestamptz default timezone('utc', now()) not null
);

create table if not exists public.partner_stock_levels (
  id uuid primary key default gen_random_uuid(),
  item_name text not null unique,
  quantity integer not null check (quantity >= 0),
  unit text not null,
  status text not null,
  updated_at timestamptz default timezone('utc', now()) not null
);

create table if not exists public.partner_payouts (
  id uuid primary key default gen_random_uuid(),
  occurred_on date not null default current_date,
  amount numeric(12,2) not null check (amount >= 0),
  partner_email text,
  notes text
);

-- Views for schedule + earnings aggregates.
create or replace view public.partner_today_schedule as
select
  a.id,
  a.start_at,
  a.end_at,
  coalesce(nullif(trim(a.notes), ''), 'Consultation') as purpose,
  concat_ws(' ', s.first_name, s.surname) as patient_name,
  a.location
from public.appointments a
join public.submissions s on s.id = a.submission_id
where a.start_at::date = current_date
order by a.start_at asc;

create or replace view public.partner_earnings_summary as
with base as (
  select occurred_on, amount
    from public.partner_payouts
)
select 'today'::text as scope, coalesce(sum(amount), 0)::numeric(12,2) as amount
  from base
 where occurred_on = current_date
union all
select 'week'::text as scope, coalesce(sum(amount), 0)::numeric(12,2) as amount
  from base
 where occurred_on >= date_trunc('week', current_date)
union all
select 'month'::text as scope, coalesce(sum(amount), 0)::numeric(12,2) as amount
  from base
 where occurred_on >= date_trunc('month', current_date);

-- Ensure RLS is active on new tables.
alter table public.partner_checkins enable row level security;
alter table public.partner_label_queue enable row level security;
alter table public.partner_stock_levels enable row level security;
alter table public.partner_payouts enable row level security;

-- Shared policy helper (partners can read; clinicians/admins can manage rows).
do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'partner_checkins' and policyname = 'partner-checkins-select'
  ) then
    create policy "partner-checkins-select"
      on public.partner_checkins
      for select
      using (public.has_partner_portal_access());
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'partner_checkins' and policyname = 'partner-checkins-manage'
  ) then
    create policy "partner-checkins-manage"
      on public.partner_checkins
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
     where schemaname = 'public' and tablename = 'partner_label_queue' and policyname = 'partner-label-queue-select'
  ) then
    create policy "partner-label-queue-select"
      on public.partner_label_queue
      for select
      using (public.has_partner_portal_access());
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'partner_label_queue' and policyname = 'partner-label-queue-manage'
  ) then
    create policy "partner-label-queue-manage"
      on public.partner_label_queue
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
     where schemaname = 'public' and tablename = 'partner_stock_levels' and policyname = 'partner-stock-select'
  ) then
    create policy "partner-stock-select"
      on public.partner_stock_levels
      for select
      using (public.has_partner_portal_access());
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'partner_stock_levels' and policyname = 'partner-stock-manage'
  ) then
    create policy "partner-stock-manage"
      on public.partner_stock_levels
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
     where schemaname = 'public' and tablename = 'partner_payouts' and policyname = 'partner-payouts-select'
  ) then
    create policy "partner-payouts-select"
      on public.partner_payouts
      for select
      using (public.has_partner_portal_access());
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'partner_payouts' and policyname = 'partner-payouts-manage'
  ) then
    create policy "partner-payouts-manage"
      on public.partner_payouts
      for all
      using (public.has_staff_role(array['admin','clinician']))
      with check (public.has_staff_role(array['admin','clinician']));
  end if;
end;
$$;

-- Allow partners to read schedule source tables required by the view.
do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'appointments' and policyname = 'partner-appointments-select'
  ) then
    create policy "partner-appointments-select"
      on public.appointments
      for select
      using (public.has_partner_portal_access());
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'submissions' and policyname = 'partner-submissions-select'
  ) then
    create policy "partner-submissions-select"
      on public.submissions
      for select
      using (public.has_partner_portal_access());
  end if;
end;
$$;

-- Seed default rows so the UI has sensible values out of the box.
insert into public.partner_checkins (patient_name, status)
values
  ('Jamie Lee', 'Waiting'),
  ('Maria Sanchez', 'Vitals complete'),
  ('Chris Patel', 'Roomed')
on conflict (patient_name) do update
  set status = excluded.status,
      arrived_at = excluded.arrived_at,
      updated_at = timezone('utc', now());

insert into public.partner_label_queue (label_code, patient_name, request_type, priority)
values
  ('RX-2341', 'Jamie Lee', 'EpiPen refill', 'high'),
  ('RX-2342', 'Maria Sanchez', 'Serum batch', 'normal')
on conflict (label_code) do update
  set patient_name = excluded.patient_name,
      request_type = excluded.request_type,
      priority = excluded.priority,
      created_at = excluded.created_at;

insert into public.partner_stock_levels (item_name, quantity, unit, status)
values
  ('EpiPen', 18, 'units', 'Healthy'),
  ('Serum A', 6, 'vials', 'Restock soon'),
  ('Bandages', 42, 'packs', 'Healthy')
on conflict (item_name) do update
  set quantity = excluded.quantity,
      unit = excluded.unit,
      status = excluded.status,
      updated_at = timezone('utc', now());

insert into public.partner_payouts (occurred_on, amount, notes)
values
  (current_date, 1820.00, 'Clinic visit payouts'),
  (date_trunc('week', current_date)::date + 1, 3460.00, 'Allergy testing revenue'),
  (date_trunc('week', current_date)::date + 3, 2180.00, 'Prescription services'),
  (date_trunc('month', current_date)::date + 2, 9200.00, 'Monthly retainer installment')
on conflict do nothing;
