-- Lab orders and lab order event audit trail.

create table if not exists public.lab_orders (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid references public.submissions(id) on delete set null,
  patient_full_name text,
  patient_email text,
  patient_date_of_birth date,
  ordering_clinician_id uuid,
  ordering_clinician_email text,
  order_type text,
  priority text default 'routine',
  vendor text,
  order_status text not null default 'draft' check (
    order_status in (
      'draft',
      'submitted',
      'in_transit',
      'results_received',
      'results_reviewed',
      'retransmit_requested',
      'cancelled'
    )
  ),
  external_order_id text,
  metadata jsonb not null default '{}'::jsonb,
  ordered_at timestamptz default timezone('utc', now()),
  result_received_at timestamptz,
  result_reviewed_at timestamptz,
  last_status_at timestamptz default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists lab_orders_submission_idx on public.lab_orders (submission_id);
create index if not exists lab_orders_status_idx on public.lab_orders (order_status);
create index if not exists lab_orders_external_idx on public.lab_orders (external_order_id);
create index if not exists lab_orders_vendor_idx on public.lab_orders (vendor);

create table if not exists public.lab_order_events (
  id uuid primary key default gen_random_uuid(),
  lab_order_id uuid not null references public.lab_orders(id) on delete cascade,
  event_type text not null,
  event_status text,
  external_event_id text,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default timezone('utc', now()),
  actor_email text,
  note text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists lab_order_events_order_idx on public.lab_order_events (lab_order_id);
create index if not exists lab_order_events_type_idx on public.lab_order_events (event_type);
create index if not exists lab_order_events_occurred_idx on public.lab_order_events (occurred_at desc);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists set_lab_orders_updated on public.lab_orders;
create trigger set_lab_orders_updated
  before update on public.lab_orders
  for each row
  execute function public.touch_updated_at();

alter table public.lab_orders enable row level security;
alter table public.lab_order_events enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'lab_orders'
       and policyname = 'lab-orders-select'
  ) then
    create policy "lab-orders-select"
      on public.lab_orders
      for select
      using (public.has_staff_role(array['admin','clinician']));
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'lab_orders'
       and policyname = 'lab-orders-manage'
  ) then
    create policy "lab-orders-manage"
      on public.lab_orders
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
       and tablename = 'lab_order_events'
       and policyname = 'lab-order-events-select'
  ) then
    create policy "lab-order-events-select"
      on public.lab_order_events
      for select
      using (
        exists (
          select 1
            from public.lab_orders lo
           where lo.id = lab_order_id
             and public.has_staff_role(array['admin','clinician'])
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'lab_order_events'
       and policyname = 'lab-order-events-manage'
  ) then
    create policy "lab-order-events-manage"
      on public.lab_order_events
      for all
      using (
        exists (
          select 1
            from public.lab_orders lo
           where lo.id = lab_order_id
             and public.has_staff_role(array['admin','clinician'])
        )
      )
      with check (
        exists (
          select 1
            from public.lab_orders lo
           where lo.id = lab_order_id
             and public.has_staff_role(array['admin','clinician'])
        )
      );
  end if;
end;
$$;
