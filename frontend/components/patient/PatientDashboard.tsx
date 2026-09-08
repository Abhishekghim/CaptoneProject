"use client";

import React, { useMemo, useRef, useState } from "react";
import { addDays, format, isAfter, parseISO, startOfToday } from "date-fns";
import {
  Bell, CalendarClock, CheckCircle2, ClipboardList, Download, FileSignature,
  FileText, HeartPulse, Info, Megaphone, MessageSquare, Paperclip, Receipt, ShieldCheck, X, XCircle,
} from "lucide-react";
import { useStore } from "@/frontend/lib/store";
import { BODY_PARTS, LOCATIONS, TIME_SLOTS } from "@/frontend/lib/seed";
import { uploadToBucket } from "@/frontend/lib/storage";
import { downloadReceiptPdf } from "@/frontend/lib/receiptPdf";
import { createClient } from "@/frontend/lib/supabase/client";
import type { Appointment, Contraindications } from "@/shared/types";
import { AppointmentCalendar } from "@/frontend/components/shared/Calendar";
import { MessageThreadView } from "@/frontend/components/shared/Messaging";
import { EmptyState, SectionTitle, StatusChip } from "@/frontend/components/shared/ui";

const CONTRA_ITEMS: { key: keyof Omit<Contraindications, "other">; label: string; note: string }[] = [
  { key: "metal_implants", label: "Metal implants or fragments", note: "Screws, plates, clips, shrapnel" },
  { key: "pacemaker", label: "Pacemaker / defibrillator", note: "Most devices need cardiology clearance" },
  { key: "claustrophobia", label: "Claustrophobia", note: "We can arrange wide-bore or sedation" },
  { key: "contrast_allergy", label: "Contrast (gadolinium) allergy", note: "Tell us about prior reactions" },
  { key: "pregnancy", label: "Pregnancy (confirmed or possible)", note: "MRI timing is assessed case-by-case" },
];

