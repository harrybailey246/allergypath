create table if not exists public.appointment_requests (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  appointment_id uuid references public.appointments(id) on delete set null,
  patient_email text,
  request_type text not null check (request_type in ('reschedule', 'cancel', 'other')),
  message text,
  status text not null default 'pending',
  handled_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists appointment_requests_submission_idx on public.appointment_requests (submission_id);
create index if not exists appointment_requests_status_idx on public.appointment_requests (status);

alter table public.appointment_requests enable row level security;

drop policy if exists "appointment-requests-select" on public.appointment_requests;
create policy "appointment-requests-select"
  on public.appointment_requests
  for select
  using (
    exists (
      select 1
        from public.submissions s
       where s.id = submission_id
         and (
           lower(s.email) = lower(auth.email())
           or s.clinician_id = auth.uid()
           or lower(coalesce(s.clinician_email, '')) = lower(coalesce(auth.email(), ''))
         )
    )
  );

drop policy if exists "appointment-requests-insert" on public.appointment_requests;
create policy "appointment-requests-insert"
  on public.appointment_requests
  for insert
  with check (
    lower(coalesce(patient_email, '')) = lower(coalesce(auth.email(), ''))
    and exists (
      select 1
        from public.submissions s
       where s.id = submission_id
         and lower(s.email) = lower(auth.email())
    )
  );

drop policy if exists "appointment-requests-update" on public.appointment_requests;
create policy "appointment-requests-update"
  on public.appointment_requests
  for update
  using (
    exists (
      select 1
        from public.submissions s
       where s.id = submission_id
         and (
           s.clinician_id = auth.uid()
           or lower(coalesce(s.clinician_email, '')) = lower(coalesce(auth.email(), ''))
         )
    )
  );
