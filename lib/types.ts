export type Role = "patient" | "technician" | "radiologist" | "admin" | "referring_doctor";

export type AppointmentStatus = "scheduled" | "in_progress" | "completed" | "cancelled";
export type ReportStatus = "draft" | "finalized";
export type PaymentStatus = "pending" | "paid" | "insurance_review" | "refunded" | "failed";
export type EquipmentStatus = "operational" | "maintenance" | "offline" | "calibration_due";

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  phone?: string;
  username?: string | null;
  created_at: string;
}

export interface Contraindications {
  metal_implants: boolean;
  pacemaker: boolean;
  claustrophobia: boolean;
  contrast_allergy: boolean;
  pregnancy: boolean;
  other: string | null;
}

export interface MedicalRecord {
  id: string;
  patient_id: string;
  dob: string;
  history: string;
  contraindications: Contraindications;
  emergency_contact: { name: string; relationship: string; phone: string };
}

export interface Appointment {
  id: string;
  patient_id: string;
  date: string; // yyyy-MM-dd
  time_slot: string;
  location: string;
  body_part: string;
  status: AppointmentStatus;
  referral_url: string | null;
  referring_doctor_id: string | null;
  // Set instead of referring_doctor_id when the patient's doctor doesn't
  // have an account yet — the patient just names them, and the uploaded
  // referral document is the actual proof (see database/005_referral_review_and_free_text_doctor.sql).
  referring_doctor_name: string | null;
  referring_doctor_practice: string | null;
  // A technician's confirmation that the referral matches the requested
  // scan, done as part of their normal pre-scan check — not gating booking
  // or scanning, just a visible acknowledgment step.
  referral_reviewed: boolean;
  referral_reviewed_by: string | null;
  referral_reviewed_at: string | null;
  // Admin push-assignment (FR21) — informational, not a hard gate: an
  // unassigned appointment can still be picked up by any technician/
  // radiologist the way it always could, this just lets admin plan ahead.
  assigned_technician_id: string | null;
  assigned_radiologist_id: string | null;
  notes?: string;
  created_at: string;
}

// A radiologist's point annotation on a DICOM viewer slice (FR27 — "view
// and annotate images"). Coordinates are in the viewer's fixed 512x512
// image space, independent of the viewer's current pan/zoom, so a pin
// stays anchored to the same anatomy regardless of how it's being viewed.
export interface ImageAnnotation {
  id: string;
  scan_id: string;
  author_id: string;
  x: number;
  y: number;
  note: string;
  created_at: string;
}

export type InsuranceClaimStatus = "not_submitted" | "submitted" | "approved" | "rejected";

export interface NotificationPreferences {
  user_id: string;
  appointment_reminders: boolean;
  report_ready_alerts: boolean;
  billing_alerts: boolean;
  email_enabled: boolean;
  sms_enabled: boolean;
}

export interface EquipmentServiceRecord {
  id: string;
  equipment_id: string;
  performed_by: string;
  action: "calibration" | "maintenance" | "registered";
  notes: string | null;
  performed_at: string;
}

export interface MriScan {
  id: string;
  appointment_id: string;
  body_part: string;
  protocol: string;
  scan_duration: number | null;
  technician_id: string | null;
  machine_name: string | null;
  dicom_image_url: string | null;
  performed_at: string | null;
}

export interface RadiologyReport {
  id: string;
  scan_id: string;
  radiologist_id: string;
  findings: string;
  impression: string;
  status: ReportStatus;
  e_signature: string | null;
  finalized_at: string | null;
}

export interface Billing {
  id: string;
  appointment_id: string;
  amount: number;
  payment_status: PaymentStatus;
  payment_method: string | null;
  receipt_url: string | null;
  paid_at: string | null;
  // Insurance claims workflow (FR38) — only meaningful when payment_method
  // is "insurance"; a real claim record rather than just a status label.
  insurance_claim_number: string | null;
  insurance_claim_status: InsuranceClaimStatus;
  insurance_submitted_at: string | null;
  insurance_resolved_at: string | null;
  insurance_note: string | null;
}

