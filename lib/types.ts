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
  notes?: string;
  created_at: string;
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
