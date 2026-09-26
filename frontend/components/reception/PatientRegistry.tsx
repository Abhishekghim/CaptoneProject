"use client";

import React, { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { AlertTriangle, CalendarClock, Search, UserPlus } from "lucide-react";
import { BODY_PARTS, LOCATIONS, PAYMENT_TYPES, TIME_SLOTS } from "@/frontend/lib/constants";
import { AppointmentCalendar } from "@/frontend/components/shared/Calendar";
import { EmptyState, SectionTitle, StatusChip } from "@/frontend/components/shared/ui";
import { createClient } from "@/frontend/lib/supabase/client";
import { notifyPatient } from "@/frontend/lib/notify";
import { useProfiles, type ProfileRow } from "@/frontend/lib/hooks/useProfiles";
import { useMedicalRecords, type MedicalRecordRow } from "@/frontend/lib/hooks/useMedicalRecords";
import { useAppointments } from "@/frontend/lib/hooks/useAppointments";
import { useScanPrices } from "@/frontend/lib/hooks/useScanPrices";
import type { Appointment } from "@/shared/types";

const SEX_OPTIONS = ["Female", "Male", "Non-binary", "Prefer not to say"];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Loose Australian mobile/landline check — accepts spaces and an optional
// +61, without rejecting legitimate formats reception will actually see.
const PHONE_PATTERN = /^(\+?61|0)[\d ]{8,11}$/;

export default function PatientRegistry({ initialPatientId }: { initialPatientId: string | null }) {
  const [query, setQuery] = useState("");
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(initialPatientId);
  const [showRegister, setShowRegister] = useState(false);

  const { data: profiles, loadError: profilesLoadError, reload: reloadProfiles } = useProfiles();
  const { data: records, loadError: recordsLoadError, reload: reloadRecords } = useMedicalRecords();
  const { data: appointments, loadError: aptLoadError, reload: reloadAppointments } = useAppointments();

  useEffect(() => {
    if (initialPatientId) setSelectedPatientId(initialPatientId);
  }, [initialPatientId]);

  const patients = (profiles ?? []).filter((p) => p.role === "patient");

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase().replace(/\s+/g, "");
    if (!needle) return [];
    return patients
      .filter((p) => {
        const record = (records ?? []).find((r) => r.patient_id === p.id);
        const haystacks = [p.full_name, p.email, p.phone ?? "", record?.patient_code ?? "", record?.dob ?? ""]
          .map((s) => s.toLowerCase().replace(/\s+/g, ""));
        return haystacks.some((h) => h.includes(needle));
      })
      .slice(0, 20);
  }, [query, patients, records]);

  const selectedPatient = selectedPatientId ? patients.find((p) => p.id === selectedPatientId) ?? null : null;
  const loadError = profilesLoadError || recordsLoadError || aptLoadError;

  return (
    <div className="space-y-6">
      <section className="card p-5 sm:p-6">
        <SectionTitle
          icon={Search}
          title="Patient search"
          subtitle="Search by name, DOB, mobile, email, or patient code"
          action={
            <button type="button" onClick={() => setShowRegister((v) => !v)} className="btn-primary text-xs">
              <UserPlus size={14} aria-hidden /> New patient
            </button>
          }
        />
        {loadError && (
          <p role="alert" className="mb-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
            Could not load patient data: {loadError}
          </p>
        )}
        {showRegister && (
          <RegisterPatientForm
            onRegistered={(id) => {
              setSelectedPatientId(id);
              setShowRegister(false);
              setQuery("");
              reloadProfiles();
              reloadRecords();
            }}
            onCancel={() => setShowRegister(false)}
          />
        )}
        <label className="sr-only" htmlFor="patient-search">Search patients</label>
        <input
          id="patient-search" className="input" placeholder="Start typing a name, DOB (yyyy-mm-dd), mobile, or patient code…"
          value={query} onChange={(e) => setQuery(e.target.value)}
        />
        {query.trim() && (
          results.length === 0 ? (
            <EmptyState message="No matching patients" hint="Check spelling, or register them as a new patient." />
          ) : (
            <ul className="mt-3 divide-y divide-slate-100">
              {results.map((p) => {
                const record = (records ?? []).find((r) => r.patient_id === p.id);
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedPatientId(p.id)}
                      className="w-full rounded-md px-2 py-2.5 text-left hover:bg-slate-50"
                    >
                      <p className="font-semibold text-navy">{p.full_name}</p>
                      <p className="text-xs text-slate-500">
                        {record?.dob && `DOB ${format(parseISO(record.dob), "d MMM yyyy")}`}
                        {record?.patient_code && ` · ${record.patient_code}`}
                        {p.phone && ` · ${p.phone}`}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )
        )}
      </section>

      {selectedPatient && (
        <PatientProfile
          patient={selectedPatient}
          profiles={profiles ?? []}
          appointments={appointments ?? []}
          record={(records ?? []).find((r) => r.patient_id === selectedPatient.id) ?? null}
          onAppointmentBooked={reloadAppointments}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
function RegisterPatientForm({ onRegistered, onCancel }: { onRegistered: (patientId: string) => void; onCancel: () => void }) {
  const [fullName, setFullName] = useState("");
  const [dob, setDob] = useState("");
  const [sex, setSex] = useState("");
  const [preferredName, setPreferredName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [suburb, setSuburb] = useState("");
  const [state, setState] = useState("NSW");
  const [postcode, setPostcode] = useState("");
  const [medicareNumber, setMedicareNumber] = useState("");
  const [medicareExpiry, setMedicareExpiry] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<{ id: string; full_name: string; dob: string; phone?: string }[] | null>(null);
  const [busy, setBusy] = useState(false);

  function validate(): string | null {
    if (!fullName.trim()) return "Full name is required.";
    if (!dob) return "Date of birth is required.";
    if (new Date(dob) > new Date()) return "Date of birth can't be in the future.";
    if (phone.trim() && !PHONE_PATTERN.test(phone.trim())) return "Enter a valid Australian phone number.";
    if (email.trim() && !EMAIL_PATTERN.test(email.trim())) return "Enter a valid email address.";
    return null;
  }

  async function submit(e: React.FormEvent, forceCreate = false) {
    e.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/reception/patients/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName, dob, sex: sex || null, preferredName: preferredName.trim() || null,
          phone: phone.trim(), email: email.trim(),
          address: address.trim() || null, suburb: suburb.trim() || null, state: state || null, postcode: postcode.trim() || null,
          medicareNumber: medicareNumber.trim() || null, medicareExpiry: medicareExpiry || null,
          forceCreate,
        }),
      });
      const result = await res.json();
      if (!res.ok) {
        setError(result.error || "Could not register this patient.");
        return;
      }
      if (!result.ok) {
        setDuplicates(result.possibleDuplicates);
        return;
      }
      onRegistered(result.patientId as string);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (duplicates) {
    return (
      <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-900">
          <AlertTriangle size={15} aria-hidden /> Possible existing patient found
        </p>
        <p className="mt-1 text-xs text-amber-800">Someone with a matching name and DOB or mobile already exists. Use the existing record, or confirm this is a different person.</p>
        <ul className="mt-3 space-y-2">
          {duplicates.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-white p-2.5 text-sm">
              <span>
                <span className="font-semibold text-navy">{d.full_name}</span>
                {d.dob && ` — DOB ${format(parseISO(d.dob), "d MMM yyyy")}`}
                {d.phone && ` — ${d.phone}`}
              </span>
              <button type="button" className="btn-ghost px-2.5 py-1 text-xs" onClick={() => onRegistered(d.id)}>Use this patient</button>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex gap-2">
          <button type="button" disabled={busy} className="btn-primary text-xs" onClick={(e) => submit(e, true)}>{busy ? "Creating…" : "Create new patient anyway"}</button>
          <button type="button" disabled={busy} className="btn-ghost text-xs" onClick={() => setDuplicates(null)}>Back to form</button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mb-4 space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <fieldset>
        <legend className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Patient details</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label htmlFor="reg-name" className="label">Full name *</label>
            <input id="reg-name" className="input" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div>
            <label htmlFor="reg-preferred" className="label">Preferred name</label>
            <input id="reg-preferred" className="input" value={preferredName} onChange={(e) => setPreferredName(e.target.value)} />
          </div>
          <div>
            <label htmlFor="reg-dob" className="label">Date of birth *</label>
            <input id="reg-dob" type="date" className="input" required max={format(new Date(), "yyyy-MM-dd")} value={dob} onChange={(e) => setDob(e.target.value)} />
          </div>
          <div>
            <label htmlFor="reg-sex" className="label">Sex</label>
            <select id="reg-sex" className="input" value={sex} onChange={(e) => setSex(e.target.value)}>
              <option value="">Not specified</option>
              {SEX_OPTIONS.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="reg-phone" className="label">Mobile</label>
            <input id="reg-phone" className="input" placeholder="04XX XXX XXX" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="reg-email" className="label">Email</label>
            <input id="reg-email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="sm:col-span-3">
            <label htmlFor="reg-address" className="label">Address</label>
            <input id="reg-address" className="input" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div>
            <label htmlFor="reg-suburb" className="label">Suburb</label>
            <input id="reg-suburb" className="input" value={suburb} onChange={(e) => setSuburb(e.target.value)} />
          </div>
          <div>
            <label htmlFor="reg-state" className="label">State</label>
            <select id="reg-state" className="input" value={state} onChange={(e) => setState(e.target.value)}>
              {["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"].map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="reg-postcode" className="label">Postcode</label>
            <input id="reg-postcode" className="input" value={postcode} onChange={(e) => setPostcode(e.target.value)} />
          </div>
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Identification (optional)</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="reg-medicare" className="label">Medicare number</label>
            <input id="reg-medicare" className="input" placeholder="XXXX XXXXX X" value={medicareNumber} onChange={(e) => setMedicareNumber(e.target.value)} />
          </div>
          <div>
            <label htmlFor="reg-medicare-exp" className="label">Medicare expiry</label>
            <input id="reg-medicare-exp" type="month" className="input" value={medicareExpiry} onChange={(e) => setMedicareExpiry(e.target.value)} />
          </div>
        </div>
      </fieldset>

      {error && <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="btn-primary text-xs">{busy ? "Registering…" : "Register patient"}</button>
        <button type="button" disabled={busy} className="btn-ghost text-xs" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ */
function PatientProfile({
  patient, profiles, appointments, record, onAppointmentBooked,
}: {
  patient: ProfileRow;
  profiles: ProfileRow[];
  appointments: Appointment[];
  record: MedicalRecordRow | null;
  onAppointmentBooked: () => void;
}) {
  const [showBook, setShowBook] = useState(false);
  const patientAppointments = appointments.filter((a) => a.patient_id === patient.id).sort((a, b) => (a.date < b.date ? 1 : -1));
  const upcoming = patientAppointments.filter((a) => a.status === "scheduled" && a.date >= format(new Date(), "yyyy-MM-dd"));
  const past = patientAppointments.filter((a) => !upcoming.includes(a));

  return (
    <section className="card space-y-6 p-5 sm:p-6">
      <div>
        <SectionTitle
          icon={UserPlus}
          title={patient.full_name}
          subtitle={record?.patient_code ? `Patient ${record.patient_code}` : "Patient"}
          action={
            <button type="button" className="btn-primary text-xs" onClick={() => setShowBook((v) => !v)}>
              <CalendarClock size={14} aria-hidden /> Book appointment
            </button>
          }
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-slate-200 p-3 text-sm">
            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">Overview</p>
            <p><span className="text-slate-500">DOB:</span> {record?.dob ? format(parseISO(record.dob), "d MMM yyyy") : "Not on file"}</p>
            <p><span className="text-slate-500">Phone:</span> {patient.phone || "Not on file"}</p>
            <p><span className="text-slate-500">Email:</span> {patient.email || "Not on file"}</p>
            {record?.address && <p><span className="text-slate-500">Address:</span> {record.address}, {record.suburb} {record.state} {record.postcode}</p>}
            {record?.medicare_number && <p><span className="text-slate-500">Medicare:</span> {record.medicare_number} (exp {record.medicare_expiry})</p>}
            {(!patient.phone || !patient.email) && (
              <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-amber-700">
                <AlertTriangle size={12} aria-hidden /> Missing contact information
              </p>
            )}
          </div>
          <div className="rounded-lg border border-slate-200 p-3 text-sm">
            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">Upcoming appointments</p>
            {upcoming.length === 0 ? (
              <p className="text-xs text-slate-400">None scheduled</p>
            ) : (
              upcoming.map((a) => (
                <p key={a.id}>{format(parseISO(a.date), "d MMM yyyy")} {a.time_slot} — {a.body_part} <StatusChip status={a.status} /></p>
              ))
            )}
          </div>
        </div>
      </div>

      {showBook && (
        <BookForPatientForm
          patientId={patient.id}
          appointments={appointments}
          onDone={() => {
            setShowBook(false);
            onAppointmentBooked();
          }}
        />
      )}

      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Appointment history</p>
        {past.length === 0 ? (
          <EmptyState message="No past appointments" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {past.map((a) => {
              const referring = a.referring_doctor_id ? profiles.find((p) => p.id === a.referring_doctor_id)?.full_name : a.referring_doctor_name;
              return (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span>{format(parseISO(a.date), "d MMM yyyy")} — {a.body_part} — {a.location}{referring && ` — referred by ${referring}`}</span>
                  <StatusChip status={a.status} />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
function BookForPatientForm({
  patientId, appointments, onDone,
}: {
  patientId: string;
  appointments: Appointment[];
  onDone: () => void;
}) {
  const { data: scanPrices } = useScanPrices();
  const [bodyPart, setBodyPart] = useState(BODY_PARTS[0]);
  const [location, setLocation] = useState(LOCATIONS[0]);
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [slot, setSlot] = useState(TIME_SLOTS[0]);
  const [paymentType, setPaymentType] = useState(PAYMENT_TYPES[0]);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const takenSlots = appointments
    .filter((a) => a.date === date && a.location === location && a.status !== "cancelled")
    .map((a) => a.time_slot);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const supabase = createClient();
    const { data, error } = await supabase.rpc("book_appointment", {
      p_patient_id: patientId,
      p_date: date,
      p_time_slot: slot,
      p_location: location,
      p_body_part: bodyPart,
      p_referring_doctor_id: null,
      p_referring_doctor_name: null,
      p_referring_doctor_practice: null,
      p_referral_url: null,
      p_amount: (scanPrices ?? {})[bodyPart] ?? 480,
      p_payment_type: paymentType,
      p_referral_id: null,
    });
    if (error) {
      setFeedback({ ok: false, text: error.message ?? "Could not book this appointment." });
      return;
    }
    setFeedback({ ok: true, text: "Appointment booked." });
    notifyPatient(
      patientId,
      "appointment_booked",
      "Appointment booked",
      `<p>${bodyPart} MRI — ${location} on ${date} at ${slot}.</p>`,
      data.id
    );
    setTimeout(onDone, 900);
  }

  return (
    <form onSubmit={submit} className="grid gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 md:grid-cols-2">
      <div>
        <label className="label">Date</label>
        <AppointmentCalendar value={date} onChange={setDate} />
      </div>
      <div className="space-y-3">
        <div>
          <label htmlFor="bfp-body" className="label">Examination</label>
          <select id="bfp-body" className="input" value={bodyPart} onChange={(e) => setBodyPart(e.target.value)}>
            {BODY_PARTS.map((b) => <option key={b}>{b}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="bfp-loc" className="label">Location</label>
          <select id="bfp-loc" className="input" value={location} onChange={(e) => setLocation(e.target.value)}>
            {LOCATIONS.map((l) => <option key={l}>{l}</option>)}
          </select>
        </div>
        <div>
          <span className="label">Time slot</span>
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
        </div>
        <div>
          <label htmlFor="bfp-payment" className="label">Payment type</label>
          <select id="bfp-payment" className="input" value={paymentType} onChange={(e) => setPaymentType(e.target.value)}>
            {PAYMENT_TYPES.map((p) => <option key={p}>{p}</option>)}
          </select>
        </div>
        <button type="submit" className="btn-primary text-xs">Confirm booking</button>
        {feedback && (
          <p role="status" className={`rounded-md p-2 text-xs font-semibold ${feedback.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>
            {feedback.text}
          </p>
        )}
      </div>
    </form>
  );
}
