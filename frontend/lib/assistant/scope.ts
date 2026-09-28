import { format } from "date-fns";
import type {
  Appointment, Billing, EquipmentLog, MriScan, Profile, RadiologyReport,
} from "@/shared/types";
import type { AssistantRole } from "@/shared/assistant/types";
import { deriveReferralStatus } from "@/shared/deriveReferralStatus";
import type { ProfileRow } from "@/frontend/lib/hooks/useProfiles";
import type { MedicalRecordRow } from "@/frontend/lib/hooks/useMedicalRecords";

export interface AssistantContext {
  role: AssistantRole;
  summary: string;
}

// Per-role scope resolver for the assistant. This is deliberately built to
// mirror the exact filtering each role's dashboard already uses (see the
// patient dashboard pages under app/(app)/dashboard/* / TechnicianPortal /
// RadiologistWorkspace / ReferringDoctorPortal / AdminDashboard) — the assistant must never be able
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
// CAVEAT: role/userId are verified server-side against real Supabase Auth
// before this summary is ever accepted (app/api/assistant/route.ts), but the
// summary text itself is still built here, client-side, and trusted as-is by
// that route. A tampered client can't claim a different role, but it could
// still hand-craft a misleading summary for its own (legitimately verified)
// role. Building this from a server-side DB query would close that gap.

// profiles/records use the real hooks' row types (ProfileRow / MedicalRecordRow
// from frontend/lib/hooks/) rather than shared/types.ts's Profile/MedicalRecord —
// those hook types mirror the actual DB columns (e.g. ProfileRow adds
// is_active; MedicalRecordRow's history/patient_code/emergency_contact fields
// are nullable) and are what Shell.tsx now actually has on hand. Every field
// the per-role builders below read (dob, contraindications, full_name, ...)
// exists on both shapes, so this widening doesn't change any of that logic.
export interface StoreSnapshot {
  currentUser: Profile;
  profiles: ProfileRow[];
  appointments: Appointment[];
  scans: MriScan[];
  reports: RadiologyReport[];
  billing: Billing[];
  records: MedicalRecordRow[];
  equipment: EquipmentLog[];
}

