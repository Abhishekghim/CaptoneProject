import { addDays, format, subDays } from "date-fns";
import type {
  Announcement, Appointment, AuditLog, Billing, ContentPage, DoctorReferral, EquipmentLog,
  EquipmentServiceRecord, ImageAnnotation, InventoryItem, InventoryTransaction, MedicalRecord,
  Message, MessageThread, MriScan, Notification, NotificationPreferences, PrepInstruction,
  Profile, RadiologyReport, Supplier,
} from "./types";

const today = new Date();
const d = (offset: number) => format(addDays(today, offset), "yyyy-MM-dd");
const ts = (offsetDays: number, h = 9, m = 0) => {
  const t = addDays(today, offsetDays);
  t.setHours(h, m, 0, 0);
  return t.toISOString();
};

export const SEED_PROFILES: Profile[] = [
  { id: "u-patient",  email: "amelia.ng@example.com",   full_name: "Amelia Ng",       role: "patient",     phone: "+61 400 111 222", created_at: ts(-120) },
  { id: "u-patient2", email: "raj.patel@example.com",   full_name: "Raj Patel",       role: "patient",     phone: "+61 400 333 444", created_at: ts(-90) },
  { id: "u-patient3", email: "s.kowalski@example.com",  full_name: "Sofia Kowalski",  role: "patient",     phone: "+61 400 555 666", created_at: ts(-60) },
  { id: "u-tech",     email: "l.tran@capitalrad.com",   full_name: "Linh Tran",       role: "technician",  phone: "+61 411 222 333", created_at: ts(-400) },
  { id: "u-rad",      email: "dr.osei@capitalrad.com",  full_name: "Dr. Kwame Osei",  role: "radiologist", phone: "+61 422 333 444", created_at: ts(-700) },
  { id: "u-admin",    email: "m.rivers@capitalrad.com", full_name: "Morgan Rivers",   role: "admin",       phone: "+61 433 444 555", created_at: ts(-900) },
  { id: "u-doctor",   email: "dr.chen@referral-clinic.com", full_name: "Dr. Layla Chen", role: "referring_doctor", phone: "+61 444 555 666", created_at: ts(-500) },
];

export const SEED_RECORDS: MedicalRecord[] = [
  {
    id: "rec-1", patient_id: "u-patient", dob: "1988-04-12",
    history: "Chronic lower-back pain since 2023. Previous lumbar X-ray (2024) unremarkable.",
    contraindications: { metal_implants: false, pacemaker: false, claustrophobia: true, contrast_allergy: false, pregnancy: false, other: null },
    emergency_contact: { name: "David Ng", relationship: "Spouse", phone: "+61 400 999 888" },
  },
  {
    id: "rec-2", patient_id: "u-patient2", dob: "1975-11-02",
    history: "Right-knee meniscus injury, post-arthroscopy 2022.",
    contraindications: { metal_implants: true, pacemaker: false, claustrophobia: false, contrast_allergy: true, pregnancy: false, other: "Titanium knee screws (MRI-conditional)" },
    emergency_contact: { name: "Priya Patel", relationship: "Sister", phone: "+61 400 777 666" },
  },
  {
    id: "rec-3", patient_id: "u-patient3", dob: "1996-07-29",
    history: "Recurrent migraines with aura; neurologist referral for brain MRI.",
    contraindications: { metal_implants: false, pacemaker: false, claustrophobia: false, contrast_allergy: false, pregnancy: false, other: null },
    emergency_contact: { name: "Jan Kowalski", relationship: "Father", phone: "+61 400 123 321" },
  },
];

