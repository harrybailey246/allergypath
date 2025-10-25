-- Allow patients to include final notes without breaking submissions inserts.
alter table public.submissions
  add column if not exists patient_notes text;
