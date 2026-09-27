"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addDays, format, parseISO } from "date-fns";
import { CalendarClock, CheckCircle2, Loader2, Paperclip, XCircle } from "lucide-react";
import { useStore } from "@/frontend/lib/store";
import { BODY_PARTS, LOCATIONS, TIME_SLOTS } from "@/frontend/lib/constants";
import { uploadToBucket } from "@/frontend/lib/storage";
import { createClient } from "@/frontend/lib/supabase/client";
import { notifyPatient } from "@/frontend/lib/notify";
import type { DoctorReferral } from "@/shared/types";
import { DatePickerField } from "@/frontend/components/shared/Calendar";
import PhoneVerificationStep from "@/frontend/components/shared/PhoneVerificationStep";
import { SectionTitle } from "@/frontend/components/shared/ui";
import { useProfiles } from "@/frontend/lib/hooks/useProfiles";
import { useScanPrices } from "@/frontend/lib/hooks/useScanPrices";

// Path A: referrals a doctor already sent this patient, waiting to be used —
// read straight from the real doctor_referrals table
// (backend/database/006_doctor_referrals.sql) instead of the mock store.
// RLS (doctor_referrals_read) already scopes reads to the patient's own
// rows; the used_in_appointment_id filter mirrors the mock's
// pendingReferrals filter exactly (only offer referrals not yet used).
// null = still loading.
function usePendingReferrals(patientId: string) {
  const [referrals, setReferrals] = useState<DoctorReferral[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("doctor_referrals")
      .select("*")
      .eq("patient_id", patientId)
      .is("used_in_appointment_id", null);
    if (error) {
      setLoadError(error.message);
      return;
    }
    setLoadError(null);
    setReferrals((data ?? []) as DoctorReferral[]);
  }, [patientId]);

  useEffect(() => {
    load();
  }, [load]);

  return { referrals, loadError, reload: load };
}

// Which of TIME_SLOTS are already taken for a date+location — real-time,
// server-checked (get_taken_slots, 035_available_slots_rpc.sql), mirroring
// the DB's own no_double_booking unique (date, time_slot, location)
// constraint exactly rather than approximating it client-side. null = still
// loading (so the UI can distinguish "checking" from "confirmed clear").
function useTakenSlots(date: string, location: string) {
  const [taken, setTaken] = useState<string[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setTaken(null);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("get_taken_slots", { p_date: date, p_location: location });
    if (error) {
      // Fail open — an unknown availability isn't a reason to block booking
      // outright, book_appointment's own unique-violation catch is still the
      // authoritative backstop either way.
      setLoadError(error.message);
      setTaken([]);
      return;
    }
    setLoadError(null);
    setTaken((data ?? []) as string[]);
  }, [date, location]);

  useEffect(() => {
    load();
  }, [load]);

  return { taken, loadError, reload: load };
}

