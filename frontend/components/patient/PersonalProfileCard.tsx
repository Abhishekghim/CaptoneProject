"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Pencil, User, XCircle } from "lucide-react";
import { useStore } from "@/frontend/lib/store";
import { createClient } from "@/frontend/lib/supabase/client";
import { SectionTitle } from "@/frontend/components/shared/ui";

// Name is the only field editable here. Email changes need Supabase's own
// re-confirmation flow (out of scope for this form) and phone is set via
// the OTP-verified flow in PhoneVerificationStep — letting it be freely
// retyped here would desync profiles.phone from auth.users' actual
// verified number, so both are shown read-only with a short note instead.
export default function PersonalProfileCard() {
  const { currentUser } = useStore();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState(currentUser.full_name);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    const trimmed = fullName.trim();
    if (!trimmed) {
      setFeedback({ ok: false, text: "Name can't be empty." });
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.from("profiles").update({ full_name: trimmed }).eq("id", currentUser.id);
    setSaving(false);
    if (error) {
      setFeedback({ ok: false, text: `Could not save: ${error.message}` });
      return;
    }
    setEditing(false);
    router.refresh();
  }

  return (
    <section className="card p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <SectionTitle icon={User} title="Personal profile" subtitle="Your account details" />
        {!editing && (
          <button
            type="button"
            onClick={() => {
              setFullName(currentUser.full_name);
              setFeedback(null);
              setEditing(true);
            }}
            className="btn-ghost shrink-0 gap-1.5 px-3 py-1.5 text-xs"
          >
            <Pencil size={13} aria-hidden /> Edit
          </button>
        )}
      </div>

      {editing ? (
        <form onSubmit={save} className="mt-4 max-w-sm space-y-3">
          <div>
            <label htmlFor="pp-name" className="label">Full name</label>
            <input
              id="pp-name"
              className="input"
              value={fullName}
              onChange={(e) => { setFullName(e.target.value); setFeedback(null); }}
            />
          </div>
          <div className="flex items-center gap-2">
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => { setEditing(false); setFeedback(null); }}
              className="btn-ghost"
            >
              Cancel
            </button>
          </div>
          {feedback && (
            <p
              role="status"
              className={`inline-flex items-start gap-1.5 rounded-md p-2 text-xs font-semibold ${
                feedback.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"
              }`}
            >
              {feedback.ok ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" aria-hidden /> : <XCircle size={16} className="mt-0.5 shrink-0" aria-hidden />}
              {feedback.text}
            </p>
          )}
        </form>
      ) : (
        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Full name</dt>
            <dd className="mt-0.5 text-sm text-navy">{currentUser.full_name}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Email</dt>
            <dd className="mt-0.5 text-sm text-navy">{currentUser.email}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Phone</dt>
            <dd className="mt-0.5 text-sm text-navy">
              {currentUser.phone || <span className="text-slate-400">Not verified yet — set during booking</span>}
            </dd>
          </div>
        </dl>
      )}
    </section>
  );
}
