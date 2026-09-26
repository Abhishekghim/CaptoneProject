-- ============================================================================
-- CAPITAL RADIOLOGY — Migration 024: notification preferences
-- Run in Supabase SQL Editor AFTER schema.sql (and 002-023).
--
-- Phase 7 of moving off frontend/lib/store.tsx mock data onto real Supabase
-- persistence — Notification Preferences. Mirrors frontend/lib/store.tsx
-- updateNotificationPreferences (~441-464): upsert by user_id = the caller's
-- own id, defaulting every flag on first insert exactly as the mock does
-- ({appointment_reminders:true, report_ready_alerts:true, billing_alerts:
-- true, email_enabled:true, sms_enabled:false}).
-- ============================================================================

create table if not exists public.notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  appointment_reminders boolean not null default true,
  report_ready_alerts boolean not null default true,
  billing_alerts boolean not null default true,
  email_enabled boolean not null default true,
  sms_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;

drop policy if exists "notification_preferences_own" on public.notification_preferences;
create policy "notification_preferences_own" on public.notification_preferences for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Reuses the shared touch_updated_at() trigger function already defined in
-- schema.sql (section 4.3) — not redefined here.
drop trigger if exists trg_notification_preferences_touch on public.notification_preferences;
create trigger trg_notification_preferences_touch before update on public.notification_preferences
  for each row execute function public.touch_updated_at();

-- ============================================================================
-- END OF MIGRATION 024
-- ============================================================================
