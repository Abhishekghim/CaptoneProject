"use client";

import { useCallback, useEffect, useState } from "react";
import { useStore } from "@/frontend/lib/store";
import { createClient } from "@/frontend/lib/supabase/client";
import type { NotificationPreferences } from "@/shared/types";

/* ------------------------------------------------------------------ */
/* Notification preferences — real Supabase read/write, replacing the  */
/* mock store's notificationPreferences/updateNotificationPreferences  */
/* (see backend/database/024_notification_preferences.sql). RLS        */
/* (notification_preferences_own) scopes every row to auth.uid(), so    */
/* the upsert never needs to send user_id-as-someone-else.             */
/* ------------------------------------------------------------------ */
const DEFAULT_NOTIFICATION_PREFS: Omit<NotificationPreferences, "user_id"> = {
  appointment_reminders: true,
  report_ready_alerts: true,
  billing_alerts: true,
  email_enabled: true,
  sms_enabled: false,
};

function useMyNotificationPreferences(userId: string) {
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("notification_preferences")
      .select("user_id, appointment_reminders, report_ready_alerts, billing_alerts, email_enabled, sms_enabled")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      setLoadError(error.message);
      return;
    }
    setLoadError(null);
    setPrefs((data as NotificationPreferences | null) ?? { user_id: userId, ...DEFAULT_NOTIFICATION_PREFS });
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  return { prefs, loadError, reload: load };
}

export default function NotificationPreferencesForm() {
  const store = useStore();
  const me = store.currentUser;
  const { prefs: prefsData, loadError, reload } = useMyNotificationPreferences(me.id);
  const prefs = prefsData ?? { user_id: me.id, ...DEFAULT_NOTIFICATION_PREFS };
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function toggle(key: "appointment_reminders" | "report_ready_alerts" | "billing_alerts" | "email_enabled" | "sms_enabled") {
    const next = { ...prefs, [key]: !prefs[key] };
    const supabase = createClient();
    const { error } = await supabase
      .from("notification_preferences")
      .upsert(next, { onConflict: "user_id" });
    if (error) {
      setSaveError(error.message);
      return;
    }
    setSaveError(null);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    reload();
  }

  const ITEMS: { key: "appointment_reminders" | "report_ready_alerts" | "billing_alerts"; label: string }[] = [
    { key: "appointment_reminders", label: "Appointment confirmations & reminders" },
    { key: "report_ready_alerts", label: "Report ready alerts" },
    { key: "billing_alerts", label: "Billing & payment alerts" },
  ];

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      {loadError && (
        <p role="alert" className="text-sm text-rose-700 sm:col-span-2">Could not load your preferences: {loadError}</p>
      )}
      <fieldset className="space-y-2.5">
        <legend className="mb-1 text-sm font-bold text-navy">Alert me about</legend>
        {ITEMS.map((item) => (
          <label key={item.key} className="flex cursor-pointer items-center justify-between gap-3 rounded-lg p-2 hover:bg-slate-50">
            <span className="text-sm text-slate-700">{item.label}</span>
            <input
              type="checkbox"
              checked={prefs[item.key]}
              onChange={() => toggle(item.key)}
              className="h-4 w-4 rounded border-slate-300 text-medical focus:ring-medical"
            />
          </label>
        ))}
      </fieldset>
      <fieldset className="space-y-2.5">
        <legend className="mb-1 text-sm font-bold text-navy">Delivery channel</legend>
        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg p-2 hover:bg-slate-50">
          <span className="text-sm text-slate-700">Email</span>
          <input type="checkbox" checked={prefs.email_enabled} onChange={() => toggle("email_enabled")} className="h-4 w-4 rounded border-slate-300 text-medical focus:ring-medical" />
        </label>
        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg p-2 hover:bg-slate-50">
          <span className="text-sm text-slate-700">SMS</span>
          <input type="checkbox" checked={prefs.sms_enabled} onChange={() => toggle("sms_enabled")} className="h-4 w-4 rounded border-slate-300 text-medical focus:ring-medical" />
        </label>
        <p className="text-xs text-slate-400">In-app notifications (the bell icon) are always on.</p>
        {saveError && <p role="alert" className="text-xs font-semibold text-rose-700">Could not save: {saveError}</p>}
        {saved && <p role="status" className="text-xs font-semibold text-emerald-700">Saved.</p>}
      </fieldset>
    </div>
  );
}
