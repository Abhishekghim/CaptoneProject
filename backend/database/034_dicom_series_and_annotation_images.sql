-- ============================================================================
-- CAPITAL RADIOLOGY — Migration 034: multi-file DICOM series + per-image pins
-- Run in the Supabase SQL Editor AFTER 009 and 018.
--
-- 1. mri_scans.dicom_image_url can now hold either one file
--    ('dicom/<owner>/<file>.dcm', as before) or a whole series folder with a
--    trailing slash ('dicom/<owner>/<ts>-<label>/'). The technician upload
--    stores every image of a series in that folder.
--    Staff access is unchanged. The released-to-patient / internal-referrer
--    read rule from migration 009 only matched the exact file path, so it is
--    extended to objects inside a series folder.
-- 2. image_annotations gain the DICOM image a pin was placed on
--    (SOP Instance UID, plus the 1-based frame for multi-frame instances), so
--    a pin shows on its own slice instead of on every slice. Existing pins
--    keep NULLs and are shown as "not linked to a specific image".
-- The app works before this migration is applied: staff can view series,
-- and new pins fall back to unlinked pins with a notice.
-- ============================================================================

alter table public.image_annotations
  add column if not exists sop_instance_uid text,
  add column if not exists frame_number integer check (frame_number is null or frame_number >= 1);

drop policy if exists "dicom_read" on storage.objects;

create policy "dicom_read" on storage.objects
  for select using (
    bucket_id = 'dicom'
    and (
      public.get_user_role() in ('technician', 'radiologist')
      or exists (
        select 1
        from public.mri_scans s
        join public.appointments a on a.id = s.appointment_id
        join public.radiology_reports r on r.scan_id = s.id
        where (
            s.dicom_image_url = 'dicom/' || storage.objects.name
            or (
              right(s.dicom_image_url, 1) = '/'
              and starts_with('dicom/' || storage.objects.name, s.dicom_image_url)
            )
          )
          and r.status = 'finalized'
          and (
            a.patient_id = auth.uid()
            or (
              a.referring_doctor_id = auth.uid()
              and not exists (
                select 1 from public.referring_doctor_details d where d.profile_id = a.referring_doctor_id
              )
            )
          )
      )
    )
  );

-- ============================================================================
-- END OF MIGRATION 034
-- ============================================================================
