"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  SEED_APPOINTMENTS, SEED_AUDIT, SEED_BILLING, SEED_EQUIPMENT,
  SEED_NOTIFICATIONS, SEED_PROFILES, SEED_RECORDS, SEED_REPORTS, SEED_SCANS, SCAN_PRICES,
} from "./seed";
import type {
  Appointment, AuditLog, Billing, Contraindications, EquipmentLog,
  MedicalRecord, MriScan, Notification, Profile, RadiologyReport, Role,
} from "./types";

let uid = 100;
const newId = (prefix: string) => `${prefix}-${++uid}-${Date.now().toString(36)}`;

// TEMPORARY cross-tab sync for demo mode: there's no backend yet (see
// lib/auth/local-accounts.ts), so without this, each browser tab boots its
// own isolated copy of the seed data and a booking made in one tab is
// invisible in another. Mirroring the shared collections to localStorage —
// and listening for the native `storage` event, which the browser fires in
// every OTHER tab of the same origin whenever localStorage changes — makes
// bookings/uploads/reports show up across tabs without a real server. This
// is last-write-wins with no conflict resolution; it's a stand-in for the
// Supabase wiring described in README.md, not a replacement for it.
const STORAGE_KEY = "capital-radiology-demo-store-v1";

interface PersistedData {
  records: MedicalRecord[];
  appointments: Appointment[];
  scans: MriScan[];
  reports: RadiologyReport[];
  billing: Billing[];
  equipment: EquipmentLog[];
  audit: AuditLog[];
  notifications: Notification[];
}

function loadPersisted(): PersistedData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PersistedData) : null;
  } catch {
    return null;
  }
}

