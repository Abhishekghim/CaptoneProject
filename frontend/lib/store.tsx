"use client";

import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import {
  SEED_ANNOTATIONS, SEED_ANNOUNCEMENTS, SEED_APPOINTMENTS, SEED_AUDIT, SEED_BILLING,
  SEED_COMMUNICATION_LOG, SEED_CONTENT_PAGES, SEED_DOCTOR_REFERRALS, SEED_EQUIPMENT,
  SEED_EQUIPMENT_SERVICE_LOG, SEED_INVENTORY_ITEMS, SEED_INVENTORY_TRANSACTIONS, SEED_MESSAGES,
  SEED_MESSAGE_THREADS, SEED_NOTIFICATIONS, SEED_NOTIFICATION_PREFS, SEED_PREP_INSTRUCTIONS,
  SEED_PROFILES, SEED_RECORDS, SEED_REPORTS, SEED_SCANS, SEED_SUPPLIERS, SCAN_PRICES,
} from "./seed";
import type {
  Announcement, Appointment, ArrivalStatus, AuditLog, Billing, CommunicationChannel,
  CommunicationLog, CommunicationPurpose, ContentPage, ContentPageId, Contraindications,
  DoctorReferral, EquipmentLog, EquipmentServiceRecord, ImageAnnotation, InventoryCategory,
  InventoryItem, InventoryTransaction, InventoryTransactionType, MedicalRecord, Message,
  MessageThread, MriScan, Notification, NotificationPreferences, PrepInstruction, Profile,
  RadiologyReport, ReferralStatus, Role, Supplier,
} from "@/shared/types";

let uid = 100;
const newId = (prefix: string) => `${prefix}-${++uid}-${Date.now().toString(36)}`;

// Reception's referral vocabulary is a display-level derivation over
// existing fields, falling back only when referral_status_override is set
// explicitly — this is what lets the technician's existing "acknowledge
// referral" flow (referral_reviewed) keep working unmodified. Exported so
// components can render the same status without duplicating this logic.
export function deriveReferralStatus(
  apt: Pick<Appointment, "referral_status_override" | "referral_url" | "referring_doctor_name" | "referring_doctor_id" | "referral_reviewed">
): ReferralStatus {
  if (apt.referral_status_override) return apt.referral_status_override;
  if (apt.referral_reviewed) return "verified";
  if (apt.referral_url || apt.referring_doctor_name || apt.referring_doctor_id) return "received";
  return "missing";
}

// Reception's front-desk arrival state machine (section 7 of the spec:
// "make sure invalid transitions are prevented"). Deliberately permissive
// about re-entering the same state (idempotent) and about a late arrival
// un-no-showing themselves, since real front desks do both constantly.
const ARRIVAL_TRANSITIONS: Record<ArrivalStatus, ArrivalStatus[]> = {
  not_arrived: ["arrived", "checked_in", "waiting", "no_show"],
  arrived: ["checked_in", "waiting", "no_show"],
  checked_in: ["waiting", "no_show"],
  waiting: ["no_show"],
  no_show: ["arrived", "checked_in", "waiting"],
};

export function canTransitionArrival(from: ArrivalStatus, to: ArrivalStatus): boolean {
  if (from === to) return true;
  return ARRIVAL_TRANSITIONS[from]?.includes(to) ?? false;
}

interface Store {
  // real, authenticated identity — sourced from Supabase auth + profiles.role,
  // fetched server-side (see app/(app)/layout.tsx). Never changes for the
  // lifetime of the session; nothing in this app lets a user pick their own role.
  currentUser: Profile;

  // Admin-only, UI-level preview of another role's dashboard. Does NOT change
  // currentUser, and every store action below still writes/audits as
  // currentUser — this only controls which dashboard renders (see Shell.tsx).
  previewRole: Role | null;
  setPreviewRole: (role: Role | null) => void;
  effectiveRole: Role;

  // data
  profiles: Profile[];
  records: MedicalRecord[];
  appointments: Appointment[];
  scans: MriScan[];
  reports: RadiologyReport[];
  billing: Billing[];
  equipment: EquipmentLog[];
  equipmentServiceLog: EquipmentServiceRecord[];
  audit: AuditLog[];
  notifications: Notification[];
  notificationPreferences: NotificationPreferences[];
  doctorReferrals: DoctorReferral[];
  annotations: ImageAnnotation[];
  messageThreads: MessageThread[];
  messages: Message[];
  inventoryItems: InventoryItem[];
  inventoryTransactions: InventoryTransaction[];
  suppliers: Supplier[];
  contentPages: ContentPage[];
  announcements: Announcement[];
  prepInstructions: PrepInstruction[];
  scanPrices: Record<string, number>;
  communicationLog: CommunicationLog[];

  // patient actions
  bookAppointment: (input: {
    date: string; time_slot: string; location: string; body_part: string;
    referralFileName: string | null; referringDoctorId: string | null;
    referringDoctorName: string | null; referringDoctorPractice: string | null;
    usingReferralId?: string | null;
    // Reception booking on a patient's behalf (section 13) — defaults to
    // currentUser.id, which is what every existing patient-side caller
    // already relies on implicitly.
    patientId?: string;
    // Set directly on the bill created alongside this appointment — avoids
    // a separate follow-up call racing the same setState batch to find the
    // bill that was just created.
    paymentType?: string;
  }) => { ok: boolean; error?: string };
  cancelAppointment: (id: string, reason?: string) => void;
  // Reschedules any appointment to a new date/time/location, re-checking for
  // slot clashes exactly like bookAppointment. Used by patients (FR47, their
  // own upcoming appointments only — enforced in the UI) and by staff on the
  // admin appointments panel (FR9, any patient's appointment).
  rescheduleAppointment: (
    id: string,
    input: { date: string; time_slot: string; location: string }
  ) => { ok: boolean; error?: string };
  updateRecord: (patch: { history: string; contraindications: Contraindications; emergency_contact: MedicalRecord["emergency_contact"] }) => void;
  updateNotificationPreferences: (patch: Partial<Omit<NotificationPreferences, "user_id">>) => void;

  // technician actions
  startScan: (appointmentId: string) => void;
  logScan: (input: { appointment_id: string; body_part: string; protocol: string; scan_duration: number; machine_name: string; dicomFileName: string }) => void;
  // Technician's confirmation that a referral (uploaded document, or a
  // patient-named doctor without an account yet) matches the requested
  // scan — part of their normal pre-scan check, not a booking/scan gate.
  acknowledgeReferral: (appointmentId: string) => void;

