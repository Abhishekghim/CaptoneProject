-- ============================================================================
-- CAPITAL RADIOLOGY — Migration 011: CMS content (static pages, announcements,
-- prep instructions, scan pricing)
-- Run in Supabase SQL Editor AFTER schema.sql (and 002-010).
--
-- Phase 1 of moving off frontend/lib/seed.ts mock data onto real Supabase
-- persistence — Content Management module only (FR75-78). Replaces
-- SEED_CONTENT_PAGES / SEED_ANNOUNCEMENTS / SEED_PREP_INSTRUCTIONS /
-- SCAN_PRICES and the store.tsx mutators that edited them in memory
-- (updateContentPage, addAnnouncement, toggleAnnouncement,
-- updatePrepInstruction, updateScanPrice). Any authenticated user can read
-- (patients need this for viewing prep instructions/static pages/pricing);
-- only admin can write — matches who could call the mock mutators today.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. TABLES
-- ----------------------------------------------------------------------------

-- content_pages — the 3 static pages the patient portal renders (About /
-- Contact / FAQ). Restricted to the exact set ContentPageId allows in
-- shared/types.ts so a typo can never silently create a 4th untyped page.
create table if not exists public.content_pages (
  id          text primary key check (id in ('about', 'contact', 'faq')),
  title       text not null,
  body        text not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles (id) on delete set null
);

