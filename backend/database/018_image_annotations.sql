-- ============================================================================
-- CAPITAL RADIOLOGY — Migration 018: image annotations
-- Run in Supabase SQL Editor AFTER schema.sql (and 002-017).
--
-- Phase 5a of moving off frontend/lib/store.tsx mock data onto real Supabase
-- persistence. Ports the `annotations` mock array (written by addAnnotation
-- / removeAnnotation ~lines 579-599, `ImageAnnotation` in shared/types.ts —
-- a radiologist's point annotation on a DICOM viewer slice, FR27) into a
-- real table. No side effects on insert/delete beyond the row itself (the
-- mock only writes an audit-log entry on add, which is a phase-10 concern
-- same as elsewhere in this project).
--
-- RLS mirrors mri_images (schema.sql 5, "mri_images") exactly, substituting
-- image_annotations for mri_images: staff can read/write any row; a patient
-- can read (but never write) annotations on their own scans via the same
-- scan -> appointment -> patient join.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. image_annotations table
-- ----------------------------------------------------------------------------
create table public.image_annotations (
  id          uuid primary key default uuid_generate_v4(),
  scan_id     uuid not null references public.mri_scans (id) on delete cascade,
  author_id   uuid references public.profiles (id) on delete set null,
  x           numeric not null,
  y           numeric not null,
  note        text not null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_image_annotations_scan on public.image_annotations (scan_id);

-- ----------------------------------------------------------------------------
-- 2. RLS — mirrors mri_images_read / mri_images_staff_write
-- ----------------------------------------------------------------------------
alter table public.image_annotations enable row level security;

drop policy if exists "image_annotations_read" on public.image_annotations;
create policy "image_annotations_read" on public.image_annotations
  for select using (
    public.is_staff()
    or exists (
      select 1 from public.mri_scans s
      join public.appointments a on a.id = s.appointment_id
      where s.id = scan_id and a.patient_id = auth.uid()
    )
  );

drop policy if exists "image_annotations_staff_write" on public.image_annotations;
create policy "image_annotations_staff_write" on public.image_annotations
  for all using (public.is_staff()) with check (public.is_staff());

-- ============================================================================
-- END OF MIGRATION 018
-- ============================================================================
