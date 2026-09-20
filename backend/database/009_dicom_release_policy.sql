-- ============================================================================
-- CAPITAL RADIOLOGY — Migration 009: DICOM image release to patient + internal
-- referring doctor only, admin excluded
-- Run in Supabase SQL Editor AFTER schema.sql (and 002-008 if used).
--
-- Previously the `dicom` bucket's read policy was "any staff member" (which,
-- after migration 008, meant technician/radiologist/admin/super_admin) or
-- the uploading technician themselves — patients and referring doctors had
-- no real read access to the actual stored file at all (the patient
-- dashboard's "Download DICOM" button generates a mock export client-side
-- instead). This migration:
--   1. Removes admin/super_admin from image read access entirely — clinical
--      images are not operational data, same principle already applied to
--      the AI assistant's admin scope (aggregate counts only, never patient
--      content).
--   2. Grants real read access to the patient the scan belongs to, and to
--      the appointment's referring doctor — but ONLY once the radiologist
--      has finalized the report ("released"), and ONLY for an INTERNAL
--      referring doctor (employed under Capital Radiology, provisioned
--      directly by super_admin via the Staff Accounts panel — see
--      database/008_super_admin.sql). An EXTERNAL referring doctor (came
--      through the request-then-approve queue in
--      database/004_referring_doctor_requests.sql, and so has a row in
--      referring_doctor_details) gets no image access — the patient can
--      share it with their own GP themselves if they choose to, same as the
--      real-world default-deny-share-yourself model this app already uses
--      for Path B referrals.
-- Technicians and radiologists keep broad read access (their job requires
-- seeing any scan, not just ones assigned to them — FR21 assignment is
-- informational, not a hard gate, per store.tsx).
-- ============================================================================

drop policy if exists "dicom_staff_rw_patient_r" on storage.objects;

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
        where s.dicom_image_url = 'dicom/' || storage.objects.name
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

-- Upload stays technician-only in practice (only technicians ever call
-- logScan), but is_staff() already excludes nobody that should be excluded
-- here — writing an image isn't the same sensitivity as reading one, so
-- this policy is intentionally left as-is (still using is_staff(), which
-- includes admin/super_admin for write) unless you want that tightened too.

-- ============================================================================
-- END OF MIGRATION 009
-- ============================================================================
