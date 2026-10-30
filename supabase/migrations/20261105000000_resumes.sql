-- Resumes: one row per application's tailored resume (or the untailored
-- fallback when tailoring didn't pass the fact guard), plus the resume text
-- imported from the old app for reference. The PDF lives in the private
-- `resumes` Storage bucket; sha256 is the hash of the exact file (M6 records
-- it with the submission).

alter table resumes add column kind text not null default 'imported'
  check (kind in ('imported','tailored','fallback'));
update resumes set kind = 'imported';
alter table resumes alter column kind drop default;
alter table resumes drop column is_master;
alter table resumes
  add column application_id uuid unique references applications(id) on delete cascade,
  add column pdf_path text,
  add column sha256 text,
  add column guard_problems jsonb not null default '[]',
  add constraint resumes_application_kind check ((application_id is null) = (kind = 'imported'));

alter table applications drop column resume_pdf_path, drop column resume_content;

-- Private bucket; the owner reads files (signed URLs come from the server).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('resumes', 'resumes', false, 5242880, array['application/pdf'])
on conflict (id) do nothing;

create policy resumes_owner_read on storage.objects
  for select to authenticated using (bucket_id = 'resumes' and is_owner());