/* ------------------------------------------------------------------ */
/* Booking form                                                        */
/* ------------------------------------------------------------------ */
export default function BookingCard({ onBooked }: { onBooked: () => void }) {
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

  // Phone verification is no longer a login-time gate (see
  // app/(app)/layout.tsx) — it's asked for contextually, right when a patient
  // confirms their first MRI booking, since that's the first moment the app
  // actually needs to be able to reach them by SMS. `null` = not checked yet,
  // so submit() doesn't act on a stale/default value before the check lands.
  const [phoneConfirmed, setPhoneConfirmed] = useState<boolean | null>(null);
  const [showPhoneVerification, setShowPhoneVerification] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setPhoneConfirmed(Boolean(data.user?.phone_confirmed_at));
    });
  }, []);

  // profiles_read_referring_doctor_directory RLS
  // (backend/database/030_referring_doctor_directory_read.sql) lets any
  // authenticated user read role='referring_doctor' profiles specifically —
  // added alongside this migration because profiles_select_own_or_staff
  // alone (schema.sql) only lets a patient read their own profile row, which
  // would otherwise leave this picker permanently empty.
  const { data: profilesData, loadError: profilesLoadError } = useProfiles();
  const referringDoctors = (profilesData ?? []).filter((p) => p.role === "referring_doctor");
  const usingOtherDoctor = referringDoctorId === "__other__";

  const {
    referrals: pendingReferralsData,
    loadError: pendingReferralsError,
    reload: reloadPendingReferrals,
  } = usePendingReferrals(me.id);
  const pendingReferrals = pendingReferralsData ?? [];
  const activeReferral = usingReferralId ? pendingReferrals.find((r) => r.id === usingReferralId) : undefined;
  const activeReferralDoctor = activeReferral
    ? (profilesData ?? []).find((p) => p.id === activeReferral.referring_doctor_id)
    : undefined;

  function useReferral(referralId: string) {
    const ref = pendingReferrals.find((r) => r.id === referralId);
    if (!ref) return;
    setUsingReferralId(referralId);
    setBodyPart(ref.body_part);
    setReferringDoctorId("");
    setFeedback(null);
  }

  const { taken: takenSlotsData, loadError: takenSlotsError, reload: reloadTakenSlots } = useTakenSlots(date, location);
  const takenSlots = useMemo(() => new Set(takenSlotsData ?? []), [takenSlotsData]);
  const slotsLoading = takenSlotsData === null;

  // Ticks every 30s so a slot that's still in the future when the page loads
  // correctly becomes disabled if the patient leaves this tab open past it,
  // without needing a reload — "real-time" per the actual clock, not just
  // whatever time it happened to be on mount.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const isToday = date === format(now, "yyyy-MM-dd");
  const currentHm = format(now, "HH:mm");
  // "HH:mm" strings compare correctly with plain < since they're fixed-width
  // and zero-padded (TIME_SLOTS, frontend/lib/constants.ts).
  const isPastSlot = useCallback((t: string) => isToday && t <= currentHm, [isToday, currentHm]);

  const availableSlots = TIME_SLOTS.filter((t) => !takenSlots.has(t) && !isPastSlot(t));

  // Keep the selection valid as the date/location/clock change — drop to the
  // next open slot rather than silently submitting a stale, now-unavailable
  // one.
  useEffect(() => {
    if (slotsLoading) return;
    if (availableSlots.includes(slot)) return;
    setSlot(availableSlots[0] ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when the available set itself changes, not on every `slot` write
  }, [slotsLoading, availableSlots.join(","), slot]);

  const { data: scanPrices, loadError: scanPricesLoadError } = useScanPrices();
  const price = (scanPrices ?? {})[bodyPart] ?? 480;

  async function submit(e: React.FormEvent) {
    e.preventDefault();

    if (!slot) return; // button is disabled anyway; belt and braces
    if (!activeReferral && usingOtherDoctor && !otherDoctorName.trim()) {
      setFeedback({ ok: false, text: "Enter your doctor's name, or choose \"None — self-referred\" instead." });
      return;
    }
    if (!activeReferral && usingOtherDoctor && !referralFile) {
      setFeedback({ ok: false, text: "Since your doctor isn't in our system yet, please attach a copy of your referral so our technician can verify it." });
      return;
    }

    // First MRI booking (or any booking, until they verify once) — ask for
    // and confirm a phone number before actually creating the appointment.
    // The form fields entered above are left exactly as they are; only the
    // visible UI swaps to the verification step. completeBooking() below
    // reads bodyPart/date/slot/etc. straight from this component's state
    // once verification succeeds, so nothing entered so far is lost.
    if (phoneConfirmed === false) {
      setShowPhoneVerification(true);
      return;
    }

    await completeBooking();
  }

  async function completeBooking() {
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

    const finalReferringDoctorId = usingOtherDoctor || !referringDoctorId ? null : referringDoctorId;
    const supabase = createClient();
    const { data, error } = await supabase.rpc("book_appointment", {
      p_patient_id: me.id,
      p_date: date,
      p_time_slot: slot,
      p_location: location,
      p_body_part: bodyPart,
      p_referring_doctor_id: usingReferralId ? null : finalReferringDoctorId,
      p_referring_doctor_name: usingOtherDoctor ? otherDoctorName.trim() || null : null,
      p_referring_doctor_practice: usingOtherDoctor ? otherDoctorPractice.trim() || null : null,
      p_referral_url: referralPath,
      p_amount: price,
      p_payment_type: null,
      p_referral_id: usingReferralId || null,
    });

    if (error) {
      setFeedback({ ok: false, text: error.message ?? "Booking failed. Try another slot." });
      // Someone else could have taken this slot in the gap between our last
      // availability check and this submit — refresh so it shows as taken
      // immediately instead of waiting for the next date/location change.
      reloadTakenSlots();
      return;
    }

    // book_appointment (backend/database/033_booking_review_gate.sql) returns
    // the full appointment row, including `confirmed` — a self-booking for a
    // body part that needs clinical sign-off, or with a referring
    // doctor/referral attached, comes back with confirmed = false pending
    // reception review (see ReceptionDashboard.tsx's "Unconfirmed" queue).
    const bookedConfirmed = Boolean((data as { confirmed?: boolean } | null)?.confirmed);
    setFeedback({
      ok: true,
      text: `Booked ${bodyPart} MRI at ${location} on ${format(parseISO(date), "d MMM")} ${slot}. Check the bell icon for your booking notification.${
        bookedConfirmed ? "" : " — pending reception review before it's finalized."
      }`,
    });
    setReferralFile(null);
    setOtherDoctorName("");
    setOtherDoctorPractice("");
    setUsingReferralId(null);
    if (fileRef.current) fileRef.current.value = "";
    // A referral used above just got used_in_appointment_id set by
    // book_appointment — refetch so it drops out of the "waiting to be used" list.
    if (usingReferralId) reloadPendingReferrals();
    reloadTakenSlots();
    onBooked();

    notifyPatient(
      me.id,
      "appointment_booked",
      "Appointment booked",
      `<p>${bodyPart} MRI — ${location} on ${date} at ${slot}.</p>`,
      data.id
    );
  }

  return (
    <section id="book-an-mri" className="card p-5 sm:p-6">
      <SectionTitle
        icon={CalendarClock}
        title="Book an MRI"
        subtitle="Choose a scan, pick a slot, and attach your referral"
      />

      {(pendingReferralsError || profilesLoadError || scanPricesLoadError) && (
        <p role="alert" className="mb-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {pendingReferralsError && `Could not check for existing referrals: ${pendingReferralsError}`}
          {profilesLoadError && `Could not load referring doctors: ${profilesLoadError}`}
          {scanPricesLoadError && `Could not load pricing: ${scanPricesLoadError}`}
        </p>
      )}

      {pendingReferrals.length > 0 && !activeReferral && (
        <div className="mb-5 space-y-2">
          {pendingReferrals.map((r) => {
            const doctor = (profilesData ?? []).find((p) => p.id === r.referring_doctor_id);
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
          <DatePickerField value={date} onChange={setDate} />
        </div>
        <div>
          <span className="label flex items-center gap-1.5">
            Available time slots
            {slotsLoading && <Loader2 size={12} className="animate-spin text-slate-400" aria-hidden />}
          </span>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Time slot">
            {TIME_SLOTS.map((t) => {
              const active = slot === t;
              const isTaken = takenSlots.has(t);
              const isPast = isPastSlot(t);
              const disabled = slotsLoading || isTaken || isPast;
              return (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-disabled={disabled}
                  disabled={disabled}
                  title={isPast ? "This time has already passed today" : isTaken ? "This slot is already booked" : undefined}
                  onClick={() => setSlot(t)}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-medical ${
                    active
                      ? "border-medical bg-medical text-white"
                      : disabled
                        ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-300 line-through"
                        : "border-slate-300 bg-white text-navy hover:border-medical"
                  }`}
                >
                  {t}
                </button>
              );
            })}
          </div>
          {takenSlotsError && (
            <p className="mt-1 text-[11px] text-amber-600">
              Couldn&rsquo;t check live availability ({takenSlotsError}) — all times are shown open; a clash still gets caught when you confirm below.
            </p>
          )}
          {!slotsLoading && !takenSlotsError && (
            availableSlots.length === 0 ? (
              <p className="mt-1 text-[11px] font-semibold text-rose-600">No slots left for this date at this location — try another day or clinic.</p>
            ) : (
              <p className="mt-1 text-[11px] text-slate-400">Greyed-out times are already booked or have passed today — updates live as slots fill up.</p>
            )
          )}
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
        {!showPhoneVerification && (
          <div className="flex flex-wrap items-center justify-between gap-3 md:col-span-2">
            <p className="text-sm text-slate-600">
              Estimated fee: <span className="font-bold text-navy">${price.toFixed(2)}</span>{" "}
              <span className="text-xs text-slate-500">(card or insurance at check-in)</span>
            </p>
            <button type="submit" className="btn-primary" disabled={uploading || slotsLoading || !slot}>
              <CalendarClock size={16} aria-hidden /> {uploading ? "Uploading referral…" : "Book appointment"}
            </button>
          </div>
        )}
      </form>
      {showPhoneVerification && (
        <div className="mt-4">
          <p className="mb-3 text-sm text-slate-600">
            Quick one-time step: confirm your phone number to finish booking. We&rsquo;ll text you a code — once
            verified, we won&rsquo;t ask again.
          </p>
          <PhoneVerificationStep
            onVerified={() => {
              setPhoneConfirmed(true);
              setShowPhoneVerification(false);
              completeBooking();
            }}
            onCancel={() => setShowPhoneVerification(false)}
          />
        </div>
      )}
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
