-- Create audit log table capturing clinician actions on submissions
create table if not exists public.audit_logs (
    id bigserial primary key,
    submission_id uuid not null references public.submissions(id) on delete cascade,
    actor_id uuid references auth.users(id),
    action text not null,
    payload jsonb not null default '{}'::jsonb,
    occurred_at timestamptz not null default timezone('utc', now())
);

create index if not exists audit_logs_submission_idx on public.audit_logs (submission_id, occurred_at desc);

alter table public.audit_logs enable row level security;

-- Service role (used by Edge functions) inserts audit records
create policy "Audit logs writable by service role" on public.audit_logs
  for insert
  with check (auth.role() = 'service_role');

-- Clinicians assigned to a submission or administrators can read audit history
create policy "Clinicians and admins can read audit logs" on public.audit_logs
  for select
  using (
    (
      exists (
        select 1
        from public.submissions s
        where s.id = audit_logs.submission_id
          and s.clinician_id = auth.uid()
      )
    )
    or coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), '') in ('admin', 'clinician_admin')
  );

-- Admins may also inspect logs for governance reviews
create policy "Admins can manage audit logs" on public.audit_logs
  for delete
  using (coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'admin');