export const SEED_APPOINTMENTS: Appointment[] = [
  { id: "apt-1", patient_id: "u-patient",  date: d(0),  time_slot: "09:00", location: "Sydney CBD Clinic",   body_part: "Lumbar Spine", status: "scheduled",   referral_url: "referrals/amelia-ng-lumbar.pdf", referring_doctor_id: "u-doctor", referring_doctor_name: null, referring_doctor_practice: null, referral_reviewed: false, referral_reviewed_by: null, referral_reviewed_at: null, assigned_technician_id: "u-tech", assigned_radiologist_id: null, created_at: ts(-6) },
  { id: "apt-2", patient_id: "u-patient2", date: d(0),  time_slot: "10:30", location: "Sydney CBD Clinic",   body_part: "Right Knee",   status: "scheduled",   referral_url: "referrals/raj-patel-knee.pdf",   referring_doctor_id: null, referring_doctor_name: "Dr. Sarah Kim", referring_doctor_practice: "Northside Family Practice", referral_reviewed: false, referral_reviewed_by: null, referral_reviewed_at: null, assigned_technician_id: null, assigned_radiologist_id: null, created_at: ts(-4) },
  { id: "apt-3", patient_id: "u-patient3", date: d(-2), time_slot: "14:00", location: "Parramatta Imaging",  body_part: "Brain",        status: "completed",   referral_url: "referrals/s-kowalski-brain.pdf", referring_doctor_id: null, referring_doctor_name: null, referring_doctor_practice: null, referral_reviewed: true, referral_reviewed_by: "u-tech", referral_reviewed_at: ts(-2, 13, 50), assigned_technician_id: "u-tech", assigned_radiologist_id: "u-rad", created_at: ts(-10) },
  { id: "apt-4", patient_id: "u-patient",  date: d(-30),time_slot: "11:00", location: "Sydney CBD Clinic",   body_part: "Cervical Spine", status: "completed", referral_url: null, referring_doctor_id: "u-doctor", referring_doctor_name: null, referring_doctor_practice: null, referral_reviewed: false, referral_reviewed_by: null, referral_reviewed_at: null, assigned_technician_id: "u-tech", assigned_radiologist_id: "u-rad", created_at: ts(-35) },
  { id: "apt-5", patient_id: "u-patient2", date: d(5),  time_slot: "15:30", location: "Chatswood Centre",    body_part: "Shoulder",     status: "scheduled",   referral_url: null, referring_doctor_id: null, referring_doctor_name: null, referring_doctor_practice: null, referral_reviewed: false, referral_reviewed_by: null, referral_reviewed_at: null, assigned_technician_id: null, assigned_radiologist_id: null, created_at: ts(-1) },
];

// Path A: a doctor-initiated referral, created before the patient books (see
// lib/store.tsx createDoctorReferral). The first one matches an existing
// patient by email — Sofia Kowalski should see it waiting on her dashboard
// right away. The second doesn't match anyone yet, demonstrating the
// "awaiting sign-up" state a referring doctor sees on their own portal.
export const SEED_DOCTOR_REFERRALS: DoctorReferral[] = [
  {
    id: "dref-1", referring_doctor_id: "u-doctor",
    patient_full_name: "Sofia Kowalski", patient_email: "s.kowalski@example.com", patient_dob: "1996-07-29",
    body_part: "Pelvis", notes: "Follow-up imaging requested after specialist review.",
    patient_id: "u-patient3", used_in_appointment_id: null, created_at: ts(-1, 10, 0),
  },
  {
    id: "dref-2", referring_doctor_id: "u-doctor",
    patient_full_name: "James Whitfield", patient_email: "j.whitfield@example.com", patient_dob: "1982-03-14",
    body_part: "Lumbar Spine", notes: null,
    patient_id: null, used_in_appointment_id: null, created_at: ts(-3, 9, 30),
  },
];

export const SEED_SCANS: MriScan[] = [
  {
    id: "scan-1", appointment_id: "apt-3", body_part: "Brain",
    protocol: "T2 FLAIR + DWI, axial/sagittal", scan_duration: 32,
    technician_id: "u-tech", machine_name: "MRI Suite A — 3T",
    dicom_image_url: "dicom/scan-1-brain.dcm", performed_at: ts(-2, 14, 20),
  },
  {
    id: "scan-2", appointment_id: "apt-4", body_part: "Cervical Spine",
    protocol: "T1/T2 sagittal + axial gradient echo", scan_duration: 28,
    technician_id: "u-tech", machine_name: "MRI Suite B — 1.5T",
    dicom_image_url: "dicom/scan-2-cspine.dcm", performed_at: ts(-30, 11, 15),
  },
];