  // radiologist actions
  saveReportDraft: (scanId: string, findings: string, impression: string) => string;
  finalizeReport: (reportId: string, signature: string) => void;
  // Point annotation on a DICOM slice (FR27 — "view and annotate images").
  // Coordinates are in the viewer's fixed image space, not screen pixels.
  addAnnotation: (scanId: string, x: number, y: number, note: string) => void;
  removeAnnotation: (id: string) => void;

  // referring doctor actions
  uploadReferral: (appointmentId: string, fileName: string) => void;
  // Doctor-initiated referral, created ahead of the patient booking (or even
  // signing up) — auto-links to a patient account by email if one already
  // exists. See shared/types.ts DoctorReferral for why email, not name+age.
  createDoctorReferral: (input: {
    patientFullName: string; patientEmail: string; patientDob: string | null;
    bodyPart: string; notes: string | null;
  }) => { ok: boolean; error?: string; matchedExistingPatient: boolean };

  // admin actions
  markBillPaid: (billId: string, method: string) => void;
  // Insurance claims workflow (FR38) — a real submit/resolve lifecycle
  // rather than just a payment_status label.
  submitInsuranceClaim: (billId: string, claimNumber: string) => void;
  resolveInsuranceClaim: (billId: string, approved: boolean, note: string) => void;
  // Admin push-assignment of technician/radiologist to a procedure (FR21).
  // Informational, not a hard gate — an unassigned appointment can still be
  // picked up self-serve exactly as before.
  assignStaffToAppointment: (
    appointmentId: string,
    input: { technicianId: string | null; radiologistId: string | null }
  ) => void;
  scheduleEquipmentService: (equipmentId: string) => void;
  registerEquipment: (input: { machine_name: string; model: string }) => void;

  // reception actions — front-desk workflow (Reception Portal). Deliberately
  // separate from the clinical `status`/scan/report actions above: reception
  // never touches those, only arrival tracking, referral/payment
  // administrative status, and patient registration.
  registerPatient: (input: {
    fullName: string; dob: string; sex: string | null; preferredName: string | null;
    phone: string; email: string; address: string | null; suburb: string | null;
    state: string | null; postcode: string | null;
    medicareNumber: string | null; medicareExpiry: string | null;
    // When a duplicate check already surfaced matches and reception
    // confirmed this is genuinely a different person, forceCreate skips the
    // check and creates the record anyway — never a silent/automatic merge.
    forceCreate?: boolean;
  }) => { ok: boolean; patientId?: string; possibleDuplicates: { id: string; full_name: string; dob: string; phone?: string }[] };
  checkInAppointment: (appointmentId: string) => { ok: boolean; error?: string };
  markArrived: (appointmentId: string) => { ok: boolean; error?: string };
  markNoShow: (appointmentId: string) => { ok: boolean; error?: string };
  confirmAppointment: (appointmentId: string) => void;
  setReferralStatus: (appointmentId: string, status: ReferralStatus) => void;
  setPaymentType: (billId: string, paymentType: string) => void;
  // Never claims a message was actually delivered — no SMS/email provider is
  // wired into this project. Always logs status "not_sent"; the UI is
  // responsible for labeling this as demo mode, not this function.
  logCommunication: (appointmentId: string, channel: CommunicationChannel, purpose: CommunicationPurpose) => void;

  // messaging (FR41 patient<->staff, FR43 internal staff<->staff)
  sendPatientMessage: (patientId: string, body: string) => void;
  sendInternalMessage: (body: string) => void;

  // inventory management (FR57-61)
  addInventoryItem: (input: { name: string; category: InventoryCategory; unit: string; quantity_on_hand: number; reorder_threshold: number; supplier_id: string | null }) => void;
  recordInventoryTransaction: (itemId: string, type: InventoryTransactionType, quantity: number, note: string | null) => void;
  addSupplier: (input: { name: string; contact_name: string; phone: string; email: string }) => void;

  // content management (FR75-78)
  updateContentPage: (id: ContentPageId, patch: { title: string; body: string }) => void;
  addAnnouncement: (title: string, message: string) => void;
  toggleAnnouncement: (id: string) => void;
  updatePrepInstruction: (bodyPart: string, instructions: string) => void;
  updateScanPrice: (bodyPart: string, price: number) => void;

  // notifications (all roles)
  markNotificationRead: (id: string) => void;