export interface EquipmentLog {
  id: string;
  machine_name: string;
  model: string;
  status: EquipmentStatus;
  last_calibration: string;
  maintenance_due: string;
  usage_hours: number;
}

export interface AuditLog {
  id: number;
  user_id: string | null;
  user_name: string;
  action: string;
  entity: string;
  details: string;
  timestamp: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  created_at: string;
}

// Referring-doctor request-then-approve queue (database/004_referring_doctor_requests.sql).
// Unlike everything else in this file, this is read straight from Supabase
// (see components/admin/DoctorRequestsPanel.tsx) rather than the mock store —
// see the comment there for why.
export type DoctorRequestStatus = "pending" | "approved" | "rejected";

export interface ReferringDoctorRequest {
  id: string;
  full_name: string;
  email: string;
  practice_name: string;
  ahpra_number: string;
  phone: string | null;
  message: string | null;
  status: DoctorRequestStatus;
  rejection_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_profile_id: string | null;
  created_at: string;
}

// A referral a doctor creates proactively for a patient, before that patient
// has necessarily booked (or even signed up) — "Path A" alongside the
// patient-initiated flow in bookAppointment. Matching to a real patient
// account happens by email (the same unique identifier auth already keys
// on) — never by name+age, which isn't a stable or unique identifier.
// full_name/dob are kept only as human-readable confirmation for the doctor
// and technician, not as the actual matching key.
export interface DoctorReferral {
  id: string;
  referring_doctor_id: string;
  patient_full_name: string;
  patient_email: string;
  patient_dob: string | null;
  body_part: string;
  notes: string | null;
  // Filled in the moment a profile with a matching email exists — either
  // immediately (patient already had an account) or, in the real backend,
  // via a trigger the moment that patient signs up later.
  patient_id: string | null;
  // Filled in once the patient actually books using this referral, so it
  // stops being offered as "waiting to be used" afterward.
  used_in_appointment_id: string | null;
  created_at: string;
}

// ----------------------------------------------------------------------------
// Messaging (FR41 — patient↔staff, FR43 — internal staff↔staff)
// ----------------------------------------------------------------------------
// Two thread "kinds" cover both requirements with one model: a "patient"
// thread is the patient plus whichever staff member replies (any tech/
// radiologist/admin can answer — real clinics route this to whoever's
// available, not one fixed assignee), and there is exactly one "internal"
// thread shared by all staff, since FR43 just asks for staff-to-staff
// communication, not a per-topic channel system.
export type MessageThreadKind = "patient" | "internal";

export interface MessageThread {
  id: string;
  kind: MessageThreadKind;
  // Set only for kind "patient" — who the thread is with.
  patient_id: string | null;
  created_at: string;
}

export interface Message {
  id: string;
  thread_id: string;
  sender_id: string;
  sender_name: string;
  sender_role: Role;
  body: string;
  created_at: string;
}

// ----------------------------------------------------------------------------
// Inventory management (Module 13, FR57–FR61)
// ----------------------------------------------------------------------------
export type InventoryCategory = "contrast_agent" | "consumable";

export interface InventoryItem {
  id: string;
  name: string;
  category: InventoryCategory;
  unit: string; // e.g. "vials", "boxes"
  quantity_on_hand: number;
  reorder_threshold: number;
  supplier_id: string | null;
}

export type InventoryTransactionType = "stock_in" | "used" | "wasted";

export interface InventoryTransaction {
  id: string;
  item_id: string;
  type: InventoryTransactionType;
  quantity: number;
  performed_by: string;
  note: string | null;
  performed_at: string;
}

export interface Supplier {
  id: string;
  name: string;
  contact_name: string;
  phone: string;
  email: string;
}

// ----------------------------------------------------------------------------
// Content management (Module 17, FR75–FR78)
// ----------------------------------------------------------------------------
export type ContentPageId = "about" | "contact" | "faq";

export interface ContentPage {
  id: ContentPageId;
  title: string;
  body: string;
  updated_at: string;
  updated_by: string;
}

export interface Announcement {
  id: string;
  title: string;
  message: string;
  active: boolean;
  created_at: string;
}

export interface PrepInstruction {
  body_part: string;
  instructions: string;
  updated_at: string;
}
