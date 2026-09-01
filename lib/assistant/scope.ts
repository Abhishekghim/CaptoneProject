import { format } from "date-fns";
import type {
  Appointment, Billing, EquipmentLog, MedicalRecord, MriScan, Profile, RadiologyReport,
} from "@/lib/types";
import type { AssistantRole } from "./types";

export interface AssistantContext {
  role: AssistantRole;
  summary: string;
}

// Per-role scope resolver for the assistant. This is deliberately built to
// mirror the exact filtering each role's dashboard already uses (see
// PatientDashboard / TechnicianPortal / RadiologistWorkspace /
// ReferringDoctorPortal / AdminDashboard) — the assistant must never be able
// to see more than that user's own dashboard already shows them. For admin
// it's intentionally narrower than the dashboard: aggregate counts only, no
// patient names or content, per the product's explicit rule for that role.
//
// The `summary` string below is the ONLY representation of app data that
// ever reaches the LLM (see app/api/assistant/route.ts) — raw store arrays
// are never sent. That data-minimization is the real enforcement mechanism;
// the system prompt's "don't discuss anything outside this context" rule is
// a second layer on top of it, not a substitute for it.
//
// IMPORTANT CAVEAT: this app's auth is still the TEMPORARY local-only mode
// (see lib/auth/SessionContext.tsx) — there is no server session, so nothing
// here is verified server-side. Once real Supabase auth is wired in, this
// resolver's logic should move server-side (reading from the DB with RLS
// already scoping the query) so a tampered client request can't lie about
// its role. Until then, treat this as UI-layer scoping only, matching the
// rest of the app's current security posture.

export interface StoreSnapshot {
  currentUser: Profile;
  profiles: Profile[];
  appointments: Appointment[];
  scans: MriScan[];
  reports: RadiologyReport[];
  billing: Billing[];
  records: MedicalRecord[];
  equipment: EquipmentLog[];
}

export const PUBLIC_ASSISTANT_SUMMARY = `
Capital Radiology offers Brain, Spine, Joint, Abdomen and Pelvis MRI scans, plus CT, ultrasound and X-ray, across three Sydney clinics:
- Sydney CBD Clinic — Level 4, 88 Elizabeth Street, Sydney NSW 2000 — Mon-Fri 7:00am-7:00pm, Sat 8:00am-2:00pm
- Parramatta Imaging — Suite 2, 12 Church Street, Parramatta NSW 2150 — Mon-Fri 7:30am-6:00pm, Sat 8:00am-12:00pm
- Chatswood Centre — Level 1, 45 Victoria Avenue, Chatswood NSW 2067 — Mon-Fri 8:00am-6:00pm, Sat closed
Booking flow: create a free account, book an MRI online, attend the scan (usually 20-45 minutes), a radiologist reads and signs the report, results appear in the patient portal within about 24-48 hours.
MRI safety: patients must disclose pacemakers, defibrillators, cochlear implants, metal implants, surgical clips, shrapnel, or claustrophobia when booking.
Contact: 1300 722 674, care@capitalradiology.com.au.
`.trim();

export function buildAssistantContext(store: StoreSnapshot): AssistantContext {
  const me = store.currentUser;
  switch (me.role) {
    case "patient":
      return buildPatientContext(store, me);
    case "technician":
      return buildTechnicianContext(store, me);
    case "radiologist":
      return buildRadiologistContext(store, me);
    case "referring_doctor":
      return buildReferringDoctorContext(store, me);
    case "admin":
      return buildAdminContext(store, me);
    default:
      return { role: me.role, summary: "No authorized data available." };
  }
}

