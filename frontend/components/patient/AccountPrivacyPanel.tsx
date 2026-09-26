"use client";

import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { useStore } from "@/frontend/lib/store";
import { createClient } from "@/frontend/lib/supabase/client";

/* ------------------------------------------------------------------ */
/* Privacy & account deletion (NFR35, NFR36)                           */
/* ------------------------------------------------------------------ */
export default function AccountPrivacyPanel() {
  const store = useStore();
  const me = store.currentUser;
  const [consentGivenAt, setConsentGivenAt] = useState<string | null | undefined>(undefined);
  const [deletionRequestedAt, setDeletionRequestedAt] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("profiles")
        .select("consent_given_at, deletion_requested_at")
        .eq("id", me.id)
        .single();
      if (!cancelled && data) {
        setConsentGivenAt(data.consent_given_at);
        setDeletionRequestedAt(data.deletion_requested_at);
      }
    })();
    return () => { cancelled = true; };
  }, [me.id]);

  async function requestDeletion() {
    if (!confirm("Request deletion of your account and health data? Our team will process this and contact you to confirm before anything is removed.")) return;
    setRequesting(true);
    setError(null);
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ deletion_requested_at: new Date().toISOString() })
      .eq("id", me.id);
    setRequesting(false);
    if (updateError) {
      setError("Could not submit your request. Please try again or contact us directly.");
      return;
    }
    setDeletionRequestedAt(new Date().toISOString());
  }

  return (
    <div className="space-y-3 text-sm">
      <p className="text-slate-600">
        {consentGivenAt === undefined
          ? "Checking your consent record…"
          : consentGivenAt
          ? `You gave consent for us to collect and store your health data on ${format(parseISO(consentGivenAt), "d MMM yyyy")}.`
          : "No consent record found for this account — this can happen for accounts created before consent capture was added."}
      </p>
      <p>
        <a href="/privacy" className="font-semibold text-medical hover:underline">Privacy Policy</a>
        {" · "}
        <a href="/terms" className="font-semibold text-medical hover:underline">Terms of Service</a>
      </p>
      <div className="border-t border-slate-100 pt-3">
        {deletionRequestedAt ? (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
            Deletion requested on {format(parseISO(deletionRequestedAt), "d MMM yyyy")} — our team will contact you to confirm before any data is removed.
          </p>
        ) : (
          <button type="button" onClick={requestDeletion} disabled={requesting} className="btn-ghost text-xs text-rose-700 hover:bg-rose-50">
            {requesting ? "Submitting…" : "Request account & data deletion"}
          </button>
        )}
        {error && <p className="mt-2 text-xs font-semibold text-rose-700">{error}</p>}
      </div>
    </div>
  );
}
