-- Ensure attachments policies and helpers never reference an unassigned "pick" record.
-- This migration replaces the helper used by the storage policy with a guarded implementation
-- that only dereferences the local "pick" variable after a successful SELECT ... INTO.

create or replace function public.storage_attachment_is_accessible(bucket text, object_name text)
returns boolean
security definer
language plpgsql
set search_path = public, extensions
as $$
declare
  pick public.submissions%rowtype;
  submission_id uuid;
  requester_email text;
begin
  -- Only guard attachments bucket; other buckets defer to existing RLS.
  if bucket <> 'attachments' then
    return true;
  end if;

  requester_email := current_setting('request.jwt.claim.email', true);

  begin
    submission_id := split_part(object_name, '/', 1)::uuid;
  exception when others then
    return false;
  end;

  select *
    into pick
    from public.submissions
   where id = submission_id;

  if not found then
    -- Nothing to check against → deny to avoid dereferencing a null "pick".
    return false;
  end if;

  return pick.email is not null
         and requester_email is not null
         and lower(pick.email) = lower(requester_email);
end;
$$;

-- Align both USING and WITH CHECK clauses with the guarded helper so uploads/reads are consistent.
drop policy if exists "patients-manage-own-attachments" on storage.objects;
create policy "patients-manage-own-attachments"
  on storage.objects
  for all
  using (public.storage_attachment_is_accessible(bucket_id, name))
  with check (public.storage_attachment_is_accessible(bucket_id, name));