  // assistant (all authenticated roles) — records that a query happened, not
  // its content, so the exchange shows up in the Admin audit log panel.
  logAssistantAction: (summary: string) => void;
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ profile, children }: { profile: Profile; children: React.ReactNode }) {
  const currentUser = profile;
  const [previewRole, setPreviewRoleState] = useState<Role | null>(null);
  const effectiveRole = previewRole ?? currentUser.role;

  const setPreviewRole = useCallback(
    (role: Role | null) => {
      // Defense in depth: the panel that calls this is already hidden for
      // non-admin-tier roles (see Shell.tsx), but never let preview change identity.
      if (currentUser.role !== "admin" && currentUser.role !== "super_admin") return;
      setPreviewRoleState(role);
    },
    [currentUser.role]
  );

  // Reception's patient registration is the one thing that ever adds to this
  // — every other role account is fixed seed data (see registerPatient).
  const [profiles, setProfiles] = useState<Profile[]>(SEED_PROFILES);
  const [records, setRecords] = useState<MedicalRecord[]>(SEED_RECORDS);
  const [appointments, setAppointments] = useState<Appointment[]>(SEED_APPOINTMENTS);
  const [scans, setScans] = useState<MriScan[]>(SEED_SCANS);
  const [reports, setReports] = useState<RadiologyReport[]>(SEED_REPORTS);
  const [billing, setBilling] = useState<Billing[]>(SEED_BILLING);
  const [equipment, setEquipment] = useState<EquipmentLog[]>(SEED_EQUIPMENT);
  const [equipmentServiceLog, setEquipmentServiceLog] = useState<EquipmentServiceRecord[]>(SEED_EQUIPMENT_SERVICE_LOG);
  const [audit, setAudit] = useState<AuditLog[]>(SEED_AUDIT);
  const [notifications, setNotifications] = useState<Notification[]>(SEED_NOTIFICATIONS);
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences[]>(SEED_NOTIFICATION_PREFS);
  const [doctorReferrals, setDoctorReferrals] = useState<DoctorReferral[]>(SEED_DOCTOR_REFERRALS);
  const [annotations, setAnnotations] = useState<ImageAnnotation[]>(SEED_ANNOTATIONS);
  const [messageThreads, setMessageThreads] = useState<MessageThread[]>(SEED_MESSAGE_THREADS);
  const [messages, setMessages] = useState<Message[]>(SEED_MESSAGES);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>(SEED_INVENTORY_ITEMS);
  const [inventoryTransactions, setInventoryTransactions] = useState<InventoryTransaction[]>(SEED_INVENTORY_TRANSACTIONS);
  const [suppliers, setSuppliers] = useState<Supplier[]>(SEED_SUPPLIERS);
  const [contentPages, setContentPages] = useState<ContentPage[]>(SEED_CONTENT_PAGES);
  const [announcements, setAnnouncements] = useState<Announcement[]>(SEED_ANNOUNCEMENTS);
  const [prepInstructions, setPrepInstructions] = useState<PrepInstruction[]>(SEED_PREP_INSTRUCTIONS);
  const [scanPrices, setScanPrices] = useState<Record<string, number>>(SCAN_PRICES);
  const [communicationLog, setCommunicationLog] = useState<CommunicationLog[]>(SEED_COMMUNICATION_LOG);

  const writeAudit = useCallback(
    (user: Profile, action: string, entity: string, details: string) => {
      setAudit((prev) => [
        {
          id: prev.length ? Math.max(...prev.map((a) => a.id)) + 1 : 1,
          user_id: user.id,
          user_name: user.full_name,
          action,
          entity,
          details,
          timestamp: new Date().toISOString(),
        },
        ...prev,
      ]);
    },
    []
  );

  const pushNotification = useCallback(
    (userId: string, type: string, title: string, message: string) => {
      setNotifications((prev) => [
        { id: newId("note"), user_id: userId, type, title, message, read: false, created_at: new Date().toISOString() },
        ...prev,
      ]);
    },
    []
  );

  const markNotificationRead = useCallback((id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }, []);

  const bookAppointment: Store["bookAppointment"] = useCallback(
    ({ date, time_slot, location, body_part, referralFileName: referralPath, referringDoctorId, referringDoctorName, referringDoctorPractice, usingReferralId, patientId, paymentType }) => {
      const clash = appointments.some(
        (a) => a.date === date && a.time_slot === time_slot && a.location === location && a.status !== "cancelled"
      );
      if (clash) return { ok: false, error: "That slot is already booked at this location. Choose another time." };

      const referral = usingReferralId ? doctorReferrals.find((r) => r.id === usingReferralId) : undefined;
      // A doctor-initiated referral always wins over anything the patient
      // separately typed/picked — it's already a verified account, not a
      // free-text claim.
      const finalReferringDoctorId = referral ? referral.referring_doctor_id : referringDoctorId;
      // Reception booking on a patient's behalf (section 13) passes an
      // explicit patientId; every patient-side caller omits it and books
      // for themselves, exactly as before.
      const targetPatientId = patientId ?? currentUser.id;
      const staffBooked = targetPatientId !== currentUser.id;

      const apt: Appointment = {
        id: newId("apt"),
        patient_id: targetPatientId,
        date, time_slot, location, body_part,
        status: "scheduled",
        referral_url: referralPath,
        referring_doctor_id: finalReferringDoctorId,
        referring_doctor_name: finalReferringDoctorId ? null : referringDoctorName,
        referring_doctor_practice: finalReferringDoctorId ? null : referringDoctorPractice,
        // A doctor-initiated referral was already reviewed by definition — it
        // came from a verified doctor account, not an uploaded document a
        // technician needs to independently check.
        referral_reviewed: Boolean(referral),
        referral_reviewed_by: null,
        referral_reviewed_at: referral ? new Date().toISOString() : null,
        assigned_technician_id: null,
        assigned_radiologist_id: null,
        created_at: new Date().toISOString(),
        // Staff booking a patient in over the phone/in person is already a
        // confirmed booking; a patient's own online self-service booking
        // still goes through reception's separate confirmation step.
        confirmed: staffBooked,
        arrival_status: "not_arrived",
        arrived_at: null,
        checked_in_at: null,
        cancellation_reason: null,
        referral_status_override: null,
      };
      setAppointments((prev) => [apt, ...prev]);
      setBilling((prev) => [
        {
          id: newId("bill"),
          appointment_id: apt.id,
          amount: scanPrices[body_part] ?? 480,
          payment_status: "pending",
          payment_method: paymentType ?? null,
          receipt_url: null,
          paid_at: null,
          insurance_claim_number: null,
          insurance_claim_status: "not_submitted",
          insurance_submitted_at: null,
          insurance_resolved_at: null,
          insurance_note: null,
        },
        ...prev,
      ]);
      if (referral) {
        setDoctorReferrals((prev) =>
          prev.map((r) => (r.id === referral.id ? { ...r, used_in_appointment_id: apt.id } : r))
        );
      }
      writeAudit(
        currentUser,
        "APPOINTMENT_BOOKED",
        "appointments",
        `${body_part} — ${location} on ${date} ${time_slot}${staffBooked ? " (booked by reception)" : ""}`
      );
      pushNotification(targetPatientId, "appointment_booked", "Appointment booked", `${body_part} MRI — ${location} on ${date} at ${time_slot}.`);
      return { ok: true };
    },
    [appointments, currentUser, doctorReferrals, scanPrices, writeAudit, pushNotification]
  );

  const cancelAppointment = useCallback(
    (id: string, reason?: string) => {
      const apt = appointments.find((a) => a.id === id);
      setAppointments((prev) => prev.map((a) => (a.id === id ? { ...a, status: "cancelled", cancellation_reason: reason ?? a.cancellation_reason } : a)));
      const staffInitiated = apt && apt.patient_id !== currentUser.id;
      writeAudit(
        currentUser,
        "APPOINTMENT_CANCELLED",
        "appointments",
        `Appointment ${id} cancelled${staffInitiated ? " by staff on behalf of patient" : ""}${reason ? ` — reason: ${reason}` : ""}`
      );
      // Always notify the patient the appointment belongs to — not
      // whoever clicked cancel, which matters once staff can cancel on a
      // patient's behalf (FR9).
      if (apt) {
        pushNotification(apt.patient_id, "appointment_cancelled", "Appointment cancelled", `Your ${apt.body_part} MRI on ${apt.date} at ${apt.time_slot} has been cancelled.`);
      }
    },
    [appointments, currentUser, writeAudit, pushNotification]
  );

  const rescheduleAppointment: Store["rescheduleAppointment"] = useCallback(
    (id, { date, time_slot, location }) => {
      const apt = appointments.find((a) => a.id === id);
      if (!apt) return { ok: false, error: "Appointment not found." };
      const clash = appointments.some(
        (a) => a.id !== id && a.date === date && a.time_slot === time_slot && a.location === location && a.status !== "cancelled"
      );
      if (clash) return { ok: false, error: "That slot is already booked at this location. Choose another time." };

      setAppointments((prev) => prev.map((a) => (a.id === id ? { ...a, date, time_slot, location } : a)));
      const staffInitiated = apt.patient_id !== currentUser.id;
      writeAudit(
        currentUser,
        "APPOINTMENT_RESCHEDULED",
        "appointments",
        `Appointment ${id} moved to ${date} ${time_slot} (${location})${staffInitiated ? " by staff" : ""}`
      );
      pushNotification(
        apt.patient_id,
        "appointment_rescheduled",
        "Appointment rescheduled",
        `Your ${apt.body_part} MRI is now ${date} at ${time_slot}, ${location}.`
      );
      return { ok: true };
    },
    [appointments, currentUser, writeAudit, pushNotification]
  );

  const updateRecord: Store["updateRecord"] = useCallback(
    (patch) => {
      setRecords((prev) => {
        const existing = prev.find((r) => r.patient_id === currentUser.id);
        if (existing) {
          return prev.map((r) => (r.patient_id === currentUser.id ? { ...r, ...patch } : r));
        }
        // A patient self-signing-up and saving their health profile before
        // reception ever registers them still needs a patient_code — same
        // generator registerPatient uses, so codes never collide either way.
        return [
          ...prev,
          {
            id: newId("rec"), patient_id: currentUser.id, dob: "1990-01-01",
            patient_code: `CR-${10000 + prev.length + 1}`, sex: null, preferred_name: null,
            address: null, suburb: null, state: null, postcode: null,
            medicare_number: null, medicare_expiry: null,
            ...patch,
          },
        ];
      });
      writeAudit(currentUser, "RECORD_UPDATED", "patient_medical_records", "Health profile & contraindications saved");
    },
    [currentUser, writeAudit]
  );

  const updateNotificationPreferences: Store["updateNotificationPreferences"] = useCallback(
    (patch) => {
      setNotificationPreferences((prev) => {
        const existing = prev.find((p) => p.user_id === currentUser.id);
        if (existing) {
          return prev.map((p) => (p.user_id === currentUser.id ? { ...p, ...patch } : p));
        }
        return [
          ...prev,
          {
            user_id: currentUser.id,
            appointment_reminders: true,
            report_ready_alerts: true,
            billing_alerts: true,
            email_enabled: true,
            sms_enabled: false,
            ...patch,
          },
        ];
      });
      writeAudit(currentUser, "NOTIFICATION_PREFS_UPDATED", "notification_preferences", "Notification preferences saved");
    },
    [currentUser, writeAudit]
  );

  const startScan = useCallback(
    (appointmentId: string) => {
      setAppointments((prev) => prev.map((a) => (a.id === appointmentId ? { ...a, status: "in_progress" } : a)));
      writeAudit(currentUser, "SCAN_STARTED", "appointments", `Appointment ${appointmentId} moved to In Progress`);
    },
    [currentUser, writeAudit]
  );

  const acknowledgeReferral = useCallback(
    (appointmentId: string) => {
      setAppointments((prev) =>
        prev.map((a) =>
          a.id === appointmentId
            ? { ...a, referral_reviewed: true, referral_reviewed_by: currentUser.id, referral_reviewed_at: new Date().toISOString() }
            : a
        )
      );
      writeAudit(currentUser, "REFERRAL_REVIEWED", "appointments", `Referral reviewed for appointment ${appointmentId}`);
    },
    [currentUser, writeAudit]
  );

  const logScan: Store["logScan"] = useCallback(
    (input) => {
      const scan: MriScan = {
        id: newId("scan"),
        appointment_id: input.appointment_id,
        body_part: input.body_part,
        protocol: input.protocol,
        scan_duration: input.scan_duration,
        technician_id: currentUser.id,
        machine_name: input.machine_name,
        dicom_image_url: input.dicomFileName,
        performed_at: new Date().toISOString(),
      };
      setScans((prev) => [scan, ...prev]);
      setAppointments((prev) =>
        prev.map((a) => (a.id === input.appointment_id ? { ...a, status: "completed" } : a))
      );
      setEquipment((prev) =>
        prev.map((e) =>
          e.machine_name === input.machine_name
            ? { ...e, usage_hours: e.usage_hours + Math.ceil(input.scan_duration / 60) }
            : e
        )
      );
      writeAudit(currentUser, "SCAN_LOGGED", "mri_scans", `${input.body_part} on ${input.machine_name} (${input.scan_duration} min)`);
    },
    [currentUser, writeAudit]
  );

  const saveReportDraft = useCallback(
    (scanId: string, findings: string, impression: string) => {
      let reportId = "";
      setReports((prev) => {
        const existing = prev.find((r) => r.scan_id === scanId);
        if (existing) {
          reportId = existing.id;
          return prev.map((r) => (r.scan_id === scanId ? { ...r, findings, impression } : r));
        }
        reportId = newId("rep");
        return [
          {
            id: reportId,
            scan_id: scanId,
            radiologist_id: currentUser.id,
            findings, impression,
            status: "draft" as const,
            e_signature: null,
            finalized_at: null,
          },
          ...prev,
        ];
      });
      writeAudit(currentUser, "REPORT_DRAFT_SAVED", "radiology_reports", `Draft saved for scan ${scanId}`);
      return reportId;
    },
    [currentUser, writeAudit]
  );

  const finalizeReport = useCallback(
    (reportId: string, signature: string) => {
      setReports((prev) =>
        prev.map((r) =>
          r.id === reportId
            ? { ...r, status: "finalized", e_signature: signature, finalized_at: new Date().toISOString() }
            : r
        )
      );
      writeAudit(currentUser, "REPORT_FINALIZED", "radiology_reports", `Report ${reportId} electronically signed`);

      const report = reports.find((r) => r.id === reportId);
      const scan = report ? scans.find((s) => s.id === report.scan_id) : undefined;
      const apt = scan ? appointments.find((a) => a.id === scan.appointment_id) : undefined;
      if (apt) {
        pushNotification(apt.patient_id, "report_ready", "Your MRI report is ready", `Your ${scan?.body_part ?? ""} MRI report has been finalized.`);
        // FR42 — referring doctors are never notified when a report is
        // finalized otherwise; only fires when a referring account exists
        // (a patient-named doctor without an account has nothing to notify).
        if (apt.referring_doctor_id) {
          const patient = profiles.find((p) => p.id === apt.patient_id);
          pushNotification(
            apt.referring_doctor_id,
            "report_ready",
            "A report for your patient is ready",
            `${patient?.full_name ?? "Your patient"}'s ${scan?.body_part ?? ""} MRI report has been finalized and is available in their record.`
          );
        }
      }
    },
    [currentUser, writeAudit, reports, scans, appointments, profiles, pushNotification]
  );

  const addAnnotation: Store["addAnnotation"] = useCallback(
    (scanId, x, y, note) => {
      const annotation: ImageAnnotation = {
        id: newId("anno"),
        scan_id: scanId,
        author_id: currentUser.id,
        x, y, note,
        created_at: new Date().toISOString(),
      };
      setAnnotations((prev) => [annotation, ...prev]);
      writeAudit(currentUser, "IMAGE_ANNOTATED", "mri_scans", `Annotation added to scan ${scanId}`);
    },
    [currentUser, writeAudit]
  );

  const removeAnnotation = useCallback(
    (id: string) => {
      setAnnotations((prev) => prev.filter((a) => a.id !== id));
    },
    []
  );

  const assignStaffToAppointment: Store["assignStaffToAppointment"] = useCallback(
    (appointmentId, { technicianId, radiologistId }) => {
      setAppointments((prev) =>
        prev.map((a) =>
          a.id === appointmentId
            ? { ...a, assigned_technician_id: technicianId, assigned_radiologist_id: radiologistId }
            : a
        )
      );
      const technician = technicianId ? profiles.find((p) => p.id === technicianId) : null;
      const radiologist = radiologistId ? profiles.find((p) => p.id === radiologistId) : null;
      writeAudit(
        currentUser,
        "STAFF_ASSIGNED",
        "appointments",
        `Appointment ${appointmentId}: technician=${technician?.full_name ?? "unassigned"}, radiologist=${radiologist?.full_name ?? "unassigned"}`
      );
    },
    [currentUser, writeAudit, profiles]
  );

  const uploadReferral = useCallback(
    (appointmentId: string, referralPath: string) => {
      setAppointments((prev) =>
        prev.map((a) => (a.id === appointmentId ? { ...a, referral_url: referralPath } : a))
      );
      writeAudit(currentUser, "REFERRAL_UPLOADED", "appointments", `Referral attached to appointment ${appointmentId}`);
    },
    [currentUser, writeAudit]
  );

  const createDoctorReferral: Store["createDoctorReferral"] = useCallback(
    ({ patientFullName, patientEmail, patientDob, bodyPart, notes }) => {
      const email = patientEmail.trim().toLowerCase();
      if (!email) return { ok: false, error: "Patient email is required.", matchedExistingPatient: false };

      // Matches by email only — the same unique identifier auth already
      // keys on. In the real backend this same lookup happens via a
      // security-definer trigger on profile creation, so a patient who
      // signs up *after* this referral is created still gets linked
      // automatically the moment their account exists.
      const matchedPatient = profiles.find((p) => p.role === "patient" && p.email.toLowerCase() === email);

      const referral: DoctorReferral = {
        id: newId("dref"),
        referring_doctor_id: currentUser.id,
        patient_full_name: patientFullName.trim(),
        patient_email: email,
        patient_dob: patientDob,
        body_part: bodyPart,
        notes: notes?.trim() || null,
        patient_id: matchedPatient?.id ?? null,
        used_in_appointment_id: null,
        created_at: new Date().toISOString(),
      };
      setDoctorReferrals((prev) => [referral, ...prev]);
      writeAudit(
        currentUser,
        "DOCTOR_REFERRAL_CREATED",
        "doctor_referrals",
        `${bodyPart} referral created for ${patientFullName}${matchedPatient ? " (matched to existing patient account)" : " (awaiting patient sign-up)"}`
      );
      if (matchedPatient) {
        pushNotification(
          matchedPatient.id,
          "referral_received",
          "You've been referred for an MRI",
          `${currentUser.full_name} has referred you for a ${bodyPart} MRI. You can book anytime — we've pre-filled it for you.`
        );
      }
      return { ok: true, matchedExistingPatient: Boolean(matchedPatient) };
    },
    [profiles, currentUser, writeAudit, pushNotification]
  );

  const markBillPaid = useCallback(
    (billId: string, method: string) => {
      setBilling((prev) =>
        prev.map((b) =>
          b.id === billId
            ? { ...b, payment_status: "paid", payment_method: method, paid_at: new Date().toISOString(), receipt_url: `receipts/${billId}.pdf` }
            : b
        )
      );
      writeAudit(currentUser, "PAYMENT_RECORDED", "billing", `Bill ${billId} marked paid via ${method}`);

      const bill = billing.find((b) => b.id === billId);
      const apt = bill ? appointments.find((a) => a.id === bill.appointment_id) : undefined;
      if (apt) {
        pushNotification(apt.patient_id, "payment_received", "Payment received", "We've received your payment and your receipt is ready.");
      }
    },
    [currentUser, writeAudit, billing, appointments, pushNotification]
  );

  const submitInsuranceClaim: Store["submitInsuranceClaim"] = useCallback(
    (billId, claimNumber) => {
      setBilling((prev) =>
        prev.map((b) =>
          b.id === billId
            ? { ...b, insurance_claim_number: claimNumber, insurance_claim_status: "submitted", insurance_submitted_at: new Date().toISOString() }
            : b
        )
      );
      writeAudit(currentUser, "INSURANCE_CLAIM_SUBMITTED", "billing", `Claim ${claimNumber} submitted for bill ${billId}`);
    },
    [currentUser, writeAudit]
  );

  const resolveInsuranceClaim: Store["resolveInsuranceClaim"] = useCallback(
    (billId, approved, note) => {
      setBilling((prev) =>
        prev.map((b) =>
          b.id === billId
            ? {
                ...b,
                insurance_claim_status: approved ? "approved" : "rejected",
                insurance_resolved_at: new Date().toISOString(),
                insurance_note: note || null,
                payment_status: approved ? "paid" : b.payment_status,
                paid_at: approved ? new Date().toISOString() : b.paid_at,
                receipt_url: approved ? `receipts/${billId}.pdf` : b.receipt_url,
              }
            : b
        )
      );
      writeAudit(
        currentUser,
        approved ? "INSURANCE_CLAIM_APPROVED" : "INSURANCE_CLAIM_REJECTED",
        "billing",
        `Bill ${billId}${note ? ` — ${note}` : ""}`
      );

      const bill = billing.find((b) => b.id === billId);
      const apt = bill ? appointments.find((a) => a.id === bill.appointment_id) : undefined;
      if (apt) {
        pushNotification(
          apt.patient_id,
          "insurance_claim_resolved",
          approved ? "Insurance claim approved" : "Insurance claim rejected",
          approved
            ? "Your insurance claim was approved and your bill is now settled."
            : `Your insurance claim was rejected.${note ? ` Reason: ${note}` : ""}`
        );
      }
    },
    [currentUser, writeAudit, billing, appointments, pushNotification]
  );

  // Deliberately does not take the message/reply text — chat content hasn't
  // been given the encryption/access-control treatment that would justify
  // storing it (see constraint in the assistant's system prompt design,
  // backend/lib/assistant/prompts.ts). Metadata only.
  const logAssistantAction = useCallback(
    (summary: string) => {
      writeAudit(currentUser, "ASSISTANT_QUERY", "assistant", summary);
    },
    [currentUser, writeAudit]
  );

  const sendPatientMessage: Store["sendPatientMessage"] = useCallback(
    (patientId, body) => {
      const trimmed = body.trim();
      if (!trimmed) return;
      let threadId = messageThreads.find((t) => t.kind === "patient" && t.patient_id === patientId)?.id ?? null;
      if (!threadId) {
        threadId = newId("thread");
        setMessageThreads((prev) => [...prev, { id: threadId as string, kind: "patient", patient_id: patientId, created_at: new Date().toISOString() }]);
      }
      setMessages((prev) => [
        ...prev,
        { id: newId("msg"), thread_id: threadId as string, sender_id: currentUser.id, sender_name: currentUser.full_name, sender_role: currentUser.role, body: trimmed, created_at: new Date().toISOString() },
      ]);
      writeAudit(currentUser, "MESSAGE_SENT", "messages", `Message sent in patient thread for ${patientId}`);
      // Only notify across the patient/staff boundary — staff replying
      // notifies the patient; a patient's own message doesn't page anyone
      // specific since any available staff member can pick it up.
      if (currentUser.id !== patientId) {
        pushNotification(patientId, "message_received", "New message from your care team", trimmed.slice(0, 120));
      }
    },
    [currentUser, messageThreads, writeAudit, pushNotification]
  );

  const sendInternalMessage: Store["sendInternalMessage"] = useCallback(
    (body) => {
      const trimmed = body.trim();
      if (!trimmed) return;
      let threadId = messageThreads.find((t) => t.kind === "internal")?.id ?? null;
      if (!threadId) {
        threadId = newId("thread");
        setMessageThreads((prev) => [...prev, { id: threadId as string, kind: "internal", patient_id: null, created_at: new Date().toISOString() }]);
      }
      setMessages((prev) => [
        ...prev,
        { id: newId("msg"), thread_id: threadId as string, sender_id: currentUser.id, sender_name: currentUser.full_name, sender_role: currentUser.role, body: trimmed, created_at: new Date().toISOString() },
      ]);
      writeAudit(currentUser, "MESSAGE_SENT", "messages", "Message posted to internal staff channel");
    },
    [currentUser, messageThreads, writeAudit]
  );

  const addInventoryItem: Store["addInventoryItem"] = useCallback(
    (input) => {
      setInventoryItems((prev) => [{ id: newId("inv"), ...input }, ...prev]);
      writeAudit(currentUser, "INVENTORY_ITEM_ADDED", "inventory_items", `${input.name} added (${input.quantity_on_hand} ${input.unit})`);
    },
    [currentUser, writeAudit]
  );

  const recordInventoryTransaction: Store["recordInventoryTransaction"] = useCallback(
    (itemId, type, quantity, note) => {
      if (quantity <= 0) return;
      let updatedItem: InventoryItem | undefined;
      setInventoryItems((prev) =>
        prev.map((item) => {
          if (item.id !== itemId) return item;
          const delta = type === "stock_in" ? quantity : -quantity;
          updatedItem = { ...item, quantity_on_hand: Math.max(0, item.quantity_on_hand + delta) };
          return updatedItem;
        })
      );
      setInventoryTransactions((prev) => [
        { id: newId("itx"), item_id: itemId, type, quantity, performed_by: currentUser.id, note, performed_at: new Date().toISOString() },
        ...prev,
      ]);
      writeAudit(currentUser, "INVENTORY_TRANSACTION", "inventory_transactions", `${type} ${quantity} on ${itemId}${note ? ` — ${note}` : ""}`);

      // FR59 — low-stock alert, pushed to every admin.
      if (updatedItem && updatedItem.quantity_on_hand <= updatedItem.reorder_threshold) {
        profiles
          .filter((p) => p.role === "admin")
          .forEach((admin) => {
            pushNotification(
              admin.id,
              "low_stock",
              "Low stock alert",
              `${updatedItem?.name} is at ${updatedItem?.quantity_on_hand} ${updatedItem?.unit} (reorder threshold ${updatedItem?.reorder_threshold}).`
            );
          });
      }
    },
    [currentUser, profiles, writeAudit, pushNotification]
  );

  const addSupplier: Store["addSupplier"] = useCallback(
    (input) => {
      setSuppliers((prev) => [{ id: newId("sup"), ...input }, ...prev]);
      writeAudit(currentUser, "SUPPLIER_ADDED", "suppliers", `${input.name} added`);
    },
    [currentUser, writeAudit]
  );

  const updateContentPage: Store["updateContentPage"] = useCallback(
    (id, patch) => {
      setContentPages((prev) =>
        prev.map((p) => (p.id === id ? { ...p, ...patch, updated_at: new Date().toISOString(), updated_by: currentUser.id } : p))
      );
      writeAudit(currentUser, "CONTENT_PAGE_UPDATED", "content_pages", `${id} page updated`);
    },
    [currentUser, writeAudit]
  );

  const addAnnouncement: Store["addAnnouncement"] = useCallback(
    (title, message) => {
      setAnnouncements((prev) => [
        { id: newId("ann"), title, message, active: true, created_at: new Date().toISOString() },
        ...prev,
      ]);
      writeAudit(currentUser, "ANNOUNCEMENT_POSTED", "announcements", title);
    },
    [currentUser, writeAudit]
  );

  const toggleAnnouncement = useCallback(
    (id: string) => {
      setAnnouncements((prev) => prev.map((a) => (a.id === id ? { ...a, active: !a.active } : a)));
    },
    []
  );

  const updatePrepInstruction: Store["updatePrepInstruction"] = useCallback(
    (bodyPart, instructions) => {
      setPrepInstructions((prev) => {
        const existing = prev.find((p) => p.body_part === bodyPart);
        const updated = { body_part: bodyPart, instructions, updated_at: new Date().toISOString() };
        return existing ? prev.map((p) => (p.body_part === bodyPart ? updated : p)) : [...prev, updated];
      });
      writeAudit(currentUser, "PREP_INSTRUCTIONS_UPDATED", "prep_instructions", `${bodyPart} instructions updated`);
    },
    [currentUser, writeAudit]
  );

  const updateScanPrice: Store["updateScanPrice"] = useCallback(
    (bodyPart, price) => {
      setScanPrices((prev) => ({ ...prev, [bodyPart]: price }));
      writeAudit(currentUser, "SCAN_PRICE_UPDATED", "scan_prices", `${bodyPart} set to $${price.toFixed(2)}`);
    },
    [currentUser, writeAudit]
  );

  const scheduleEquipmentService = useCallback(
    (equipmentId: string) => {
      const due = new Date();
      due.setDate(due.getDate() + 90);
      setEquipment((prev) =>
        prev.map((e) =>
          e.id === equipmentId
            ? {
                ...e,
                status: "operational",
                last_calibration: new Date().toISOString().slice(0, 10),
                maintenance_due: due.toISOString().slice(0, 10),
              }
            : e
        )
      );
      writeAudit(currentUser, "EQUIPMENT_SERVICED", "equipment_logs", `Calibration completed for ${equipmentId}; next service in 90 days`);
      setEquipmentServiceLog((prev) => [
        {
          id: newId("svc"),
          equipment_id: equipmentId,
          performed_by: currentUser.id,
          action: "calibration",
          notes: "Routine calibration and recalibration completed.",
          performed_at: new Date().toISOString(),
        },
        ...prev,
      ]);
    },
    [currentUser, writeAudit]
  );

  const registerEquipment: Store["registerEquipment"] = useCallback(
    ({ machine_name, model }) => {
      const equipmentId = newId("eq");
      const today = new Date().toISOString().slice(0, 10);
      const due = new Date();
      due.setDate(due.getDate() + 90);
      setEquipment((prev) => [
        {
          id: equipmentId,
          machine_name,
          model,
          status: "operational",
          last_calibration: today,
          maintenance_due: due.toISOString().slice(0, 10),
          usage_hours: 0,
        },
        ...prev,
      ]);
      setEquipmentServiceLog((prev) => [
        {
          id: newId("svc"),
          equipment_id: equipmentId,
          performed_by: currentUser.id,
          action: "registered",
          notes: `${machine_name} (${model}) registered to the fleet.`,
          performed_at: new Date().toISOString(),
        },
        ...prev,
      ]);
      writeAudit(currentUser, "EQUIPMENT_REGISTERED", "equipment_logs", `${machine_name} (${model}) registered`);
    },
    [currentUser, writeAudit]
  );

  const registerPatient: Store["registerPatient"] = useCallback(
    ({ fullName, dob, sex, preferredName, phone, email, address, suburb, state, postcode, medicareNumber, medicareExpiry, forceCreate }) => {
      const trimmedName = fullName.trim();
      const normalizedPhone = phone.trim();

      // Duplicate check (never auto-merge) — same name + same DOB, or same
      // name + same mobile. Surfaced to reception to pick the existing
      // patient or confirm it's genuinely a different person.
      if (!forceCreate) {
        const possibleDuplicates = profiles
          .filter((p) => p.role === "patient")
          .filter((p) => p.full_name.trim().toLowerCase() === trimmedName.toLowerCase())
          .filter((p) => {
            const record = records.find((r) => r.patient_id === p.id);
            const dobMatch = record?.dob === dob;
            const phoneMatch = Boolean(normalizedPhone) && p.phone?.replace(/\s+/g, "") === normalizedPhone.replace(/\s+/g, "");
            return dobMatch || phoneMatch;
          })
          .map((p) => {
            const record = records.find((r) => r.patient_id === p.id);
            return { id: p.id, full_name: p.full_name, dob: record?.dob ?? "", phone: p.phone };
          });
        if (possibleDuplicates.length > 0) {
          return { ok: false, possibleDuplicates };
        }
      }

      const patientId = newId("patient");
      const newProfile: Profile = {
        id: patientId, email: email.trim(), full_name: trimmedName, role: "patient",
        phone: normalizedPhone || undefined, username: null, created_at: new Date().toISOString(),
      };
      setProfiles((prev) => [...prev, newProfile]);
      setRecords((prev) => [
        ...prev,
        {
          id: newId("rec"), patient_id: patientId, dob,
          history: "", contraindications: { metal_implants: false, pacemaker: false, claustrophobia: false, contrast_allergy: false, pregnancy: false, other: null },
          emergency_contact: { name: "", relationship: "", phone: "" },
          patient_code: `CR-${10000 + prev.length + 1}`, sex, preferred_name: preferredName,
          address, suburb, state, postcode, medicare_number: medicareNumber, medicare_expiry: medicareExpiry,
        },
      ]);
      writeAudit(currentUser, "PATIENT_REGISTERED", "profiles", `${trimmedName} registered at the front desk`);
      return { ok: true, patientId, possibleDuplicates: [] };
    },
    [profiles, records, currentUser, writeAudit]
  );

  const checkInAppointment: Store["checkInAppointment"] = useCallback(
    (appointmentId) => {
      const apt = appointments.find((a) => a.id === appointmentId);
      if (!apt) return { ok: false, error: "Appointment not found." };
      if (apt.status === "cancelled") return { ok: false, error: "This appointment was cancelled — it can't be checked in." };
      if (!canTransitionArrival(apt.arrival_status, "waiting")) {
        return { ok: false, error: `Cannot check in from "${apt.arrival_status.replace(/_/g, " ")}".` };
      }
      const now = new Date().toISOString();
      setAppointments((prev) =>
        prev.map((a) => (a.id === appointmentId ? { ...a, arrival_status: "waiting", arrived_at: a.arrived_at ?? now, checked_in_at: now } : a))
      );
      writeAudit(currentUser, "PATIENT_CHECKED_IN", "appointments", `Checked in appointment ${appointmentId}`);
      return { ok: true };
    },
    [appointments, currentUser, writeAudit]
  );

  const markArrived: Store["markArrived"] = useCallback(
    (appointmentId) => {
      const apt = appointments.find((a) => a.id === appointmentId);
      if (!apt) return { ok: false, error: "Appointment not found." };
      if (!canTransitionArrival(apt.arrival_status, "arrived")) {
        return { ok: false, error: `Cannot mark arrived from "${apt.arrival_status.replace(/_/g, " ")}".` };
      }
      setAppointments((prev) => prev.map((a) => (a.id === appointmentId ? { ...a, arrival_status: "arrived", arrived_at: new Date().toISOString() } : a)));
      writeAudit(currentUser, "PATIENT_ARRIVED", "appointments", `Marked arrived: appointment ${appointmentId}`);
      return { ok: true };
    },
    [appointments, currentUser, writeAudit]
  );

  const markNoShow: Store["markNoShow"] = useCallback(
    (appointmentId) => {
      const apt = appointments.find((a) => a.id === appointmentId);
      if (!apt) return { ok: false, error: "Appointment not found." };
      if (!canTransitionArrival(apt.arrival_status, "no_show")) {
        return { ok: false, error: `Cannot mark no-show from "${apt.arrival_status.replace(/_/g, " ")}".` };
      }
      setAppointments((prev) => prev.map((a) => (a.id === appointmentId ? { ...a, arrival_status: "no_show" } : a)));
      writeAudit(currentUser, "APPOINTMENT_NO_SHOW", "appointments", `Marked no-show: appointment ${appointmentId}`);
      return { ok: true };
    },
    [appointments, currentUser, writeAudit]
  );

  const confirmAppointment: Store["confirmAppointment"] = useCallback(
    (appointmentId) => {
      setAppointments((prev) => prev.map((a) => (a.id === appointmentId ? { ...a, confirmed: true } : a)));
      writeAudit(currentUser, "APPOINTMENT_CONFIRMED", "appointments", `Appointment ${appointmentId} confirmed`);
    },
    [currentUser, writeAudit]
  );

  const setReferralStatus: Store["setReferralStatus"] = useCallback(
    (appointmentId, status) => {
      setAppointments((prev) => prev.map((a) => (a.id === appointmentId ? { ...a, referral_status_override: status } : a)));
      writeAudit(currentUser, "REFERRAL_STATUS_UPDATED", "appointments", `Appointment ${appointmentId} referral status set to ${status}`);
    },
    [currentUser, writeAudit]
  );

  const setPaymentType: Store["setPaymentType"] = useCallback(
    (billId, paymentType) => {
      setBilling((prev) => prev.map((b) => (b.id === billId ? { ...b, payment_method: paymentType } : b)));
      writeAudit(currentUser, "PAYMENT_TYPE_SET", "billing", `Bill ${billId} payment type set to ${paymentType}`);
    },
    [currentUser, writeAudit]
  );

  const logCommunication: Store["logCommunication"] = useCallback(
    (appointmentId, channel, purpose) => {
      setCommunicationLog((prev) => [
        { id: newId("comm"), appointment_id: appointmentId, channel, purpose, status: "not_sent", note: "Demo mode — no provider connected.", created_by: currentUser.id, created_at: new Date().toISOString() },
        ...prev,
      ]);
      writeAudit(currentUser, "COMMUNICATION_LOGGED", "communications", `${channel} ${purpose} logged for appointment ${appointmentId} (demo mode, not sent)`);
    },
    [currentUser, writeAudit]
  );

  const value = useMemo<Store>(
    () => ({
      currentUser, previewRole, setPreviewRole, effectiveRole,
      profiles, records, appointments, scans, reports, billing, equipment, equipmentServiceLog,
      audit, notifications, notificationPreferences, doctorReferrals, annotations,
      messageThreads, messages, inventoryItems, inventoryTransactions, suppliers,
      contentPages, announcements, prepInstructions, scanPrices, communicationLog,
      bookAppointment, cancelAppointment, rescheduleAppointment, updateRecord, updateNotificationPreferences,
      startScan, logScan, acknowledgeReferral,
      saveReportDraft, finalizeReport, addAnnotation, removeAnnotation,
      uploadReferral, createDoctorReferral,
      markBillPaid, submitInsuranceClaim, resolveInsuranceClaim,
      assignStaffToAppointment, scheduleEquipmentService, registerEquipment,
      registerPatient, checkInAppointment, markArrived, markNoShow, confirmAppointment,
      setReferralStatus, setPaymentType, logCommunication,
      sendPatientMessage, sendInternalMessage,
      addInventoryItem, recordInventoryTransaction, addSupplier,
      updateContentPage, addAnnouncement, toggleAnnouncement, updatePrepInstruction, updateScanPrice,
      markNotificationRead,
      logAssistantAction,
    }),
    [
      currentUser, previewRole, setPreviewRole, effectiveRole, profiles, records, appointments, scans, reports,
      billing, equipment, equipmentServiceLog, audit, notifications, notificationPreferences, doctorReferrals,
      annotations, messageThreads, messages, inventoryItems, inventoryTransactions, suppliers,
      contentPages, announcements, prepInstructions, scanPrices, communicationLog,
      bookAppointment, cancelAppointment, rescheduleAppointment, updateRecord, updateNotificationPreferences,
      startScan, logScan, acknowledgeReferral, saveReportDraft, finalizeReport, addAnnotation, removeAnnotation,
      uploadReferral, createDoctorReferral, markBillPaid, submitInsuranceClaim, resolveInsuranceClaim,
      assignStaffToAppointment, scheduleEquipmentService, registerEquipment,
      registerPatient, checkInAppointment, markArrived, markNoShow, confirmAppointment,
      setReferralStatus, setPaymentType, logCommunication,
      sendPatientMessage, sendInternalMessage, addInventoryItem, recordInventoryTransaction, addSupplier,
      updateContentPage, addAnnouncement, toggleAnnouncement, updatePrepInstruction, updateScanPrice,
      markNotificationRead, logAssistantAction,
    ]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside <StoreProvider>");
  return ctx;
}
