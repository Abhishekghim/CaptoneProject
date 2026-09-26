-- ============================================================================
-- CAPITAL RADIOLOGY — Migration 032: Stripe Invoicing (staff-initiated)
-- Run in Supabase SQL Editor AFTER schema.sql (and 002-031).
--
-- Adds the columns the new staff-initiated "send a formal Stripe invoice"
-- flow needs: `profiles.stripe_customer_id` remembers the Stripe Customer
-- created for a patient the first time staff invoice them (so a repeat
-- invoice reuses the same Customer instead of creating a duplicate one), and
-- `billing.stripe_invoice_id` tracks the Stripe Invoice created against a
-- given billing row (app/api/payments/invoice creates both; app/api/webhooks/
-- stripe's invoice.paid branch looks the invoice back up by this column when
-- Stripe's own metadata is somehow missing).
--
-- This is purely additive alongside the existing online self-service
-- "Pay now" flow (Stripe Checkout, migration 031) and the manual "record a
-- payment" flow (AdminDashboard.tsx markPaid) — neither is touched. All
-- three payment paths converge on the same `payment_status`/`payment_method`/
-- `paid_at`/`receipt_url` columns.
--
-- Both new columns are unique-when-set (one Stripe Customer per profile, one
-- Stripe Invoice per billing row) but nullable — most rows will never go
-- through this flow — hence partial unique indexes rather than plain
-- `unique` column constraints, matching migration 031's
-- idx_billing_stripe_session.
--
-- No RLS change: `profiles_select_own_or_staff` and `billing`'s existing
-- select policies already cover `select *`, so these two columns are
-- readable wherever the rest of their row already is. They are NOT writable
-- by a patient via RLS, though — `profiles_update_own`'s `with check` only
-- lets a user update their OWN row (and doesn't apply here anyway, since
-- it's an admin, not the patient, doing the writing), and
-- `billing_admin_write` is admin-only for update/insert/delete. Both writes
-- (recording the Stripe Customer id on the patient's profile, and recording
-- the Stripe Invoice id on the billing row) go through the service-role
-- admin client instead, from app/api/payments/invoice/route.ts, which is
-- itself gated by requireAdmin() before either write happens — same
-- reasoning already established for stripe_checkout_session_id in migration
-- 031. See app/api/payments/invoice/route.ts and
-- app/api/webhooks/stripe/route.ts for exactly where and why.
-- ============================================================================

alter table public.profiles add column if not exists stripe_customer_id text;
create unique index if not exists idx_profiles_stripe_customer on public.profiles (stripe_customer_id) where stripe_customer_id is not null;

alter table public.billing add column if not exists stripe_invoice_id text;
create unique index if not exists idx_billing_stripe_invoice on public.billing (stripe_invoice_id) where stripe_invoice_id is not null;

-- ============================================================================
-- END OF MIGRATION 032
-- ============================================================================
