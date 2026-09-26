"use client";

import React, { useCallback, useEffect, useState } from "react";
import { format, isAfter, parseISO, startOfToday } from "date-fns";
import { CheckCircle2, HeartPulse, Pencil, XCircle } from "lucide-react";
import { useStore } from "@/frontend/lib/store";
import { createClient } from "@/frontend/lib/supabase/client";
import type { Contraindications } from "@/shared/types";

const CONTRA_ITEMS: { key: keyof Omit<Contraindications, "other">; label: string; note: string }[] = [
  { key: "metal_implants", label: "Metal implants or fragments", note: "Screws, plates, clips, shrapnel" },
  { key: "pacemaker", label: "Pacemaker / defibrillator", note: "Most devices need cardiology clearance" },
  { key: "claustrophobia", label: "Claustrophobia", note: "We can arrange wide-bore or sedation" },
  { key: "contrast_allergy", label: "Contrast (gadolinium) allergy", note: "Tell us about prior reactions" },
  { key: "pregnancy", label: "Pregnancy (confirmed or possible)", note: "MRI timing is assessed case-by-case" },
];

/* ------------------------------------------------------------------ */
/* Health profile (patient_medical_records) — real Supabase read/write, */
/* replacing the mock store's records/updateRecord (see                */
/* backend/database/012_patient_records_extended.sql). Fixes two mock   */
/* issues rather than porting them: dob now comes from a real form      */
/* field on first-time creation instead of a hardcoded placeholder, and */
/* patient_code is assigned by a DB sequence default instead of an      */
/* array-length scheme that could collide under concurrent inserts.     */
/* ------------------------------------------------------------------ */
export type PatientRecordRow = {
  id: string;
  patient_id: string;
  dob: string;
  history: string | null;
  contraindications: Contraindications;
  emergency_contact: { name: string; relationship: string; phone: string };
  patient_code: string | null;
  sex: string | null;
  preferred_name: string | null;
  address: string | null;
  suburb: string | null;
  state: string | null;
  postcode: string | null;
  medicare_number: string | null;
  medicare_expiry: string | null;
};

// undefined = still loading, null = no row yet (expected for a first-time
// patient — .maybeSingle() below, not an error).
export function useMyMedicalRecord(patientId: string) {
  const [record, setRecord] = useState<PatientRecordRow | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("patient_medical_records")
      .select(
        "id, patient_id, dob, history, contraindications, emergency_contact, patient_code, sex, preferred_name, address, suburb, state, postcode, medicare_number, medicare_expiry"
      )
      .eq("patient_id", patientId)
      .maybeSingle();
    if (error) {
      setLoadError(error.message);
      return;
    }
    setLoadError(null);
    setRecord((data as PatientRecordRow | null) ?? null);
  }, [patientId]);

  useEffect(() => {
    load();
  }, [load]);

  return { record, loadError, reload: load };
}

