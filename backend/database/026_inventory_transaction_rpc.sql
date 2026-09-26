-- ============================================================================
-- CAPITAL RADIOLOGY — Migration 026: inventory transaction RPC
-- Run in Supabase SQL Editor AFTER schema.sql (and 002-025).
--
-- Phase 8 of moving off frontend/lib/store.tsx mock data onto real Supabase
-- persistence — Inventory Management. Ports recordInventoryTransaction
-- (frontend/lib/store.tsx ~lines 811-844):
--
--   if (quantity <= 0) return; // silent no-op in the mock
--   delta = type === "stock_in" ? +quantity : -quantity
--   item.quantity_on_hand = Math.max(0, item.quantity_on_hand + delta)
--   insert InventoryTransaction row
--   if item.quantity_on_hand <= item.reorder_threshold:
--     push "low_stock" notification to every profile with role === "admin"
--
-- Two deliberate, small behavior changes from the mock, both called out
-- here and in the phase report:
--
--   1. quantity <= 0 raises an exception instead of silently no-op'ing. A
--      direct RPC call is a real API contract, not a same-process UI
--      function call the caller already validated client-side (the form
--      already enforces min=1) — callers deserve a clear reason rather than
--      a call that appears to succeed but changes nothing.
--   2. The low-stock notification fan-out targets role in ('admin',
--      'super_admin') instead of just 'admin'. super_admin didn't exist as
--      a distinct concept when the mock store was written; is_admin() itself
--      (schema.sql / 008_super_admin.sql) already treats super_admin as a
--      superset of admin's concerns everywhere else in this codebase, so
--      excluding super_admin from a low-stock alert would be an inconsistency,
--      not a deliberate scoping choice.
--
-- SECURITY DEFINER is required here (unlike the plain SECURITY INVOKER RPCs
-- in 015/019/023) because a staff caller who is not themselves admin/
-- super_admin has no RLS path to insert into notifications for someone
-- else's user_id at all — that table has no client-facing insert policy,
-- only trigger/RPC inserts.
-- ============================================================================

create or replace function public.record_inventory_transaction(
  p_item_id uuid,
  p_type text,
  p_quantity integer,
  p_note text
)
returns public.inventory_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.inventory_items;
  v_delta integer;
begin
  if not public.is_staff() then
    raise exception 'Staff access required.';
  end if;

  if p_quantity <= 0 then
    raise exception 'Quantity must be positive.';
  end if;

  if p_type not in ('stock_in', 'used', 'wasted') then
    raise exception 'Invalid transaction type.';
  end if;

  v_delta := case when p_type = 'stock_in' then p_quantity else -p_quantity end;

  update public.inventory_items
  set quantity_on_hand = greatest(0, quantity_on_hand + v_delta)
  where id = p_item_id
  returning * into v_item;

  if v_item.id is null then
    raise exception 'Inventory item not found.';
  end if;

  insert into public.inventory_transactions (item_id, type, quantity, performed_by, note)
  values (p_item_id, p_type, p_quantity, auth.uid(), p_note);

  if v_item.quantity_on_hand <= v_item.reorder_threshold then
    insert into public.notifications (user_id, type, title, message)
    select
      id,
      'low_stock',
      'Low stock alert',
      v_item.name || ' is at ' || v_item.quantity_on_hand || ' ' || v_item.unit ||
        ' (reorder threshold ' || v_item.reorder_threshold || ').'
    from public.profiles
    where role in ('admin', 'super_admin');
  end if;

  return v_item;
end;
$$;

-- ============================================================================
-- END OF MIGRATION 026
-- ============================================================================