function buildPatientContext(store: StoreSnapshot, me: Profile): AssistantContext {
  const myAppointments = store.appointments.filter((a) => a.patient_id === me.id);
  const myRecord = store.records.find((r) => r.patient_id === me.id);
  const myReports = store.reports
    .filter((r) => r.status === "finalized")
    .map((r) => {
      const scan = store.scans.find((s) => s.id === r.scan_id);
      const apt = scan && store.appointments.find((a) => a.id === scan.appointment_id);
      return apt?.patient_id === me.id && scan ? { report: r, scan } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  const myBills = store.billing.filter((b) => myAppointments.some((a) => a.id === b.appointment_id));

  const lines: string[] = [`You are ${me.full_name}, a patient. This is only your own data.`];

  if (myAppointments.length === 0) {
    lines.push("Appointments: none on file.");
  } else {
    lines.push(`Appointments (${myAppointments.length}):`);
    myAppointments.forEach((a) => {
      lines.push(`- ${a.body_part} MRI, ${a.date} ${a.time_slot}, ${a.location} — status: ${a.status}`);
    });
  }

  if (myRecord) {
    const flags = Object.entries(myRecord.contraindications)
      .filter(([k, v]) => k !== "other" && v === true)
      .map(([k]) => k.replace(/_/g, " "));
    lines.push(`Health profile: DOB ${myRecord.dob}. Safety flags on file: ${flags.length ? flags.join(", ") : "none reported"}.`);
  } else {
    lines.push("Health profile: none on file yet.");
  }

  if (myReports.length === 0) {
    lines.push("Reports: no finalized reports yet.");
  } else {
    lines.push(`Finalized reports (${myReports.length}):`);
    myReports.forEach(({ report, scan }) => {
      lines.push(`- ${scan.body_part} MRI — findings: "${report.findings}" — impression: "${report.impression}"`);
    });
  }

  if (myBills.length > 0) {
    const pending = myBills.filter((b) => b.payment_status === "pending" || b.payment_status === "insurance_review");
    lines.push(`Billing: ${myBills.length} invoice(s) total, ${pending.length} unpaid/pending.`);
  }

  return { role: "patient", summary: lines.join("\n") };
}

function buildTechnicianContext(store: StoreSnapshot, me: Profile): AssistantContext {
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const queue = store.appointments
    .filter((a) => a.date === todayStr && (a.status === "scheduled" || a.status === "in_progress"))
    .sort((a, b) => a.time_slot.localeCompare(b.time_slot));
  const myScans = store.scans.filter((s) => s.technician_id === me.id);

  const lines: string[] = [`You are ${me.full_name}, a technician. Today's scan queue (${queue.length}):`];
  if (queue.length === 0) {
    lines.push("- Queue is empty.");
  } else {
    queue.forEach((a) => {
      const record = store.records.find((r) => r.patient_id === a.patient_id);
      const flags = record
        ? Object.entries(record.contraindications).filter(([k, v]) => k !== "other" && v === true).map(([k]) => k.replace(/_/g, " "))
        : [];
      lines.push(`- ${a.time_slot} ${a.body_part} MRI — status: ${a.status}${flags.length ? `; safety flags: ${flags.join(", ")}` : "; no safety flags on file"}`);
    });
  }
  if (myScans.length > 0) lines.push(`You have logged ${myScans.length} scan(s) this session.`);

  return { role: "technician", summary: lines.join("\n") };
}

function buildRadiologistContext(store: StoreSnapshot, me: Profile): AssistantContext {
  const unreported = store.scans.filter((s) => {
    const rep = store.reports.find((r) => r.scan_id === s.id);
    return !rep || rep.status === "draft";
  });
  const myFinalized = store.reports.filter((r) => r.status === "finalized" && r.radiologist_id === me.id);

  const lines: string[] = [`You are Dr. ${me.full_name}, a radiologist. Unreported queue (${unreported.length}):`];
  if (unreported.length === 0) {
    lines.push("- Queue is empty.");
  } else {
    unreported.forEach((s) => {
      const draft = store.reports.find((r) => r.scan_id === s.id);
      lines.push(
        `- Scan ${s.id}: ${s.body_part} MRI, protocol ${s.protocol} — ${
          draft ? `draft findings: "${draft.findings || "(empty)"}"; draft impression: "${draft.impression || "(empty)"}"` : "no draft yet"
        }`
      );
    });
  }
  lines.push(`You have finalized ${myFinalized.length} report(s).`);

  return { role: "radiologist", summary: lines.join("\n") };
}

function buildReferringDoctorContext(store: StoreSnapshot, me: Profile): AssistantContext {
  const myReferrals = store.appointments.filter((a) => a.referring_doctor_id === me.id);

  const lines: string[] = [`You are Dr. ${me.full_name}, a referring doctor. Patients you referred (${myReferrals.length}):`];
  if (myReferrals.length === 0) {
    lines.push("- None yet.");
  } else {
    myReferrals.forEach((a) => {
      const patient = store.profiles.find((p) => p.id === a.patient_id);
      const scan = store.scans.find((s) => s.appointment_id === a.id);
      const report = scan ? store.reports.find((r) => r.scan_id === scan.id) : undefined;
      const finalized = report?.status === "finalized";
      lines.push(
        `- ${patient?.full_name ?? "Unknown patient"} — ${a.body_part} MRI, ${a.date}, status: ${a.status}${
          finalized ? `; finalized impression: "${report!.impression}"` : "; report not finalized yet"
        }`
      );
    });
  }

  return { role: "referring_doctor", summary: lines.join("\n") };
}

function buildAdminContext(store: StoreSnapshot, me: Profile): AssistantContext {
  const now = new Date();
  const monthKey = format(now, "yyyy-MM");
  const todayStr = format(now, "yyyy-MM-dd");

  const totalScans = store.scans.length;
  const monthlyRevenue = store.billing
    .filter((b) => b.payment_status === "paid" && b.paid_at?.startsWith(monthKey))
    .reduce((sum, b) => sum + b.amount, 0);
  const pendingReports = store.scans.filter((s) => {
    const rep = store.reports.find((r) => r.scan_id === s.id);
    return !rep || rep.status === "draft";
  }).length;
  const todaysAppointments = store.appointments.filter((a) => a.date === todayStr && a.status !== "cancelled").length;
  const openBills = store.billing.filter((b) => b.payment_status !== "paid" && b.payment_status !== "refunded").length;
  const equipmentNeedsService = store.equipment.filter((e) => e.status !== "operational").length;

  const lines = [
    `You are ${me.full_name}, an admin. You only have clinic-wide operational metrics — no individual patient names, reports, or records:`,
    `- Total scans performed (all time): ${totalScans}`,
    `- Revenue this month (${format(now, "MMMM yyyy")}): $${monthlyRevenue.toFixed(2)}`,
    `- Pending reports awaiting sign-off: ${pendingReports}`,
    `- Appointments today: ${todaysAppointments}`,
    `- Open/unpaid invoices: ${openBills}`,
    `- Equipment needing service: ${equipmentNeedsService}`,
  ];

  return { role: "admin", summary: lines.join("\n") };
}
