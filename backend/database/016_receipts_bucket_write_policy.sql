-- ============================================================================
-- CAPITAL RADIOLOGY — Migration 016: receipts bucket write policy
-- Run in Supabase SQL Editor AFTER schema.sql (and 002-015).
--
-- schema.sql (section 6) created the `receipts` bucket with a read policy
-- (`receipts_read`) but never an insert/write policy — nothing could
-- actually upload a receipt. Mirrors `dicom_staff_write`'s shape exactly:
-- staff-only upload, matching who can currently call markBillPaid in the
-- mock UI (staff/admin marking a bill as paid and generating the receipt;
-- resolve_insurance_claim in 015_appointment_billing_rpcs.sql, admin-only
-- via billing_admin_write, generates the receipt_url path the same way on
-- claim approval).
-- ============================================================================

drop policy if exists "receipts_staff_write" on storage.objects;
create policy "receipts_staff_write" on storage.objects
  for insert with check (bucket_id = 'receipts' and public.is_staff());

-- ============================================================================
-- END OF MIGRATION 016
-- ============================================================================
