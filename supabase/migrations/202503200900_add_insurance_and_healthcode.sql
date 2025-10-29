-- Insurance + Healthcode workflow support

-- Extend submissions with payer + policy metadata
alter table public.submissions
  add column if not exists payer_name text,
  add column if not exists payer_reference text,
  add column if not exists payer_phone text,
  add column if not exists payer_email text,
  add column if not exists policy_holder text,
  add column if not exists policy_number text,
  add column if not exists policy_group text,
  add column if not exists policy_effective_date date,
  add column if not exists policy_expiration_date date,
  add column if not exists pre_auth_status text not null default 'not_requested',
  add column if not exists pre_auth_reference text,
  add column if not exists pre_auth_last_checked timestamptz;

-- Constrain pre_auth_status values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'public.submissions'::regclass
       AND conname = 'submissions_pre_auth_status_check'
  ) THEN
    ALTER TABLE public.submissions
      ADD CONSTRAINT submissions_pre_auth_status_check
      CHECK (pre_auth_status IN (
        'not_requested',
        'draft',
        'submitted',
        'pending',
        'needs_info',
        'approved',
        'denied',
        'cancelled'
      ));
  END IF;
END;
$$;

-- Claim note ledger for insurer communications
create table if not exists public.submission_claim_notes (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  author_id uuid,
  author_email text,
  template_key text,
  note text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists submission_claim_notes_submission_idx
  on public.submission_claim_notes (submission_id);

alter table public.submission_claim_notes enable row level security;

drop policy if exists "submission-claim-notes-select" on public.submission_claim_notes;
create policy "submission-claim-notes-select"
  on public.submission_claim_notes
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
           or public.has_staff_role(array['admin','clinician'])
         )
    )
  );

drop policy if exists "submission-claim-notes-manage" on public.submission_claim_notes;
create policy "submission-claim-notes-manage"
  on public.submission_claim_notes
  for all
  using (
    exists (
      select 1
        from public.submissions s
       where s.id = submission_id
         and (
           s.clinician_id = auth.uid()
           or lower(coalesce(s.clinician_email, '')) = lower(coalesce(auth.email(), ''))
           or public.has_staff_role(array['admin','clinician'])
         )
    )
  )
  with check (
    exists (
      select 1
        from public.submissions s
       where s.id = submission_id
         and (
           s.clinician_id = auth.uid()
           or lower(coalesce(s.clinician_email, '')) = lower(coalesce(auth.email(), ''))
           or public.has_staff_role(array['admin','clinician'])
         )
    )
  );

-- Pre-authorisation request tracking
create table if not exists public.submission_pre_auth_requests (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  request_type text not null default 'initial',
  requested_at timestamptz not null default timezone('utc', now()),
  requested_by uuid,
  requested_by_email text,
  status text not null default 'draft',
  status_notes text,
  request_payload jsonb,
  payer_reference text,
  response_notes text,
  response_received_at timestamptz,
  updated_at timestamptz not null default timezone('utc', now()),
  metadata jsonb
);

create index if not exists submission_pre_auth_requests_submission_idx
  on public.submission_pre_auth_requests (submission_id);

alter table public.submission_pre_auth_requests enable row level security;

drop policy if exists "pre-auth-requests-select" on public.submission_pre_auth_requests;
create policy "pre-auth-requests-select"
  on public.submission_pre_auth_requests
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
           or public.has_staff_role(array['admin','clinician'])
         )
    )
  );

drop policy if exists "pre-auth-requests-manage" on public.submission_pre_auth_requests;
create policy "pre-auth-requests-manage"
  on public.submission_pre_auth_requests
  for all
  using (
    exists (
      select 1
        from public.submissions s
       where s.id = submission_id
         and (
           s.clinician_id = auth.uid()
           or lower(coalesce(s.clinician_email, '')) = lower(coalesce(auth.email(), ''))
           or public.has_staff_role(array['admin','clinician'])
         )
    )
  )
  with check (
    exists (
      select 1
        from public.submissions s
       where s.id = submission_id
         and (
           s.clinician_id = auth.uid()
           or lower(coalesce(s.clinician_email, '')) = lower(coalesce(auth.email(), ''))
           or public.has_staff_role(array['admin','clinician'])
         )
    )
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'public.submission_pre_auth_requests'::regclass
       AND conname = 'submission_pre_auth_requests_status_check'
  ) THEN
    ALTER TABLE public.submission_pre_auth_requests
      ADD CONSTRAINT submission_pre_auth_requests_status_check
      CHECK (status IN (
        'draft',
        'submitted',
        'pending',
        'approved',
        'denied',
        'needs_info',
        'cancelled'
      ));
  END IF;
