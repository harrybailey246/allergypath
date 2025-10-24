-- Replace the storage attachment accessibility helper with logic that no longer relies on
-- a local record variable so we never risk dereferencing an unassigned "pick" value.
create or replace function public.storage_attachment_is_accessible(bucket text, object_name text)
returns boolean
security definer
language plpgsql
set search_path = public, extensions
as $$
declare
  submission_id uuid;
  requester_email text;
begin
  if bucket <> 'attachments' then
    return true;
  end if;

  requester_email := current_setting('request.jwt.claim.email', true);

  begin
    submission_id := split_part(object_name, '/', 1)::uuid;
  exception when others then
    return false;
  end;

  return requester_email is not null
     and exists (
       select 1
         from public.submissions s
        where s.id = submission_id
          and s.email is not null
          and lower(s.email) = lower(requester_email)
     );
end;
$$;

drop policy if exists "patients-manage-own-attachments" on storage.objects;
create policy "patients-manage-own-attachments"
  on storage.objects
  for all
  using (public.storage_attachment_is_accessible(bucket_id, name))
  with check (public.storage_attachment_is_accessible(bucket_id, name));
