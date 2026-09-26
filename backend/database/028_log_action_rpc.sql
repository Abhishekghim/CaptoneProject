-- ============================================================================
-- CAPITAL RADIOLOGY — Migration 028: generic log_action RPC
-- Run in Supabase SQL Editor AFTER schema.sql (and 002-027).
--
-- Phase 10 of moving off frontend/lib/store.tsx mock data onto real Supabase
-- persistence — Audit Logging (FR72, FR74, NFR9). Every table-level write in
-- this app now gets an audit_logs row automatically via a write_audit()-
-- family trigger (schema.sql section 4.4; 011_cms_content.sql;
-- 027_audit_trigger_coverage.sql). The one remaining app-level event that
-- isn't a table write at all is the AI assistant widget logging that a query
-- happened — frontend/components/shared/Shell.tsx's onExchange callback,
-- currently frontend/lib/store.tsx's in-memory logAssistantAction. Metadata
-- only, never the chat content itself (same reasoning as
-- logAssistantAction's own comment, ~lines 750-753 of store.tsx, and as the
-- deliberate exclusion of `messages` in 027_audit_trigger_coverage.sql).
--
-- SECURITY DEFINER isn't strictly required for RLS purposes here — audit_logs
-- already has an "audit_insert_any_authed" policy (schema.sql) permitting any
-- authenticated user to insert a row. It's used anyway because routing this
-- through an RPC (rather than a raw client-side `supabase.from("audit_logs").
-- insert(...)`) guarantees user_id is always auth.uid(), set server-side,
-- and can never be spoofed by a client. A direct insert could not be trusted
-- for that: the RLS policy only checks `auth.uid() is not null`, not
-- `user_id = auth.uid()`, so nothing would stop a client from passing an
-- arbitrary user_id in the insert payload and forging another user's audit
-- entry. Going through this function closes that gap.
-- ============================================================================

create or replace function public.log_action(
  p_action text,
  p_entity text,
  p_entity_id text default null,
  p_details jsonb default '{}'::jsonb
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated.';
  end if;

  insert into public.audit_logs (user_id, action, entity, entity_id, details)
  values (auth.uid(), p_action, p_entity, p_entity_id, p_details);
end;
$$;

-- ============================================================================
-- END OF MIGRATION 028
-- ============================================================================