export const SEED_REPORTS: RadiologyReport[] = [
  {
    id: "rep-1", scan_id: "scan-2", radiologist_id: "u-rad",
    findings:
      "Vertebral alignment preserved. Normal marrow signal. Mild disc desiccation at C5-C6 with a small central protrusion, no cord compression. Neural foramina patent bilaterally. Cord signal normal.",
    impression:
      "1. Mild C5-C6 degenerative disc disease with small central protrusion.\n2. No cord compression or myelopathy.\n3. Recommend clinical correlation; no urgent follow-up required.",
    status: "finalized", e_signature: "Dr. Kwame Osei, FRANZCR", finalized_at: ts(-28, 16, 40),
  },
];

export const SEED_BILLING: Billing[] = [
  { id: "bill-1", appointment_id: "apt-4", amount: 420.0, payment_status: "paid",             payment_method: "card",      receipt_url: "receipts/bill-1.pdf", paid_at: ts(-29), insurance_claim_number: null, insurance_claim_status: "not_submitted", insurance_submitted_at: null, insurance_resolved_at: null, insurance_note: null },
  { id: "bill-2", appointment_id: "apt-3", amount: 560.0, payment_status: "insurance_review", payment_method: "insurance", receipt_url: null, paid_at: null, insurance_claim_number: "CLM-88213", insurance_claim_status: "submitted", insurance_submitted_at: ts(-1, 9, 0), insurance_resolved_at: null, insurance_note: null },
  { id: "bill-3", appointment_id: "apt-1", amount: 480.0, payment_status: "pending",          payment_method: null,        receipt_url: null, paid_at: null, insurance_claim_number: null, insurance_claim_status: "not_submitted", insurance_submitted_at: null, insurance_resolved_at: null, insurance_note: null },
];

export const SEED_EQUIPMENT: EquipmentLog[] = [
  { id: "eq-1", machine_name: "MRI Suite A — 3T",      model: "Siemens MAGNETOM Vida",       status: "operational",     last_calibration: format(subDays(today, 21), "yyyy-MM-dd"), maintenance_due: d(40), usage_hours: 4210 },
  { id: "eq-2", machine_name: "MRI Suite B — 1.5T",    model: "GE SIGNA Explorer",           status: "operational",     last_calibration: format(subDays(today, 60), "yyyy-MM-dd"), maintenance_due: d(12), usage_hours: 6120 },
  { id: "eq-3", machine_name: "MRI Suite C — 3T",      model: "Philips Ingenia Elition",     status: "calibration_due", last_calibration: format(subDays(today, 95), "yyyy-MM-dd"), maintenance_due: d(2),  usage_hours: 7480 },
  { id: "eq-4", machine_name: "Mobile Unit 1 — 1.5T",  model: "Siemens MAGNETOM Free.Max",   status: "maintenance",     last_calibration: format(subDays(today, 30), "yyyy-MM-dd"), maintenance_due: d(-1), usage_hours: 2890 },
];

export const SEED_EQUIPMENT_SERVICE_LOG: EquipmentServiceRecord[] = [
  { id: "svc-1", equipment_id: "eq-1", performed_by: "u-admin", action: "registered",  notes: "Initial registration on system rollout.", performed_at: ts(-400) },
  { id: "svc-2", equipment_id: "eq-2", performed_by: "u-admin", action: "calibration", notes: "Routine 60-day calibration, no issues.",   performed_at: ts(-60) },
  { id: "svc-3", equipment_id: "eq-4", performed_by: "u-admin", action: "maintenance", notes: "Gradient coil inspection after fault code.", performed_at: ts(-30) },
];

export const SEED_ANNOTATIONS: ImageAnnotation[] = [];

export const SEED_NOTIFICATION_PREFS: NotificationPreferences[] = SEED_PROFILES
  .filter((p) => p.role === "patient")
  .map((p) => ({
    user_id: p.id,
    appointment_reminders: true,
    report_ready_alerts: true,
    billing_alerts: true,
    email_enabled: true,
    sms_enabled: false,
  }));

// ----------------------------------------------------------------------------
// Messaging (FR41, FR43)
// ----------------------------------------------------------------------------
export const SEED_MESSAGE_THREADS: MessageThread[] = [
  { id: "thread-patient-u-patient", kind: "patient", patient_id: "u-patient", created_at: ts(-5) },
  { id: "thread-internal", kind: "internal", patient_id: null, created_at: ts(-900) },
];