export default function PatientDashboard() {
  const store = useStore();
  const me = store.currentUser;

  const myAppointments = store.appointments
    .filter((a) => a.patient_id === me.id)
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  const myRecord = store.records.find((r) => r.patient_id === me.id);

  const myFinalReports = useMemo(() => {
    return store.reports
      .filter((r) => r.status === "finalized")
      .map((r) => {
        const scan = store.scans.find((s) => s.id === r.scan_id);
        const apt = scan && store.appointments.find((a) => a.id === scan.appointment_id);
        return apt?.patient_id === me.id && scan ? { report: r, scan, apt } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [store.reports, store.scans, store.appointments, me.id]);

  const myBills = store.billing.filter((b) =>
    myAppointments.some((a) => a.id === b.appointment_id)
  );

  const activeAnnouncements = store.announcements.filter((a) => a.active);

  return (
    <div className="mx-auto max-w-6xl space-y-10">
      {activeAnnouncements.length > 0 && (
        <div className="space-y-2">
          {activeAnnouncements.map((a) => (
            <div key={a.id} role="status" className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <Megaphone size={16} className="mt-0.5 shrink-0" aria-hidden />
              <p><span className="font-semibold">{a.title}</span> — {a.message}</p>
            </div>
          ))}
        </div>
      )}

      <BookingCard />

      <section id="health-profile" className="card p-5 sm:p-6">
        <SectionTitle
          icon={HeartPulse}
          title="Health profile & MRI safety checklist"
          subtitle="Reviewed by your technician before every scan"
        />
        <HealthProfileForm existing={myRecord} />
      </section>

      <section id="notification-preferences" className="card p-5 sm:p-6">
        <SectionTitle
          icon={Bell}
          title="Notification preferences"
          subtitle="Choose what you're alerted about, and how"
        />
        <NotificationPreferencesForm />
      </section>

      <section id="messages" className="card p-5 sm:p-6">
        <SectionTitle icon={MessageSquare} title="Messages" subtitle="Secure messaging with your care team (FR41)" />
        <MessageThreadView
          messages={store.messages.filter((m) => m.thread_id === store.messageThreads.find((t) => t.kind === "patient" && t.patient_id === me.id)?.id)}
          onSend={(body) => store.sendPatientMessage(me.id, body)}
          placeholder="Message the clinic…"
          emptyHint="A technician, radiologist, or admin can reply here."
        />
      </section>

      <section id="results-billing" className="space-y-6">
        <div className="card p-5 sm:p-6">
          <SectionTitle
            icon={FileSignature}
            title="Results & reports"
            subtitle="Finalized reports appear here once your radiologist signs off"
          />
          {myFinalReports.length === 0 ? (
            <EmptyState
              message="No finalized reports yet"
              hint="You'll get a notification (bell icon, top right) the moment a report is ready."
            />
          ) : (
            <ul className="space-y-4">
              {myFinalReports.map(({ report, scan, apt }) => (
                <li key={report.id} className="rounded-lg border border-slate-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-navy">
                        {scan.body_part} MRI — {format(parseISO(apt.date), "d MMM yyyy")}
                      </p>
                      <p className="text-xs text-slate-500">
                        {scan.protocol} · {scan.machine_name}
                      </p>
                    </div>
                    <StatusChip status={report.status} />
                  </div>
                  <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="label">Findings</dt>
                      <dd className="whitespace-pre-wrap text-slate-700">{report.findings}</dd>
                    </div>
                    <div>
                      <dt className="label">Impression</dt>
                      <dd className="whitespace-pre-wrap text-slate-700">{report.impression}</dd>
                    </div>
                  </dl>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
                    <p className="text-xs text-slate-500">
                      Signed: <span className="font-semibold text-navy">{report.e_signature}</span>
                      {report.finalized_at && <> · {format(parseISO(report.finalized_at), "d MMM yyyy, h:mm a")}</>}
                    </p>
                    <DownloadDicomButton scanId={scan.id} bodyPart={scan.body_part} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card p-5 sm:p-6">
          <SectionTitle icon={Receipt} title="Billing history" subtitle="Digital receipts issue automatically on payment" />
          {myBills.length === 0 ? (
            <EmptyState message="No bills yet" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-4">Appointment</th>
                    <th className="py-2 pr-4">Amount</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2">Receipt</th>
                  </tr>
                </thead>
                <tbody>
                  {myBills.map((b) => {
                    const apt = myAppointments.find((a) => a.id === b.appointment_id);
                    return (
                      <tr key={b.id} className="border-b border-slate-100 last:border-0">
                        <td className="py-2.5 pr-4">
                          {apt ? `${apt.body_part} · ${format(parseISO(apt.date), "d MMM")}` : b.appointment_id}
                        </td>
                        <td className="py-2.5 pr-4 font-semibold">${b.amount.toFixed(2)}</td>
                        <td className="py-2.5 pr-4"><StatusChip status={b.payment_status} /></td>
                        <td className="py-2.5">
                          {b.receipt_url ? (
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 font-semibold text-medical hover:underline"
                              onClick={() =>
                                downloadReceiptPdf(`receipt-${b.id}.pdf`, [
                                  "Capital Radiology — Payment Receipt",
                                  "",
                                  `Receipt: ${b.id}`,
                                  `Patient: ${me.full_name}`,
                                  `Procedure: ${apt?.body_part ?? "—"}`,
                                  `Amount paid: $${b.amount.toFixed(2)}`,
                                  `Payment method: ${b.payment_method ?? "—"}`,
                                  `Paid at: ${b.paid_at ?? "—"}`,
                                ])
                              }
                            >
                              <FileText size={14} aria-hidden /> Download PDF
                            </button>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <section id="clinic-info" className="card p-5 sm:p-6">
        <SectionTitle icon={Info} title="Clinic info & MRI preparation" subtitle="About us, contact details, FAQs, and how to prepare for your scan" />
        <ClinicInfoTabs />
      </section>

      <section id="privacy-data" className="card p-5 sm:p-6">
        <SectionTitle icon={ShieldCheck} title="Privacy & your data" subtitle="Your consent status and data-removal options" />
        <AccountPrivacyPanel />
      </section>

      <section className="card p-5 sm:p-6">
        <SectionTitle icon={ClipboardList} title="Appointment history" subtitle="Upcoming and past visits" />
        <ul className="divide-y divide-slate-100">
          {myAppointments.map((a) => {
            const upcoming = a.status === "scheduled" && !isAfter(startOfToday(), parseISO(a.date));
            return <AppointmentHistoryRow key={a.id} appointment={a} upcoming={upcoming} />;
          })}
        </ul>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Appointment history row (with reschedule)                          */
/* ------------------------------------------------------------------ */
function AppointmentHistoryRow({ appointment: a, upcoming }: { appointment: Appointment; upcoming: boolean }) {
  const store = useStore();
  const [rescheduling, setRescheduling] = useState(false);
  const [date, setDate] = useState(a.date);
  const [slot, setSlot] = useState(a.time_slot);
  const [location, setLocation] = useState(a.location);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const takenSlots = store.appointments
    .filter((x) => x.id !== a.id && x.date === date && x.location === location && x.status !== "cancelled")
    .map((x) => x.time_slot);

  function saveReschedule() {
    const result = store.rescheduleAppointment(a.id, { date, time_slot: slot, location });
    if (result.ok) {
      setFeedback({ ok: true, text: "Appointment rescheduled." });
      setRescheduling(false);
    } else {
      setFeedback({ ok: false, text: result.error ?? "Could not reschedule." });
    }
  }

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold text-navy">
            {a.body_part} — {format(parseISO(a.date), "EEE d MMM yyyy")} at {a.time_slot}
          </p>
          <p className="text-xs text-slate-500">
            {a.location}
            {a.referral_url && (
              <> · <Paperclip size={12} className="inline" aria-hidden /> referral attached</>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusChip status={a.status} />
          {upcoming && (
            <>
              <button
                type="button"
                onClick={() => setRescheduling((v) => !v)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-medical hover:text-medical-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-medical"
              >
                <CalendarClock size={14} aria-hidden /> Reschedule
              </button>
              <button
                type="button"
                onClick={() => store.cancelAppointment(a.id)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 hover:text-rose-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-500"
              >
                <XCircle size={14} aria-hidden /> Cancel
              </button>
            </>
          )}
        </div>
      </div>
      {rescheduling && (
        <div className="mt-3 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
          <AppointmentCalendar value={date} onChange={setDate} />
          <div>
            <label htmlFor={`resched-loc-${a.id}`} className="label">Location</label>
            <select id={`resched-loc-${a.id}`} className="input" value={location} onChange={(e) => setLocation(e.target.value)}>
              {LOCATIONS.map((l) => <option key={l}>{l}</option>)}
            </select>
            <span className="label mt-3 block">Time slot</span>
            <div className="flex flex-wrap gap-1.5">
              {TIME_SLOTS.map((t) => {
                const taken = takenSlots.includes(t);
                return (
                  <button
                    key={t} type="button" disabled={taken} onClick={() => setSlot(t)}
                    className={`rounded-md border px-2 py-1 text-xs font-semibold ${
                      taken ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 line-through"
                      : slot === t ? "border-medical bg-medical text-white" : "border-slate-300 bg-white text-navy"
                    }`}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={saveReschedule} className="btn-primary text-xs">Confirm new time</button>
              <button type="button" onClick={() => setRescheduling(false)} className="btn-ghost text-xs">
                <X size={13} aria-hidden /> Cancel
              </button>
            </div>
            {feedback && (
              <p role="status" className={`mt-2 rounded-md p-2 text-xs font-semibold ${feedback.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>
                {feedback.text}
              </p>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Notification preferences                                            */
/* ------------------------------------------------------------------ */
function NotificationPreferencesForm() {
  const store = useStore();
  const me = store.currentUser;
  const existing = store.notificationPreferences.find((p) => p.user_id === me.id);
  const prefs = existing ?? {
    user_id: me.id, appointment_reminders: true, report_ready_alerts: true,
    billing_alerts: true, email_enabled: true, sms_enabled: false,
  };
  const [saved, setSaved] = useState(false);

  function toggle(key: "appointment_reminders" | "report_ready_alerts" | "billing_alerts" | "email_enabled" | "sms_enabled") {
    store.updateNotificationPreferences({ ...prefs, [key]: !prefs[key] });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const ITEMS: { key: "appointment_reminders" | "report_ready_alerts" | "billing_alerts"; label: string }[] = [
    { key: "appointment_reminders", label: "Appointment confirmations & reminders" },
    { key: "report_ready_alerts", label: "Report ready alerts" },
    { key: "billing_alerts", label: "Billing & payment alerts" },
  ];

  return (
    <div className="grid gap-5 sm:grid-cols-2">
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
        {saved && <p role="status" className="text-xs font-semibold text-emerald-700">Saved.</p>}
      </fieldset>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Clinic info (FR75-77, admin-editable via ContentManagementPanel)    */
/* ------------------------------------------------------------------ */
function ClinicInfoTabs() {
  const store = useStore();
  const [tab, setTab] = useState<"about" | "contact" | "faq" | "prep">("about");
  const [prepBodyPart, setPrepBodyPart] = useState(BODY_PARTS[0]);

  const page = tab !== "prep" ? store.contentPages.find((p) => p.id === tab) : null;
  const prep = store.prepInstructions.find((p) => p.body_part === prepBodyPart);

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {(["about", "contact", "faq", "prep"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            aria-pressed={tab === t}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold capitalize ${
              tab === t ? "bg-medical text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {t === "prep" ? "MRI prep" : t}
          </button>
        ))}
      </div>

      {tab === "prep" ? (
        <div>
          <select className="input mb-3 w-48" value={prepBodyPart} onChange={(e) => setPrepBodyPart(e.target.value)}>
            {BODY_PARTS.map((b) => <option key={b}>{b}</option>)}
          </select>
          <p className="whitespace-pre-wrap text-sm text-slate-700">
            {prep?.instructions || "No special preparation needed for this scan — just arrive a few minutes early."}
          </p>
        </div>
      ) : (
        page && <p className="whitespace-pre-wrap text-sm text-slate-700">{page.body}</p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Privacy & account deletion (NFR35, NFR36)                           */
/* ------------------------------------------------------------------ */
function AccountPrivacyPanel() {
  const store = useStore();
  const me = store.currentUser;
  const [consentGivenAt, setConsentGivenAt] = useState<string | null | undefined>(undefined);
  const [deletionRequestedAt, setDeletionRequestedAt] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
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

/* ------------------------------------------------------------------ */
/* Booking form                                                        */
/* ------------------------------------------------------------------ */
function BookingCard() {
  const store = useStore();
  const me = store.currentUser;
  const [bodyPart, setBodyPart] = useState(BODY_PARTS[0]);
  const [location, setLocation] = useState(LOCATIONS[0]);
  const [date, setDate] = useState(format(addDays(new Date(), 1), "yyyy-MM-dd"));
  const [slot, setSlot] = useState(TIME_SLOTS[1]);
  const [referralFile, setReferralFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [referringDoctorId, setReferringDoctorId] = useState<string>("");
  const [otherDoctorName, setOtherDoctorName] = useState("");
  const [otherDoctorPractice, setOtherDoctorPractice] = useState("");
  const [usingReferralId, setUsingReferralId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const referringDoctors = store.profiles.filter((p) => p.role === "referring_doctor");
  const usingOtherDoctor = referringDoctorId === "__other__";

  // Path A: referrals a doctor already sent for this patient, waiting to be
  // used. Booking with one skips the manual doctor picker entirely, since
  // it's already tied to a verified doctor account.
  const pendingReferrals = store.doctorReferrals.filter((r) => r.patient_id === me.id && !r.used_in_appointment_id);
  const activeReferral = usingReferralId ? pendingReferrals.find((r) => r.id === usingReferralId) : undefined;
  const activeReferralDoctor = activeReferral
    ? store.profiles.find((p) => p.id === activeReferral.referring_doctor_id)
    : undefined;

  function useReferral(referralId: string) {
    const ref = pendingReferrals.find((r) => r.id === referralId);
    if (!ref) return;
    setUsingReferralId(referralId);
    setBodyPart(ref.body_part);
    setReferringDoctorId("");
    setFeedback(null);
  }

  const takenSlots = store.appointments
    .filter((a) => a.date === date && a.location === location && a.status !== "cancelled")
    .map((a) => a.time_slot);

  const price = store.scanPrices[bodyPart] ?? 480;

  async function submit(e: React.FormEvent) {
    e.preventDefault();

    if (!activeReferral && usingOtherDoctor && !otherDoctorName.trim()) {
      setFeedback({ ok: false, text: "Enter your doctor's name, or choose \"None — self-referred\" instead." });
      return;
    }
    if (!activeReferral && usingOtherDoctor && !referralFile) {
      setFeedback({ ok: false, text: "Since your doctor isn't in our system yet, please attach a copy of your referral so our technician can verify it." });
      return;
    }

    let referralPath: string | null = null;
    if (referralFile) {
      setUploading(true);
      const uploaded = await uploadToBucket("referrals", referralFile, me.id);
      setUploading(false);
      if (!uploaded.ok) {
        setFeedback({ ok: false, text: `Could not upload your referral: ${uploaded.error}` });
        return;
      }
      referralPath = uploaded.path;
    }

    const result = store.bookAppointment({
      date, time_slot: slot, location, body_part: bodyPart, referralFileName: referralPath,
      referringDoctorId: usingOtherDoctor || !referringDoctorId ? null : referringDoctorId,
      referringDoctorName: usingOtherDoctor ? otherDoctorName.trim() || null : null,
      referringDoctorPractice: usingOtherDoctor ? otherDoctorPractice.trim() || null : null,
      usingReferralId,
    });
    if (result.ok) {
      setFeedback({ ok: true, text: `Booked ${bodyPart} MRI at ${location} on ${format(parseISO(date), "d MMM")} ${slot}. Check the bell icon for your booking notification.` });
      setReferralFile(null);
      setOtherDoctorName("");
      setOtherDoctorPractice("");
      setUsingReferralId(null);
      if (fileRef.current) fileRef.current.value = "";
    } else {
      setFeedback({ ok: false, text: result.error ?? "Booking failed. Try another slot." });
    }
  }

  return (
    <section id="book-an-mri" className="card p-5 sm:p-6">
      <SectionTitle
        icon={CalendarClock}
        title="Book an MRI"
        subtitle="Choose a scan, pick a slot, and attach your referral"
      />

      {pendingReferrals.length > 0 && !activeReferral && (
        <div className="mb-5 space-y-2">
          {pendingReferrals.map((r) => {
            const doctor = store.profiles.find((p) => p.id === r.referring_doctor_id);
            return (
              <div
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-sky-200 bg-sky-50 p-3"
              >
                <p className="text-sm text-sky-900">
                  <span className="font-semibold">{doctor?.full_name ?? "Your doctor"}</span> has referred you for a{" "}
                  <span className="font-semibold">{r.body_part} MRI</span>
                  {r.notes && <span className="block text-xs text-sky-700">&ldquo;{r.notes}&rdquo;</span>}
                </p>
                <button type="button" className="btn-primary shrink-0 text-xs" onClick={() => useReferral(r.id)}>
                  Use this referral
                </button>
              </div>
            );
          })}
        </div>
      )}

      <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="bk-body" className="label">Body part</label>
          <select id="bk-body" className="input" value={bodyPart} onChange={(e) => setBodyPart(e.target.value)}>
            {BODY_PARTS.map((b) => <option key={b}>{b}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="bk-loc" className="label">Location</label>
          <select id="bk-loc" className="input" value={location} onChange={(e) => setLocation(e.target.value)}>
            {LOCATIONS.map((l) => <option key={l}>{l}</option>)}
          </select>
        </div>
        <div className={usingOtherDoctor || activeReferral ? "md:col-span-2" : undefined}>
          <label className="label">Referring doctor</label>
          {activeReferral ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm">
              <p className="text-sky-900">
                Using referral from <span className="font-semibold">{activeReferralDoctor?.full_name ?? "your doctor"}</span>
              </p>
              <button
                type="button"
                className="text-xs font-semibold text-sky-700 underline-offset-2 hover:underline"
                onClick={() => setUsingReferralId(null)}
              >
                Choose a different doctor instead
              </button>
            </div>
          ) : (
            <>
              <select id="bk-doctor" className="input" value={referringDoctorId} onChange={(e) => setReferringDoctorId(e.target.value)}>
                <option value="">None — self-referred</option>
                {referringDoctors.map((d) => (
                  <option key={d.id} value={d.id}>{d.full_name}</option>
                ))}
                <option value="__other__">My doctor isn&rsquo;t listed</option>
              </select>

              {usingOtherDoctor && (
                <div className="mt-3 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="bk-doctor-name" className="label">Doctor&rsquo;s name</label>
                    <input
                      id="bk-doctor-name" className="input" placeholder="e.g. Dr. Sarah Kim"
                      value={otherDoctorName} onChange={(e) => setOtherDoctorName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label htmlFor="bk-doctor-practice" className="label">Practice / clinic <span className="font-normal text-slate-400">(optional)</span></label>
                    <input
                      id="bk-doctor-practice" className="input" placeholder="e.g. Northside Family Practice"
                      value={otherDoctorPractice} onChange={(e) => setOtherDoctorPractice(e.target.value)}
                    />
                  </div>
                  <p className="text-xs text-slate-500 sm:col-span-2">
                    We don&rsquo;t need their registration number or email — just attach a copy of your referral below and
                    our technician will verify it before your scan.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
        <div>
          <span className="label">Date</span>
          <AppointmentCalendar value={date} onChange={setDate} />
        </div>
        <div>
          <span className="label">Available time slots</span>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Time slot">
            {TIME_SLOTS.map((t) => {
              const taken = takenSlots.includes(t);
              const active = slot === t;
              return (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={taken}
                  onClick={() => setSlot(t)}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-medical ${
                    taken
                      ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 line-through"
                      : active
                      ? "border-medical bg-medical text-white"
                      : "border-slate-300 bg-white text-navy hover:border-medical"
                  }`}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </div>
        <div className="md:col-span-2">
          <label htmlFor="bk-ref" className="label">Referral document (PDF or image)</label>
          <input
            id="bk-ref" ref={fileRef} type="file" accept=".pdf,image/*"
            onChange={(e) => setReferralFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-medical-light file:px-4 file:py-2 file:text-sm file:font-semibold file:text-medical hover:file:bg-sky-100"
          />
          {referralFile && (
            <p className="mt-1 text-xs text-emerald-700">
              <Paperclip size={12} className="inline" aria-hidden /> {referralFile.name} ready — will upload to the secure referrals bucket
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 md:col-span-2">
          <p className="text-sm text-slate-600">
            Estimated fee: <span className="font-bold text-navy">${price.toFixed(2)}</span>{" "}
            <span className="text-xs text-slate-500">(card or insurance at check-in)</span>
          </p>
          <button type="submit" className="btn-primary" disabled={uploading}>
            <CalendarClock size={16} aria-hidden /> {uploading ? "Uploading referral…" : "Book appointment"}
          </button>
        </div>
      </form>
      {feedback && (
        <p
          role="status"
          className={`mt-4 flex items-start gap-2 rounded-lg p-3 text-sm ${
            feedback.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"
          }`}
        >
          {feedback.ok ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" aria-hidden /> : <XCircle size={16} className="mt-0.5 shrink-0" aria-hidden />}
          {feedback.text}
        </p>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Health profile form                                                 */
/* ------------------------------------------------------------------ */
function HealthProfileForm({ existing }: { existing?: import("@/shared/types").MedicalRecord }) {
  const store = useStore();
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
  const [saved, setSaved] = useState(false);

  function toggle(key: keyof Omit<Contraindications, "other">) {
    setContra((c) => ({ ...c, [key]: !c[key] }));
    setSaved(false);
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    store.updateRecord({
      history,
      contraindications: { ...contra, other: otherText.trim() || null },
      emergency_contact: { name: ecName, relationship: ecRel, phone: ecPhone },
    });
    setSaved(true);
  }

  return (
    <form onSubmit={save} className="grid gap-5 lg:grid-cols-2">
      <div className="space-y-4">
        <div>
          <label htmlFor="hp-history" className="label">Medical history</label>
          <textarea
            id="hp-history" rows={4} className="input"
            placeholder="Prior imaging, surgeries, relevant conditions"
            value={history} onChange={(e) => { setHistory(e.target.value); setSaved(false); }}
          />
        </div>
        <fieldset className="rounded-lg border border-slate-200 p-4">
          <legend className="px-1 text-sm font-bold text-navy">Emergency contact</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="ec-name" className="label">Name</label>
              <input id="ec-name" className="input" value={ecName} onChange={(e) => { setEcName(e.target.value); setSaved(false); }} />
            </div>
            <div>
              <label htmlFor="ec-rel" className="label">Relationship</label>
              <input id="ec-rel" className="input" value={ecRel} onChange={(e) => { setEcRel(e.target.value); setSaved(false); }} />
            </div>
            <div>
              <label htmlFor="ec-phone" className="label">Phone</label>
              <input id="ec-phone" type="tel" className="input" value={ecPhone} onChange={(e) => { setEcPhone(e.target.value); setSaved(false); }} />
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
            value={otherText} onChange={(e) => { setOtherText(e.target.value); setSaved(false); }}
          />
        </div>
      </fieldset>

      <div className="flex items-center gap-3 lg:col-span-2">
        <button type="submit" className="btn-primary">
          <HeartPulse size={16} aria-hidden /> Save health profile
        </button>
        {saved && (
          <span role="status" className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700">
            <CheckCircle2 size={16} aria-hidden /> Saved and logged to the audit trail
          </span>
        )}
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Mock DICOM download                                                 */
/* ------------------------------------------------------------------ */
function DownloadDicomButton({ scanId, bodyPart }: { scanId: string; bodyPart: string }) {
  function download() {
    // Build a small mock DICOM-style payload client-side and download it.
    const header = [
      "MOCK-DICOM v1.0 — Capital Radiology demo export",
      `SOPInstanceUID: 1.2.840.99999.${scanId}`,
      `BodyPartExamined: ${bodyPart.toUpperCase()}`,
      `Modality: MR`,
      `ExportedAt: ${new Date().toISOString()}`,
      "",
      "This file simulates a DICOM export. In production the app serves the",
      "real .dcm object from the private 'dicom' storage bucket via a signed URL.",
    ].join("\n");
    const blob = new Blob([header], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${scanId}-${bodyPart.replace(/\s+/g, "-").toLowerCase()}.dcm`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button type="button" onClick={download} className="btn-ghost text-xs">
      <Download size={14} aria-hidden /> Download DICOM
    </button>
  );
}
