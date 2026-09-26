-- ============================================================================
-- CAPITAL RADIOLOGY — Migration 031: Stripe online card payment
-- Run in Supabase SQL Editor AFTER schema.sql (and 002-030).
--
-- Adds the two columns the new self-service "Pay now" flow needs to track a
-- Stripe Checkout Session against its `billing` row (app/api/payments/checkout
-- creates the session and records its id; app/api/webhooks/stripe records the
-- resulting PaymentIntent once Stripe confirms the card charge succeeded).
-- This is purely additive alongside the existing manual "record a payment"
-- flow (AdminDashboard.tsx markPaid) — that flow, and the `payment_status`/
-- `payment_method`/`paid_at`/`receipt_url` columns it already writes, are
-- untouched.
--
-- stripe_checkout_session_id is unique (a session is created once per pay
-- attempt and looked up by id in the webhook) but nullable — most billing
-- rows will never go through the online flow at all, hence the partial
-- unique index rather than a plain `unique` column constraint.
--
-- No RLS change: `billing_patient_read_own` and the staff read policies
-- already cover `select *`, so these two columns are readable wherever the
-- rest of a billing row already is. They are NOT writable by a patient via
-- RLS, though — `billing_admin_write` (schema.sql) is admin-only for
-- update/insert/delete, and `billing_insert_via_booking` (015) only covers
-- insert. A patient starting a Checkout Session has no RLS path to UPDATE
-- their own billing row, by design: both writes (recording the session id
-- in the checkout route, and recording payment success in the webhook) go
-- through the service-role admin client instead, only after the route has
-- independently established (via RLS, in the checkout route; via Stripe's
-- signed webhook payload, in the webhook route) that the write is
-- legitimate. See app/api/payments/checkout/route.ts and
-- app/api/webhooks/stripe/route.ts for exactly where and why.
-- ============================================================================

alter table public.billing add column if not exists stripe_checkout_session_id text;
alter table public.billing add column if not exists stripe_payment_intent_id text;
create unique index if not exists idx_billing_stripe_session on public.billing (stripe_checkout_session_id) where stripe_checkout_session_id is not null;

-- ============================================================================
-- END OF MIGRATION 031
-- ============================================================================
