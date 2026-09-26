-- ============================================================================
-- CAPITAL RADIOLOGY — Migration 025: inventory management
-- Run in Supabase SQL Editor AFTER schema.sql (and 002-024).
--
-- Phase 8 of moving off frontend/lib/store.tsx mock data onto real Supabase
-- persistence — Inventory Management (Module 13, FR57–FR61). Three new
-- tables mirroring shared/types.ts InventoryItem / InventoryTransaction /
-- Supplier exactly (see frontend/lib/store.tsx addInventoryItem /
-- recordInventoryTransaction / addSupplier). The transaction-recording write
-- path itself (stock adjustment + low-stock notification fan-out) is not a
-- plain client insert — see 026_inventory_transaction_rpc.sql — so
-- inventory_transactions deliberately gets no client-facing insert policy
-- here.
-- ============================================================================

create table public.suppliers (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  contact_name text,
  phone text,
  email text,
  created_at timestamptz not null default now()
);

create table public.inventory_items (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  category text not null check (category in ('contrast_agent','consumable')),
  unit text not null,
  quantity_on_hand integer not null default 0 check (quantity_on_hand >= 0),
  reorder_threshold integer not null default 0,
  supplier_id uuid references public.suppliers(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.inventory_transactions (
  id uuid primary key default uuid_generate_v4(),
  item_id uuid not null references public.inventory_items(id) on delete cascade,
  type text not null check (type in ('stock_in','used','wasted')),
  quantity integer not null check (quantity > 0),
  performed_by uuid references public.profiles(id) on delete set null,
  note text,
  performed_at timestamptz not null default now()
);
create index if not exists idx_inventory_transactions_item on public.inventory_transactions (item_id, performed_at desc);

-- ----------------------------------------------------------------------------
-- RLS — staff (is_staff(): technician/radiologist/admin/super_admin/
-- reception, per 010_reception_role.sql) can read all three tables, matching
-- InventoryPanel.tsx being a staff-facing surface. Direct client writes on
-- suppliers/inventory_items are admin-only (is_admin(): admin + super_admin,
-- per 008_super_admin.sql), matching the mock UI's admin-only add-item/
-- add-supplier actions. inventory_transactions gets a read policy only —
-- writes go exclusively through record_inventory_transaction() in
-- 026_inventory_transaction_rpc.sql, a SECURITY DEFINER RPC, since that
-- function also needs to insert low-stock notifications for admins, and
-- notifications has no client-facing insert policy at all.
-- ----------------------------------------------------------------------------
alter table public.suppliers enable row level security;
alter table public.inventory_items enable row level security;
alter table public.inventory_transactions enable row level security;

drop policy if exists "suppliers_staff_read" on public.suppliers;
create policy "suppliers_staff_read" on public.suppliers
  for select using (public.is_staff());

drop policy if exists "suppliers_admin_write" on public.suppliers;
create policy "suppliers_admin_write" on public.suppliers
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "inventory_items_staff_read" on public.inventory_items;
create policy "inventory_items_staff_read" on public.inventory_items
  for select using (public.is_staff());

drop policy if exists "inventory_items_admin_write" on public.inventory_items;
create policy "inventory_items_admin_write" on public.inventory_items
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "inventory_transactions_staff_read" on public.inventory_transactions;
create policy "inventory_transactions_staff_read" on public.inventory_transactions
  for select using (public.is_staff());

-- ============================================================================
-- END OF MIGRATION 025
-- ============================================================================
