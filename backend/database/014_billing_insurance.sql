-- ============================================================================
-- CAPITAL RADIOLOGY — Migration 014: billing — insurance claims workflow
-- Run in Supabase SQL Editor AFTER schema.sql (and 002-013).
--
-- Phase 3a of moving off frontend/lib/store.tsx mock data onto real Supabase
-- persistence — Billing insurance claims (FR38). Replaces the single
-- `insurance_ref` free-text column with the richer claim-lifecycle columns
-- already on the Billing type in shared/types.ts (insurance_claim_number,
-- insurance_claim_status, insurance_submitted_at, insurance_resolved_at,
-- insurance_note), matching submitInsuranceClaim / resolveInsuranceClaim in
-- frontend/lib/store.tsx.
--
-- `insurance_ref` is confirmed unused anywhere else in backend/database/
-- (only its own column definition in schema.sql, section 2.6) before being
-- dropped here.
-- ============================================================================

alter table public.billing add column if not exists insurance_claim_number text;
alter table public.billing add column if not exists insurance_claim_status text not null default 'not_submitted'
  check (insurance_claim_status in ('not_submitted', 'submitted', 'approved', 'rejected'));
alter table public.billing add column if not exists insurance_submitted_at timestamptz;
alter table public.billing add column if not exists insurance_resolved_at timestamptz;
alter table public.billing add column if not exists insurance_note text;
alter table public.billing drop column if exists insurance_ref; -- superseded by the richer claim fields above

-- ============================================================================
-- END OF MIGRATION 014
-- ============================================================================