export const SEED_MESSAGES: Message[] = [
  {
    id: "msg-1", thread_id: "thread-patient-u-patient", sender_id: "u-patient", sender_name: "Amelia Ng", sender_role: "patient",
    body: "Hi, can I bring a support person into the scan room with me?", created_at: ts(-5, 9, 0),
  },
  {
    id: "msg-2", thread_id: "thread-patient-u-patient", sender_id: "u-tech", sender_name: "Linh Tran", sender_role: "technician",
    body: "Of course — just let reception know when you check in and we'll arrange it.", created_at: ts(-5, 10, 15),
  },
  {
    id: "msg-3", thread_id: "thread-internal", sender_id: "u-admin", sender_name: "Morgan Rivers", sender_role: "admin",
    body: "Heads up team — MRI Suite C is calibration-due this week, please route bookings to Suite A/B where possible.", created_at: ts(-2, 8, 30),
  },
];

// ----------------------------------------------------------------------------
// Inventory management (FR57–FR61)
// ----------------------------------------------------------------------------
export const SEED_SUPPLIERS: Supplier[] = [
  { id: "sup-1", name: "MedSupply Australia", contact_name: "Jordan Blake", phone: "+61 2 9000 1111", email: "orders@medsupply.example" },
  { id: "sup-2", name: "Bayer Radiology", contact_name: "Priya Anand", phone: "+61 2 9000 2222", email: "sales@bayer-radiology.example" },
];

export const SEED_INVENTORY_ITEMS: InventoryItem[] = [
  { id: "inv-1", name: "Gadolinium contrast (10mL vial)", category: "contrast_agent", unit: "vials", quantity_on_hand: 18, reorder_threshold: 10, supplier_id: "sup-2" },
  { id: "inv-2", name: "IV cannulas (20G)", category: "consumable", unit: "boxes", quantity_on_hand: 6, reorder_threshold: 8, supplier_id: "sup-1" },
  { id: "inv-3", name: "Patient gowns", category: "consumable", unit: "packs", quantity_on_hand: 22, reorder_threshold: 10, supplier_id: "sup-1" },
  { id: "inv-4", name: "Ear protection (disposable)", category: "consumable", unit: "boxes", quantity_on_hand: 4, reorder_threshold: 5, supplier_id: "sup-1" },
];

export const SEED_INVENTORY_TRANSACTIONS: InventoryTransaction[] = [
  { id: "itx-1", item_id: "inv-1", type: "stock_in", quantity: 20, performed_by: "u-admin", note: "Monthly restock", performed_at: ts(-25) },
  { id: "itx-2", item_id: "inv-1", type: "used", quantity: 2, performed_by: "u-tech", note: "Contrast-enhanced studies", performed_at: ts(-3) },
  { id: "itx-3", item_id: "inv-2", type: "stock_in", quantity: 10, performed_by: "u-admin", note: "Restock", performed_at: ts(-40) },
  { id: "itx-4", item_id: "inv-2", type: "used", quantity: 4, performed_by: "u-tech", note: "Routine use", performed_at: ts(-10) },
  { id: "itx-5", item_id: "inv-4", type: "wasted", quantity: 1, performed_by: "u-tech", note: "Damaged packaging", performed_at: ts(-6) },
];

// ----------------------------------------------------------------------------
// Content management (FR75–FR78)
// ----------------------------------------------------------------------------
export const SEED_CONTENT_PAGES: ContentPage[] = [
  {
    id: "about", title: "About Capital Radiology",
    body: "Capital Radiology is a Sydney-based MRI diagnostic imaging provider, combining specialist radiologists with modern 1.5T and 3T scanners across three clinic locations.",
    updated_at: ts(-200), updated_by: "u-admin",
  },
  {
    id: "contact", title: "Contact us",
    body: "Sydney CBD Clinic — 1 Market St, Sydney NSW · (02) 8000 1000\nParramatta Imaging — 12 Church St, Parramatta NSW · (02) 8000 2000\nChatswood Centre — 4 Victor St, Chatswood NSW · (02) 8000 3000",
    updated_at: ts(-200), updated_by: "u-admin",
  },
  {
    id: "faq", title: "Frequently asked questions",
    body: "Do I need a referral? Most adult MRI scans require one from a specialist for a Medicare rebate; ask your GP.\nHow long does a scan take? Most scans take 20–40 minutes.\nCan I bring someone with me? Yes, arrange this at check-in.",
    updated_at: ts(-200), updated_by: "u-admin",
  },
];

