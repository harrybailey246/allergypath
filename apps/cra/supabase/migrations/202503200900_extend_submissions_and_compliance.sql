-- Extend submissions with safeguarding + consent metadata and create storage helpers.
alter table public.submissions
  add column if not exists guardian_contacts jsonb not null default '[]'::jsonb,
  add column if not exists consent_signed_at timestamptz,
  add column if not exists consent_expires_at timestamptz,
  add column if not exists safeguarding_notes text,
  add column if not exists safeguarding_follow_up_at timestamptz,
  add column if not exists document_references jsonb not null default '[]'::jsonb;

create table if not exists public.action_plans (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  category text not null default 'general',
  storage_path text not null,
  uploaded_by uuid references auth.users(id),
  uploaded_email text,
  created_at timestamptz not null default now()
);

create index if not exists action_plans_submission_idx on public.action_plans(submission_id);

create table if not exists public.compliance_tasks (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid references public.submissions(id) on delete cascade,
  task_type text not null,
  title text not null,
  details text,
  due_at timestamptz,
  status text not null default 'open',
  metadata jsonb not null default '{}'::jsonb,
  resolution_notes text,
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists compliance_tasks_submission_idx on public.compliance_tasks(submission_id);
create index if not exists compliance_tasks_status_due_idx on public.compliance_tasks(status, due_at);

create or replace function public.touch_compliance_tasks()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger compliance_tasks_touch
before update on public.compliance_tasks
for each row execute function public.touch_compliance_tasks();

create unique index if not exists compliance_tasks_unique_open on public.compliance_tasks(submission_id, task_type)
where status = 'open';