export const PUBLIC_ASSISTANT_SUMMARY = `
Capital Radiology is a major provider of diagnostic imaging in Victoria, with 40+ clinics across Melbourne, and is part of Integral Diagnostics (IDX). Services: MRI, CT, general X-ray, ultrasound, mammography, bone densitometry, nuclear medicine, CT coronary angiography, echocardiography, lung cancer screening, interventional procedures (including osteoarthritis injections) and dental imaging (OPG). MRI can be booked online through this portal.
MRI clinics (all VIC):
- Berwick — 286 Clyde Road, Berwick VIC 3806 — (03) 8773 5788 — Mon–Fri: 8:30am – 5:30pm, Sat: 9am – 1pm
- Camberwell — 607-609 Riversdale Road, Camberwell VIC 3124 — (03) 8808 7688 — Mon–Fri: 8:30am – 5pm, Sat: Closed
- Cheltenham — 4/10 Jamieson Street, Cheltenham VIC 3192 — (03) 9262 5488 — Mon–Fri: 8:30am – 5pm, Sat: 9am – 1pm
- Clayton Monash House — Suite 1, 271 Clayton Road, Clayton VIC 3168 — (03) 8546 6288 — Mon–Fri: 8:30am – 5pm, Sat: 9am – 1pm
- Cranbourne — 130-132 South Gippsland Highway, Cranbourne VIC 3977 — (03) 5911 5200 — Mon–Fri: 9am – 5pm, Sat: Closed
- Dandenong — 54/56 Princes Highway, Dandenong VIC 3175 — (03) 8788 9888 — Mon–Fri: 9am – 5pm, Sat: 9am – 1pm
- Epping — 1/500 High Street, Epping VIC 3076 — (03) 8401 8401 — Mon–Fri: 8:30am – 5pm, Sat: Closed
- Footscray Western Private Hospital — Western Private Hospital - Corner Eleanor and Marion Streets, Footscray VIC 3011 — (03) 9236 4088 — Mon–Fri: 9am – 5pm, Sat: 9am – 1pm
- Niddrie — 1 Treadwell Road, Niddrie VIC 3042 — (03) 9334 3434 — Mon–Fri: 9am – 5pm, Sat: Closed
- Pakenham — Suite 1, 20 Station St, Pakenham VIC 3810 — (03) 5929 8100 — Mon–Fri: 9am – 5pm, Sat: Closed
- Spotswood — G3-4/30 Macindoe Ct, Spotswood VIC 3015 — (03) 9688 2888 — Mon–Fri: 9am – 5pm, Sat: Closed
- Sunshine Private Hospital — Ground Floor, 145 Furlong Road, St Albans VIC 3021 — (03) 8312 7888 — Mon–Fri: 8:30am – 5pm, Sat: 9am – 1pm
- Sydenham — 530-532 Melton Highway, Sydenham VIC 3037 — (03) 8361 4488 — Mon–Fri: 9am – 5pm, Sat: Closed
- Vermont Private — Ground Floor 645-647 Burwood Highway, Vermont VIC 3133 — (03) 9841 2555 — Mon–Fri: 9am – 5pm, Sat: 9am – 1pm
- Werribee — 27 Princes Highway, Werribee VIC 3030 — (03) 8734 3222 — Mon–Fri: 9am – 5pm, Sat: Closed
Full list of all 40+ clinics: capitalradiology.com.au/locations/
Booking flow: create a free account, book an MRI online, attend the scan (length depends on the type of MRI), a radiologist reports on the images, and the referring doctor typically receives the report within 2-3 business days.
Billing: most services are bulk-billed; pensioners and health care card holders are bulk-billed; some specialised services, including certain MRI procedures, may have limited or no Medicare coverage. Private health insurance only covers imaging for private hospital inpatients.
Walk-ins: X-ray and dental imaging only.
Referrals: a referral is NOT required to book — patients can self-refer and choose "None — self-referred" at booking. If a patient does have a referring doctor, they can select one already in the system, or name a doctor who isn't yet (attaching a copy of the referral so a technician can verify it before the scan). Never tell a visitor a referral is required to book with Capital Radiology — it isn't.
MRI safety: patients must disclose pacemakers, defibrillators, cochlear implants, metal implants, surgical clips, shrapnel, or claustrophobia when booking.
Contact: phone the nearest clinic (numbers above); postal address PO Box 551, East Melbourne VIC 8002; general enquiries via capitalradiology.com.au/about/general-enquiry/.
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
    case "super_admin":
      return buildAdminContext(store, me);
    case "reception":
      return buildReceptionContext(store, me);
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

function buildReceptionContext(store: StoreSnapshot, me: Profile): AssistantContext {
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const today = store.appointments
    .filter((a) => a.date === todayStr && a.status !== "cancelled")
    .sort((a, b) => a.time_slot.localeCompare(b.time_slot));

  // Deliberately administrative only — arrival/referral/payment status, no
  // findings/impressions/contraindications. Mirrors ReceptionDashboard's own
  // filtering exactly (see frontend/components/reception/ReceptionDashboard.tsx).
  const lines: string[] = [`You are ${me.full_name}, reception staff. Today's schedule (${today.length}):`];
  if (today.length === 0) {
    lines.push("- No appointments today.");
  } else {
    today.forEach((a) => {
      const patient = store.profiles.find((p) => p.id === a.patient_id);
      const bill = store.billing.find((b) => b.appointment_id === a.id);
      lines.push(
        `- ${a.time_slot} ${patient?.full_name ?? "Unknown"} — ${a.body_part} — arrival: ${a.arrival_status.replace(/_/g, " ")} — referral: ${deriveReferralStatus(a)} — payment: ${bill?.payment_status ?? "n/a"}${bill?.payment_method ? ` (${bill.payment_method})` : ""}`
      );
    });
  }
  const waiting = today.filter((a) => a.arrival_status === "waiting").length;
  const needsAttention = today.filter((a) => ["missing", "pending_verification"].includes(deriveReferralStatus(a))).length;
  lines.push(`Currently waiting: ${waiting}. Appointments needing referral attention: ${needsAttention}.`);

  return { role: "reception", summary: lines.join("\n") };
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
