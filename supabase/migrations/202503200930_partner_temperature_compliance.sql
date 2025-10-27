-- Partner stock metadata enrichment and temperature logging

alter table if exists public.partner_stock_levels
  add column if not exists lot_number text,
  add column if not exists expiry_date date,
  add column if not exists manufacturer text,
  add column if not exists storage_location text,
  add column if not exists min_temp numeric(5,2),
  add column if not exists max_temp numeric(5,2),
  add constraint partner_stock_levels_temp_range_chk
    check (
      min_temp is null
      or max_temp is null
      or min_temp <= max_temp
    );

create table if not exists public.partner_temperature_logs (
  id uuid primary key default gen_random_uuid(),
  stock_id uuid references public.partner_stock_levels(id) on delete set null,
  storage_location text not null,
  recorded_at timestamptz not null default timezone('utc', now()),
  temperature_c numeric(6,3) not null,
  is_excursion boolean not null default false,
  excursion_reason text,
  resolved_at timestamptz,
  notes text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists partner_temperature_logs_recorded_at_idx
  on public.partner_temperature_logs (recorded_at desc);

create index if not exists partner_temperature_logs_stock_idx
  on public.partner_temperature_logs (stock_id, recorded_at desc);

alter table public.partner_temperature_logs enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'partner_temperature_logs'
       and policyname = 'partner-temperature-logs-select'
  ) then
    create policy "partner-temperature-logs-select"
      on public.partner_temperature_logs
      for select
      using (public.has_partner_portal_access());
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'partner_temperature_logs'
       and policyname = 'partner-temperature-logs-manage'
  ) then
    create policy "partner-temperature-logs-manage"
      on public.partner_temperature_logs
      for all
      using (public.has_staff_role(array['admin','clinician']))
      with check (public.has_staff_role(array['admin','clinician']));
  end if;
end;
$$;