function savePersisted(data: PersistedData) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // best-effort only — ignore quota errors / privacy-mode storage blocks
  }
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
  audit: AuditLog[];
  notifications: Notification[];

  // patient actions
  bookAppointment: (input: {
    date: string; time_slot: string; location: string; body_part: string;
    referralFileName: string | null; referringDoctorId: string | null;
  }) => { ok: boolean; error?: string };
  cancelAppointment: (id: string) => void;
  updateRecord: (patch: { history: string; contraindications: Contraindications; emergency_contact: MedicalRecord["emergency_contact"] }) => void;

  // technician actions
  startScan: (appointmentId: string) => void;
  logScan: (input: { appointment_id: string; body_part: string; protocol: string; scan_duration: number; machine_name: string; dicomFileName: string }) => void;

  // radiologist actions
  saveReportDraft: (scanId: string, findings: string, impression: string) => string;
  finalizeReport: (reportId: string, signature: string) => void;

  // referring doctor actions
  uploadReferral: (appointmentId: string, fileName: string) => void;

  // admin actions
  markBillPaid: (billId: string, method: string) => void;
  scheduleEquipmentService: (equipmentId: string) => void;

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
      // non-admins (see Shell.tsx), but never let preview change identity.
      if (currentUser.role !== "admin") return;
      setPreviewRoleState(role);
    },
    [currentUser.role]
  );

  const [profiles] = useState<Profile[]>(SEED_PROFILES);
  const [records, setRecords] = useState<MedicalRecord[]>(() => loadPersisted()?.records ?? SEED_RECORDS);
  const [appointments, setAppointments] = useState<Appointment[]>(() => loadPersisted()?.appointments ?? SEED_APPOINTMENTS);
  const [scans, setScans] = useState<MriScan[]>(() => loadPersisted()?.scans ?? SEED_SCANS);
  const [reports, setReports] = useState<RadiologyReport[]>(() => loadPersisted()?.reports ?? SEED_REPORTS);
  const [billing, setBilling] = useState<Billing[]>(() => loadPersisted()?.billing ?? SEED_BILLING);
  const [equipment, setEquipment] = useState<EquipmentLog[]>(() => loadPersisted()?.equipment ?? SEED_EQUIPMENT);
  const [audit, setAudit] = useState<AuditLog[]>(() => loadPersisted()?.audit ?? SEED_AUDIT);
  const [notifications, setNotifications] = useState<Notification[]>(() => loadPersisted()?.notifications ?? SEED_NOTIFICATIONS);

  // Persist on every change so new tabs (and reloads) pick up the latest state.
  useEffect(() => {
    savePersisted({ records, appointments, scans, reports, billing, equipment, audit, notifications });
  }, [records, appointments, scans, reports, billing, equipment, audit, notifications]);

  // Pick up changes written by other tabs. The `storage` event only fires in
  // tabs OTHER than the one that wrote the change, so this can't loop with
  // the save effect above.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== STORAGE_KEY || !e.newValue) return;
      try {
        const data = JSON.parse(e.newValue) as PersistedData;
        setRecords(data.records);
        setAppointments(data.appointments);
        setScans(data.scans);
        setReports(data.reports);
        setBilling(data.billing);
        setEquipment(data.equipment);
        setAudit(data.audit);
        setNotifications(data.notifications);
      } catch {
        // ignore malformed data from another tab
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

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
    ({ date, time_slot, location, body_part, referralFileName, referringDoctorId }) => {
      const clash = appointments.some(
        (a) => a.date === date && a.time_slot === time_slot && a.location === location && a.status !== "cancelled"
      );
      if (clash) return { ok: false, error: "That slot is already booked at this location. Choose another time." };

      const apt: Appointment = {
        id: newId("apt"),
        patient_id: currentUser.id,
        date, time_slot, location, body_part,
        status: "scheduled",
        referral_url: referralFileName ? `referrals/${referralFileName}` : null,
        referring_doctor_id: referringDoctorId,
        created_at: new Date().toISOString(),
      };
      setAppointments((prev) => [apt, ...prev]);
      setBilling((prev) => [
        {
          id: newId("bill"),
          appointment_id: apt.id,
          amount: SCAN_PRICES[body_part] ?? 480,
          payment_status: "pending",
          payment_method: null,
          receipt_url: null,
          paid_at: null,
        },
        ...prev,
      ]);
      writeAudit(currentUser, "APPOINTMENT_BOOKED", "appointments", `${body_part} — ${location} on ${date} ${time_slot}`);
      pushNotification(currentUser.id, "appointment_booked", "Appointment booked", `${body_part} MRI — ${location} on ${date} at ${time_slot}.`);
      return { ok: true };
    },
    [appointments, currentUser, writeAudit, pushNotification]
  );

  const cancelAppointment = useCallback(
    (id: string) => {
      setAppointments((prev) => prev.map((a) => (a.id === id ? { ...a, status: "cancelled" } : a)));
      writeAudit(currentUser, "APPOINTMENT_CANCELLED", "appointments", `Appointment ${id} cancelled`);
      pushNotification(currentUser.id, "appointment_cancelled", "Appointment cancelled", `Appointment ${id} has been cancelled.`);
    },
    [currentUser, writeAudit, pushNotification]
  );

  const updateRecord: Store["updateRecord"] = useCallback(
    (patch) => {
      setRecords((prev) => {
        const existing = prev.find((r) => r.patient_id === currentUser.id);
        if (existing) {
          return prev.map((r) => (r.patient_id === currentUser.id ? { ...r, ...patch } : r));
        }
        return [
          ...prev,
          { id: newId("rec"), patient_id: currentUser.id, dob: "1990-01-01", ...patch },
        ];
      });
      writeAudit(currentUser, "RECORD_UPDATED", "patient_medical_records", "Health profile & contraindications saved");
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
        dicom_image_url: `dicom/${input.dicomFileName}`,
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
      }
    },
    [currentUser, writeAudit, reports, scans, appointments, pushNotification]
  );

  const uploadReferral = useCallback(
    (appointmentId: string, fileName: string) => {
      setAppointments((prev) =>
        prev.map((a) => (a.id === appointmentId ? { ...a, referral_url: `referrals/${fileName}` } : a))
      );
      writeAudit(currentUser, "REFERRAL_UPLOADED", "appointments", `Referral attached to appointment ${appointmentId}`);
    },
    [currentUser, writeAudit]
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

  // Deliberately does not take the message/reply text — the audit log is
  // persisted (see the cross-tab localStorage sync above) and chat content
  // hasn't been given the encryption/access-control treatment that would
  // justify storing it (see constraint in the assistant's system prompt
  // design, lib/assistant/prompts.ts). Metadata only.
  const logAssistantAction = useCallback(
    (summary: string) => {
      writeAudit(currentUser, "ASSISTANT_QUERY", "assistant", summary);
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
    },
    [currentUser, writeAudit]
  );

  const value = useMemo<Store>(
    () => ({
      currentUser, previewRole, setPreviewRole, effectiveRole,
      profiles, records, appointments, scans, reports, billing, equipment, audit, notifications,
      bookAppointment, cancelAppointment, updateRecord,
      startScan, logScan,
      saveReportDraft, finalizeReport,
      uploadReferral,
      markBillPaid, scheduleEquipmentService,
      markNotificationRead,
      logAssistantAction,
    }),
    [
      currentUser, previewRole, setPreviewRole, effectiveRole, profiles, records, appointments, scans, reports,
      billing, equipment, audit, notifications, bookAppointment, cancelAppointment, updateRecord,
      startScan, logScan, saveReportDraft, finalizeReport, uploadReferral, markBillPaid, scheduleEquipmentService,
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
