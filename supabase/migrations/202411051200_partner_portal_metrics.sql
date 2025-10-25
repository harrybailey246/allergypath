-- Partner portal metrics tables/views and policies
set check_function_bodies = off;

-- Daily schedule view from appointments for the partner portal.
create or replace view public.partner_portal_daily_schedule as
select
  a.id,
  a.submission_id,
  s.first_name,
  s.surname,
  a.start_at,
  a.end_at,
  a.location,
  coalesce(nullif(trim(a.notes), ''), s.status) as purpose
from public.appointments a
left join public.submissions s on s.id = a.submission_id
where a.start_at >= date_trunc('day', timezone('utc', now()))
  and a.start_at < date_trunc('day', timezone('utc', now())) + interval '1 day'
order by a.start_at;

comment on view public.partner_portal_daily_schedule is 'Upcoming appointments for the current day, used by the partner portal schedule card.';

-- Stock tracking table surfaced to partners.
create table if not exists public.partner_stock_levels (
  id uuid primary key default gen_random_uuid(),
  item_name text not null,
  quantity numeric,
  unit text,
  status text,
  low_threshold numeric,
  updated_at timestamptz not null default now()
);

alter table public.partner_stock_levels enable row level security;

drop policy if exists "partners-can-read-stock" on public.partner_stock_levels;
create policy "partners-can-read-stock"
  on public.partner_stock_levels
  for select
  using (auth.role() = 'authenticated');

-- Allow service role (e.g. edge functions) to maintain stock rows without exposing write access to partners.
drop policy if exists "service-updates-stock" on public.partner_stock_levels;
create policy "service-updates-stock"
  on public.partner_stock_levels
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- Payouts table with a roll-up view for quick card rendering.
create table if not exists public.partner_payouts (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid,
  payout_date date not null,
  amount numeric(12,2) not null,
  status text default 'pending',
  created_at timestamptz not null default now()
);

alter table public.partner_payouts enable row level security;

drop policy if exists "partners-can-read-payouts" on public.partner_payouts;
create policy "partners-can-read-payouts"
  on public.partner_payouts
  for select
  using (auth.role() = 'authenticated');

drop policy if exists "service-manages-payouts" on public.partner_payouts;
create policy "service-manages-payouts"
  on public.partner_payouts
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create or replace view public.partner_portal_payout_summary as
select
  coalesce(sum(case when payout_date = current_date then amount end), 0)::numeric(12,2) as today_total,
  coalesce(sum(case when payout_date >= current_date - interval '6 day' then amount end), 0)::numeric(12,2) as week_total,
  coalesce(sum(case when date_trunc('month', payout_date) = date_trunc('month', current_date) then amount end), 0)::numeric(12,2) as month_total
from public.partner_payouts;

comment on view public.partner_portal_payout_summary is 'Aggregated partner payout totals for today, the trailing week, and the current month.';

-- Patient check-in queue for partners.
create table if not exists public.partner_check_ins (
  id uuid primary key default gen_random_uuid(),
  patient_name text not null,
  status text not null,
  updated_at timestamptz not null default now()
);

alter table public.partner_check_ins enable row level security;

drop policy if exists "partners-can-read-checkins" on public.partner_check_ins;
create policy "partners-can-read-checkins"
  on public.partner_check_ins
  for select
  using (auth.role() = 'authenticated');

drop policy if exists "service-manages-checkins" on public.partner_check_ins;
create policy "service-manages-checkins"
  on public.partner_check_ins
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- Label print queue items exposed to partners.
create table if not exists public.partner_label_queue (
  id uuid primary key default gen_random_uuid(),
  label_code text not null,
  patient_name text not null,
  label_type text,
  created_at timestamptz not null default now()
);

alter table public.partner_label_queue enable row level security;

drop policy if exists "partners-can-read-label-queue" on public.partner_label_queue;
create policy "partners-can-read-label-queue"
  on public.partner_label_queue
  for select
  using (auth.role() = 'authenticated');

drop policy if exists "service-manages-label-queue" on public.partner_label_queue;
create policy "service-manages-label-queue"
  on public.partner_label_queue
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- Convenience view for partner label queue ordering by creation time.
create or replace view public.partner_portal_label_queue as
select id, label_code, patient_name, label_type, created_at
from public.partner_label_queue
order by created_at desc;

comment on view public.partner_portal_label_queue is 'Partner-facing view of pending labels ordered by newest first.';

-- Convenience view for check-ins ordered by most recent updates first.
create or replace view public.partner_portal_check_ins as
select id, patient_name, status, updated_at
from public.partner_check_ins
order by updated_at desc;

comment on view public.partner_portal_check_ins is 'Partner-facing patient check-in statuses ordered by most recent update.';