export function HealthProfileForm({ existing, onSaved }: { existing: PatientRecordRow | null; onSaved: () => void }) {
  const store = useStore();
  const me = store.currentUser;
  const isFirstTime = !existing;
  // View mode once a record exists (Edit button switches to the form below);
  // a first-time patient goes straight to the form since there's nothing to
  // summarize yet.
  const [mode, setMode] = useState<"view" | "edit">(isFirstTime ? "edit" : "view");
  const [history, setHistory] = useState<string>(existing?.history ?? "");
  const [contra, setContra] = useState<Contraindications>(
    existing?.contraindications ?? {
      metal_implants: false, pacemaker: false, claustrophobia: false,
      contrast_allergy: false, pregnancy: false, other: null,
    }
  );
  const [otherText, setOtherText] = useState<string>(existing?.contraindications?.other ?? "");
  const [ecName, setEcName] = useState<string>(existing?.emergency_contact?.name ?? "");
  const [ecRel, setEcRel] = useState<string>(existing?.emergency_contact?.relationship ?? "");
  const [ecPhone, setEcPhone] = useState<string>(existing?.emergency_contact?.phone ?? "");
  const [dob, setDob] = useState<string>(existing?.dob ?? "");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  function toggle(key: keyof Omit<Contraindications, "other">) {
    setContra((c) => ({ ...c, [key]: !c[key] }));
    setFeedback(null);
  }

  function startEdit() {
    setHistory(existing?.history ?? "");
    setContra(
      existing?.contraindications ?? {
        metal_implants: false, pacemaker: false, claustrophobia: false,
        contrast_allergy: false, pregnancy: false, other: null,
      }
    );
    setOtherText(existing?.contraindications?.other ?? "");
    setEcName(existing?.emergency_contact?.name ?? "");
    setEcRel(existing?.emergency_contact?.relationship ?? "");
    setEcPhone(existing?.emergency_contact?.phone ?? "");
    setDob(existing?.dob ?? "");
    setFeedback(null);
    setMode("edit");
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);

    if (!dob) {
      setFeedback({ ok: false, text: "Date of birth is required." });
      return;
    }
    const dobDate = parseISO(dob);
    if (Number.isNaN(dobDate.getTime()) || !isAfter(startOfToday(), dobDate)) {
      setFeedback({ ok: false, text: "Enter a valid date of birth in the past." });
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const payload: Record<string, unknown> = {
      patient_id: me.id,
      dob,
      history,
      contraindications: { ...contra, other: otherText.trim() || null },
      emergency_contact: { name: ecName, relationship: ecRel, phone: ecPhone },
    };

    const { error } = await supabase.from("patient_medical_records").upsert(payload, { onConflict: "patient_id" });
    setSaving(false);
    if (error) {
      setFeedback({ ok: false, text: `Could not save: ${error.message}` });
      return;
    }
    setFeedback(null);
    setMode("view");
    onSaved();
  }

  if (mode === "view" && existing) {
    const activeContraindications = CONTRA_ITEMS.filter((item) => existing.contraindications[item.key]);
    return (
      <div className="space-y-5">
        <div className="flex justify-end">
          <button type="button" onClick={startEdit} className="btn-ghost gap-1.5 px-3 py-1.5 text-xs">
            <Pencil size={13} aria-hidden /> Edit
          </button>
        </div>
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Date of birth</dt>
            <dd className="mt-0.5 text-sm text-navy">{format(parseISO(existing.dob), "d MMM yyyy")}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Medical history</dt>
            <dd className="mt-0.5 text-sm text-navy">{existing.history || <span className="text-slate-400">None on file</span>}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Emergency contact</dt>
            <dd className="mt-0.5 text-sm text-navy">
              {existing.emergency_contact.name
                ? `${existing.emergency_contact.name} (${existing.emergency_contact.relationship || "—"}) · ${existing.emergency_contact.phone || "—"}`
                : <span className="text-slate-400">None on file</span>}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">MRI safety flags</dt>
            <dd className="mt-0.5 text-sm text-navy">
              {activeContraindications.length === 0 && !existing.contraindications.other ? (
                <span className="text-slate-400">None flagged</span>
              ) : (
                <ul className="space-y-0.5">
                  {activeContraindications.map((item) => <li key={item.key}>{item.label}</li>)}
                  {existing.contraindications.other && <li>Other: {existing.contraindications.other}</li>}
                </ul>
              )}
            </dd>
          </div>
        </dl>
      </div>
    );
  }

  return (
    <form onSubmit={save} className="grid gap-5 lg:grid-cols-2">
      <div className="space-y-4">
        <div>
          <label htmlFor="hp-dob" className="label">Date of birth</label>
          <input
            id="hp-dob" type="date" required className="input"
            max={format(startOfToday(), "yyyy-MM-dd")}
            value={dob} onChange={(e) => { setDob(e.target.value); setFeedback(null); }}
          />
        </div>
        <div>
          <label htmlFor="hp-history" className="label">Medical history</label>
          <textarea
            id="hp-history" rows={4} className="input"
            placeholder="Prior imaging, surgeries, relevant conditions"
            value={history} onChange={(e) => { setHistory(e.target.value); setFeedback(null); }}
          />
        </div>
        <fieldset className="rounded-lg border border-slate-200 p-4">
          <legend className="px-1 text-sm font-bold text-navy">Emergency contact</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="ec-name" className="label">Name</label>
              <input id="ec-name" className="input" value={ecName} onChange={(e) => { setEcName(e.target.value); setFeedback(null); }} />
            </div>
            <div>
              <label htmlFor="ec-rel" className="label">Relationship</label>
              <input id="ec-rel" className="input" value={ecRel} onChange={(e) => { setEcRel(e.target.value); setFeedback(null); }} />
            </div>
            <div>
              <label htmlFor="ec-phone" className="label">Phone</label>
              <input id="ec-phone" type="tel" className="input" value={ecPhone} onChange={(e) => { setEcPhone(e.target.value); setFeedback(null); }} />
            </div>
          </div>
        </fieldset>
      </div>

      <fieldset className="rounded-lg border border-slate-200 p-4">
        <legend className="px-1 text-sm font-bold text-navy">MRI safety — check all that apply</legend>
        <ul className="space-y-2.5">
          {CONTRA_ITEMS.map((item) => (
            <li key={item.key}>
              <label className="flex cursor-pointer items-start gap-3 rounded-lg p-2 transition hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={contra[item.key]}
                  onChange={() => toggle(item.key)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-medical focus:ring-medical"
                />
                <span>
                  <span className="block text-sm font-semibold text-navy">{item.label}</span>
                  <span className="block text-xs text-slate-500">{item.note}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
        <div className="mt-3">
          <label htmlFor="hp-other" className="label">Anything else we should know?</label>
          <input
            id="hp-other" className="input" placeholder="e.g. hearing aid, tattoo with metallic ink"
            value={otherText} onChange={(e) => { setOtherText(e.target.value); setFeedback(null); }}
          />
        </div>
      </fieldset>

      <div className="flex flex-col gap-2 lg:col-span-2">
        <div className="flex items-center gap-3">
          <button type="submit" disabled={saving} className="btn-primary">
            <HeartPulse size={16} aria-hidden /> {saving ? "Saving…" : "Save health profile"}
          </button>
          {!isFirstTime && (
            <button type="button" onClick={() => { setMode("view"); setFeedback(null); }} className="btn-ghost">
              Cancel
            </button>
          )}
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
      </div>
    </form>
  );
}