export const SEED_ANNOUNCEMENTS: Announcement[] = [
  { id: "ann-1", title: "Public holiday hours", message: "All clinics close at 2pm on public holidays. Book early if you need an afternoon slot.", active: true, created_at: ts(-14) },
];

export const SEED_PREP_INSTRUCTIONS: PrepInstruction[] = [
  { body_part: "Brain", instructions: "No preparation needed. Remove all metal jewellery and piercings before your appointment.", updated_at: ts(-100) },
  { body_part: "Abdomen", instructions: "Fast for 4 hours before your scan (water is fine). Arrive 15 minutes early to change into a gown.", updated_at: ts(-100) },
  { body_part: "Pelvis", instructions: "Arrive with a comfortably full bladder — drink 2 glasses of water 1 hour before your appointment.", updated_at: ts(-100) },
];

export const SEED_AUDIT: AuditLog[] = [
  { id: 1, user_id: "u-admin",   user_name: "Morgan Rivers",  action: "LOGIN",            entity: "auth",              details: "Successful admin login (MFA verified)", timestamp: ts(0, 7, 58) },
  { id: 2, user_id: "u-tech",    user_name: "Linh Tran",      action: "SCAN_LOGGED",      entity: "mri_scans",         details: "Brain scan logged for appointment apt-3", timestamp: ts(-2, 14, 55) },
  { id: 3, user_id: "u-rad",     user_name: "Dr. Kwame Osei", action: "REPORT_FINALIZED", entity: "radiology_reports", details: "Report rep-1 electronically signed", timestamp: ts(-28, 16, 40) },
  { id: 4, user_id: "u-patient", user_name: "Amelia Ng",      action: "APPOINTMENT_BOOKED", entity: "appointments",    details: "Lumbar Spine — Sydney CBD Clinic", timestamp: ts(-6, 19, 12) },
  { id: 5, user_id: null,        user_name: "Unknown",        action: "ACCESS_DENIED",    entity: "radiology_reports", details: "Blocked read of finalized report by unauthenticated session (RLS)", timestamp: ts(-1, 2, 13) },
];

export const SEED_NOTIFICATIONS: Notification[] = [
  { id: "note-1", user_id: "u-patient", type: "report_ready", title: "Your MRI report is ready", message: "Your Cervical Spine MRI report has been finalized by Dr. Kwame Osei.", read: false, created_at: ts(-28, 16, 41) },
  { id: "note-2", user_id: "u-patient", type: "appointment_booked", title: "Appointment booked", message: "Lumbar Spine MRI — Sydney CBD Clinic.", read: true, created_at: ts(-6, 19, 12) },
  { id: "note-3", user_id: "u-patient2", type: "appointment_booked", title: "Appointment booked", message: "Right Knee MRI — Sydney CBD Clinic.", read: true, created_at: ts(-4, 10, 5) },
];

export const TIME_SLOTS = ["08:00", "09:00", "10:30", "11:30", "13:00", "14:00", "15:30", "16:30"];
export const LOCATIONS = ["Sydney CBD Clinic", "Parramatta Imaging", "Chatswood Centre"];
export const BODY_PARTS = ["Brain", "Cervical Spine", "Lumbar Spine", "Shoulder", "Right Knee", "Left Knee", "Abdomen", "Pelvis"];
export const PROTOCOLS = [
  "T1/T2 sagittal + axial gradient echo",
  "T2 FLAIR + DWI, axial/sagittal",
  "PD fat-sat + T2 coronal (joint)",
  "T1 post-contrast volumetric",
];
export const SCAN_PRICES: Record<string, number> = {
  Brain: 560, "Cervical Spine": 420, "Lumbar Spine": 480, Shoulder: 440,
  "Right Knee": 440, "Left Knee": 440, Abdomen: 620, Pelvis: 620,
};