END;
$$;

-- Healthcode export batches
create table if not exists public.healthcode_export_batches (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc', now()),
  exported_at timestamptz,
  exported_by uuid,
  exported_by_email text,
  status text not null default 'pending',
  submission_count integer not null default 0 check (submission_count >= 0),
  audit_file_path text,
  audit_signed_url text,
  metadata jsonb,
  error text
);

create index if not exists healthcode_export_batches_status_idx
  on public.healthcode_export_batches (status);

alter table public.healthcode_export_batches enable row level security;

drop policy if exists "healthcode-export-batches-select" on public.healthcode_export_batches;
create policy "healthcode-export-batches-select"
  on public.healthcode_export_batches
  for select
  using (public.has_staff_role(array['admin','clinician']));

drop policy if exists "healthcode-export-batches-manage" on public.healthcode_export_batches;
create policy "healthcode-export-batches-manage"
  on public.healthcode_export_batches
  for all
  using (public.has_staff_role(array['admin','clinician']))
  with check (public.has_staff_role(array['admin','clinician']));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'public.healthcode_export_batches'::regclass
       AND conname = 'healthcode_export_batches_status_check'
  ) THEN
    ALTER TABLE public.healthcode_export_batches
      ADD CONSTRAINT healthcode_export_batches_status_check
      CHECK (status IN ('pending','exported','failed'));
  END IF;
END;
$$;

-- Submission-level export log
create table if not exists public.submission_healthcode_exports (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.healthcode_export_batches(id) on delete cascade,
  submission_id uuid not null references public.submissions(id) on delete cascade,
  payload jsonb not null,
  export_status text not null default 'queued',
  exported_at timestamptz not null default timezone('utc', now()),
  response jsonb,
  audit_reference text,
  error text
);

create unique index if not exists submission_healthcode_exports_unique
  on public.submission_healthcode_exports (batch_id, submission_id);

create index if not exists submission_healthcode_exports_submission_idx
  on public.submission_healthcode_exports (submission_id);

alter table public.submission_healthcode_exports enable row level security;

drop policy if exists "healthcode-exports-select" on public.submission_healthcode_exports;
create policy "healthcode-exports-select"
  on public.submission_healthcode_exports
  for select
  using (
    exists (
      select 1
        from public.submissions s
       where s.id = submission_id
         and (
           s.clinician_id = auth.uid()
           or lower(coalesce(s.clinician_email, '')) = lower(coalesce(auth.email(), ''))
           or public.has_staff_role(array['admin','clinician'])
         )
    )
  );

drop policy if exists "healthcode-exports-manage" on public.submission_healthcode_exports;
create policy "healthcode-exports-manage"
  on public.submission_healthcode_exports
  for all
  using (
    exists (
      select 1
        from public.submissions s
       where s.id = submission_id
         and (
           s.clinician_id = auth.uid()
           or lower(coalesce(s.clinician_email, '')) = lower(coalesce(auth.email(), ''))
           or public.has_staff_role(array['admin','clinician'])
         )
    )
  )
  with check (
    exists (
      select 1
        from public.submissions s
       where s.id = submission_id
         and (
           s.clinician_id = auth.uid()
           or lower(coalesce(s.clinician_email, '')) = lower(coalesce(auth.email(), ''))
           or public.has_staff_role(array['admin','clinician'])
         )
    )
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'public.submission_healthcode_exports'::regclass
       AND conname = 'submission_healthcode_exports_status_check'
  ) THEN
    ALTER TABLE public.submission_healthcode_exports
      ADD CONSTRAINT submission_healthcode_exports_status_check
      CHECK (export_status IN ('queued','exported','failed'));
  END IF;
END;
$$;

-- Bucket to store audit artefacts
insert into storage.buckets (id, name, public)
  values ('healthcode-audits', 'healthcode-audits', false)
  on conflict (id) do nothing;

-- Allow clinicians/admins to read audit artefacts via signed URLs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_policies
     WHERE policyname = 'healthcode-audits-select'
       AND schemaname = 'storage'
       AND tablename = 'objects'
  ) THEN
    CREATE POLICY "healthcode-audits-select"
      ON storage.objects
      FOR SELECT
      USING (
        bucket_id = 'healthcode-audits'
        AND public.has_staff_role(array['admin','clinician'])
      );
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_policies
     WHERE policyname = 'healthcode-audits-insert'
       AND schemaname = 'storage'
       AND tablename = 'objects'
  ) THEN
    CREATE POLICY "healthcode-audits-insert"
      ON storage.objects
      FOR INSERT
      WITH CHECK (bucket_id = 'healthcode-audits');
  END IF;
END;
$$;