create table if not exists public.announcements (
  id          uuid primary key default uuid_generate_v4(),
  title       text not null,
  message     text not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- prep_instructions — keyed by body_part (matches PrepInstruction in
-- shared/types.ts, which has no separate id), one row per scan type.
create table if not exists public.prep_instructions (
  body_part     text primary key,
  instructions  text not null,
  updated_at    timestamptz not null default now()
);

-- scan_prices — keyed by body_part, same shape as the mock SCAN_PRICES map.
create table if not exists public.scan_prices (
  body_part   text primary key,
  price       numeric(10,2) not null check (price >= 0),
  updated_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 2. TRIGGERS — reuse the shared touch_updated_at()/write_audit() functions
-- from schema.sql (section 4.3/4.4) rather than redefining them.
-- ----------------------------------------------------------------------------

drop trigger if exists trg_content_pages_touch on public.content_pages;
create trigger trg_content_pages_touch before update on public.content_pages
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_prep_instructions_touch on public.prep_instructions;
create trigger trg_prep_instructions_touch before update on public.prep_instructions
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_scan_prices_touch on public.scan_prices;
create trigger trg_scan_prices_touch before update on public.scan_prices
  for each row execute function public.touch_updated_at();

-- announcements has no updated_at column (matches Announcement in
-- shared/types.ts — created_at only, toggled active in place), so it gets no
-- touch_updated_at() trigger.

drop trigger if exists trg_audit_content_pages on public.content_pages;
create trigger trg_audit_content_pages
  after insert or update or delete on public.content_pages
  for each row execute function public.write_audit();

drop trigger if exists trg_audit_announcements on public.announcements;
create trigger trg_audit_announcements
  after insert or update or delete on public.announcements
  for each row execute function public.write_audit();

-- write_audit() (schema.sql 4.4) reads NEW/OLD.id directly, which
-- prep_instructions and scan_prices don't have — both are keyed by
-- body_part only, matching the PrepInstruction/SCAN_PRICES shape in
-- shared/types.ts and frontend/lib/seed.ts (no synthetic id column). Rather
-- than redefine write_audit() itself (which content_pages/announcements
-- above already rely on) or add an id column that doesn't exist anywhere in
-- the TypeScript model, this is a minimal sibling using body_part as
-- entity_id — same audit_logs shape, same security-definer pattern.
create or replace function public.write_audit_body_part()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.audit_logs (user_id, action, entity, entity_id, details)
  values (
    auth.uid(),
    tg_op || '_' || upper(tg_table_name),
    tg_table_name,
    coalesce(case when tg_op = 'DELETE' then old.body_part else new.body_part end, 'n/a'),
    case when tg_op = 'DELETE'
         then jsonb_build_object('old', to_jsonb(old))
         else jsonb_build_object('new', to_jsonb(new))
    end
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_audit_prep_instructions on public.prep_instructions;
create trigger trg_audit_prep_instructions
  after insert or update or delete on public.prep_instructions
  for each row execute function public.write_audit_body_part();

drop trigger if exists trg_audit_scan_prices on public.scan_prices;
create trigger trg_audit_scan_prices
  after insert or update or delete on public.scan_prices
  for each row execute function public.write_audit_body_part();

-- ----------------------------------------------------------------------------
-- 3. ROW-LEVEL SECURITY — any authenticated user can read (patients need
-- this for viewing prep instructions/static pages/pricing); admin-only
-- write, same shape as clinics (schema.sql section 5).
-- ----------------------------------------------------------------------------

alter table public.content_pages     enable row level security;
alter table public.announcements     enable row level security;
alter table public.prep_instructions enable row level security;
alter table public.scan_prices       enable row level security;

drop policy if exists "content_pages_read_any_authed" on public.content_pages;
create policy "content_pages_read_any_authed" on public.content_pages
  for select using (auth.uid() is not null);

drop policy if exists "content_pages_admin_write" on public.content_pages;
create policy "content_pages_admin_write" on public.content_pages
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "announcements_read_any_authed" on public.announcements;
create policy "announcements_read_any_authed" on public.announcements
  for select using (auth.uid() is not null);

drop policy if exists "announcements_admin_write" on public.announcements;
create policy "announcements_admin_write" on public.announcements
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "prep_instructions_read_any_authed" on public.prep_instructions;
create policy "prep_instructions_read_any_authed" on public.prep_instructions
  for select using (auth.uid() is not null);

drop policy if exists "prep_instructions_admin_write" on public.prep_instructions;
create policy "prep_instructions_admin_write" on public.prep_instructions
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "scan_prices_read_any_authed" on public.scan_prices;
create policy "scan_prices_read_any_authed" on public.scan_prices
  for select using (auth.uid() is not null);

drop policy if exists "scan_prices_admin_write" on public.scan_prices;
create policy "scan_prices_admin_write" on public.scan_prices
  for all using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- 4. SEED DATA — current content from frontend/lib/seed.ts, so shipping this
-- migration doesn't regress what the patient portal shows today.
-- updated_by is left null: the seed ids in seed.ts (e.g. "u-admin") aren't
-- real auth.users/profiles rows, so there's nothing valid to reference here.
-- ----------------------------------------------------------------------------

insert into public.content_pages (id, title, body) values
  ('about', 'About Capital Radiology',
   'Capital Radiology is a Sydney-based MRI diagnostic imaging provider, combining specialist radiologists with modern 1.5T and 3T scanners across three clinic locations.'),
  ('contact', 'Contact us',
   E'Sydney CBD Clinic — 1 Market St, Sydney NSW · (02) 8000 1000\nParramatta Imaging — 12 Church St, Parramatta NSW · (02) 8000 2000\nChatswood Centre — 4 Victor St, Chatswood NSW · (02) 8000 3000'),
  ('faq', 'Frequently asked questions',
   E'Do I need a referral? Most adult MRI scans require one from a specialist for a Medicare rebate; ask your GP.\nHow long does a scan take? Most scans take 20–40 minutes.\nCan I bring someone with me? Yes, arrange this at check-in.')
on conflict (id) do nothing;

insert into public.announcements (title, message, active) values
  ('Public holiday hours', 'All clinics close at 2pm on public holidays. Book early if you need an afternoon slot.', true)
on conflict do nothing;

insert into public.prep_instructions (body_part, instructions) values
  ('Brain', 'No preparation needed. Remove all metal jewellery and piercings before your appointment.'),
  ('Abdomen', 'Fast for 4 hours before your scan (water is fine). Arrive 15 minutes early to change into a gown.'),
  ('Pelvis', 'Arrive with a comfortably full bladder — drink 2 glasses of water 1 hour before your appointment.')
on conflict (body_part) do nothing;

insert into public.scan_prices (body_part, price) values
  ('Brain', 560), ('Cervical Spine', 420), ('Lumbar Spine', 480), ('Shoulder', 440),
  ('Right Knee', 440), ('Left Knee', 440), ('Abdomen', 620), ('Pelvis', 620)
on conflict (body_part) do nothing;

-- ============================================================================
-- END OF MIGRATION 011
-- ============================================================================
