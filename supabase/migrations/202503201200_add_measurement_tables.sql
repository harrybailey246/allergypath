-- Clinical measurement tables for lab and device data.
create table if not exists public.lab_results (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  panel_name text,
  analyte text not null,
  result_value numeric,
  result_unit text,
  reference_low numeric,
  reference_high numeric,
  reference_text text,
  collected_at timestamptz,
  resulted_at timestamptz,
  method text,
  lab_name text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists lab_results_submission_idx on public.lab_results (submission_id);
create index if not exists lab_results_analyte_idx on public.lab_results (lower(analyte));

create table if not exists public.device_readings (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  device_type text not null,
  measurement_type text not null,
  measurement_value numeric,
  measurement_unit text,
  measurement_time timestamptz,
  reference_predicted numeric,
  reference_percent numeric,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists device_readings_submission_idx on public.device_readings (submission_id);
create index if not exists device_readings_type_idx on public.device_readings (lower(measurement_type));

create table if not exists public.skin_tests (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  allergen text not null,
  wheal_mm numeric,
  flare_mm numeric,
  control_wheal_mm numeric,
  measurement_time timestamptz,
  method text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists skin_tests_submission_idx on public.skin_tests (submission_id);
create index if not exists skin_tests_allergen_idx on public.skin_tests (lower(allergen));

-- Enable row level security for clinician/patient scoped access.
alter table public.lab_results enable row level security;
alter table public.device_readings enable row level security;
alter table public.skin_tests enable row level security;

-- Shared predicate for patient vs clinician access mirroring submissions visibility.
do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'lab_results' and policyname = 'lab-results-select'
  ) then
    create policy "lab-results-select"
      on public.lab_results
      for select
      using (
        exists (
          select 1
            from public.submissions s
           where s.id = submission_id
             and (
               lower(s.email) = lower(coalesce(auth.email(), ''))
               or s.clinician_id = auth.uid()
               or lower(coalesce(s.clinician_email, '')) = lower(coalesce(auth.email(), ''))
             )
        )
        or public.has_staff_role(array['admin','clinician'])
      );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'lab_results' and policyname = 'lab-results-manage'
  ) then
    create policy "lab-results-manage"
      on public.lab_results
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
     where schemaname = 'public' and tablename = 'device_readings' and policyname = 'device-readings-select'
  ) then
    create policy "device-readings-select"
      on public.device_readings
      for select
      using (
        exists (
          select 1
            from public.submissions s
           where s.id = submission_id
             and (
               lower(s.email) = lower(coalesce(auth.email(), ''))
               or s.clinician_id = auth.uid()
               or lower(coalesce(s.clinician_email, '')) = lower(coalesce(auth.email(), ''))
             )
        )
        or public.has_staff_role(array['admin','clinician'])
      );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'device_readings' and policyname = 'device-readings-manage'
  ) then
    create policy "device-readings-manage"
      on public.device_readings
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
     where schemaname = 'public' and tablename = 'skin_tests' and policyname = 'skin-tests-select'
  ) then
    create policy "skin-tests-select"
      on public.skin_tests
      for select
      using (
        exists (
          select 1
            from public.submissions s
           where s.id = submission_id
             and (
               lower(s.email) = lower(coalesce(auth.email(), ''))
               or s.clinician_id = auth.uid()
               or lower(coalesce(s.clinician_email, '')) = lower(coalesce(auth.email(), ''))
             )
        )
        or public.has_staff_role(array['admin','clinician'])
      );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'skin_tests' and policyname = 'skin-tests-manage'
  ) then
    create policy "skin-tests-manage"
      on public.skin_tests
      for all
      using (public.has_staff_role(array['admin','clinician']))
      with check (public.has_staff_role(array['admin','clinician']));
  end if;
end;
$$;

-- Outcome analytics helpers.
create or replace view public.analytics_outcomes_lab as
select
  lower(l.analyte) as analyte_key,
  coalesce(nullif(trim(l.panel_name), ''), l.analyte) as display_name,
  count(*) as measurement_count,
  count(distinct l.submission_id) as patient_count,
  avg(l.result_value) as avg_value,
  min(l.result_value) as min_value,
  max(l.result_value) as max_value
from public.lab_results l
where l.result_value is not null
  and l.analyte is not null
  and l.analyte <> ''
group by analyte_key, display_name;

create or replace view public.analytics_outcomes_device as
select
  lower(d.measurement_type) as measurement_type,
  count(*) as measurement_count,
  count(distinct d.submission_id) as patient_count,
  avg(d.measurement_value) as avg_value,
  percentile_cont(0.5) within group (order by d.measurement_value) as median_value,
  percentile_cont(0.9) within group (order by d.measurement_value) as p90_value
from public.device_readings d
where d.measurement_value is not null
  and d.measurement_type is not null
  and d.measurement_type <> ''
group by measurement_type;

create or replace view public.analytics_outcomes_skin as
select
  lower(s.allergen) as allergen_key,
  s.allergen as display_name,
  count(*) as measurement_count,
  count(distinct s.submission_id) as patient_count,
  avg(s.wheal_mm) as avg_wheal_mm,
  avg(s.flare_mm) as avg_flare_mm,
  percentile_cont(0.5) within group (order by s.wheal_mm) as median_wheal_mm
from public.skin_tests s
where s.allergen is not null
  and s.allergen <> ''
  and s.wheal_mm is not null
group by allergen_key, display_name;
