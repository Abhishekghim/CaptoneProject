import { format } from "date-fns";
import { describe, expect, it } from "vitest";
import { buildAssistantContext, type StoreSnapshot } from "@/frontend/lib/assistant/scope";
import type {
  Appointment, Billing, EquipmentLog, MriScan, Profile, RadiologyReport,
} from "@/shared/types";
import type { ProfileRow } from "@/frontend/lib/hooks/useProfiles";
import type { MedicalRecordRow } from "@/frontend/lib/hooks/useMedicalRecords";

const TODAY = format(new Date(), "yyyy-MM-dd");

function profile(overrides: Partial<Profile> & Pick<Profile, "id" | "role">): Profile {
  return {
    email: `${overrides.id}@example.com`,
    full_name: `User ${overrides.id}`,
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function profileRow(overrides: Partial<ProfileRow> & Pick<ProfileRow, "id" | "role">): ProfileRow {
  return {
    email: `${overrides.id}@example.com`,
    full_name: `User ${overrides.id}`,
    phone: null,
    username: null,
    is_active: true,
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function appointment(overrides: Partial<Appointment> & Pick<Appointment, "id" | "patient_id">): Appointment {
  return {
    date: TODAY,
    time_slot: "09:00",
    location: "Sydney CBD Clinic",
    body_part: "Brain",
    status: "scheduled",
    referral_url: null,
    referring_doctor_id: null,
    referring_doctor_name: null,
    referring_doctor_practice: null,
    referral_reviewed: false,
    referral_reviewed_by: null,
    referral_reviewed_at: null,
    assigned_technician_id: null,
    assigned_radiologist_id: null,
    created_at: "2026-01-01T00:00:00.000Z",
    confirmed: true,
    arrival_status: "not_arrived",
    arrived_at: null,
    checked_in_at: null,
    cancellation_reason: null,
    referral_status_override: null,
    ...overrides,
  };
}

function scan(overrides: Partial<MriScan> & Pick<MriScan, "id" | "appointment_id">): MriScan {
  return {
    body_part: "Brain",
    protocol: "T1/T2",
    scan_duration: 30,
    technician_id: null,
    machine_name: "MRI-1",
    dicom_image_url: null,
    performed_at: null,
    ...overrides,
  };
}

function report(overrides: Partial<RadiologyReport> & Pick<RadiologyReport, "id" | "scan_id">): RadiologyReport {
  return {
    radiologist_id: "rad-1",
    findings: "",
    impression: "",
    status: "draft",
    e_signature: null,
    finalized_at: null,
    ...overrides,
  };
}

function billing(overrides: Partial<Billing> & Pick<Billing, "id" | "appointment_id">): Billing {
  return {
    amount: 250,
    payment_status: "pending",
    payment_method: null,
    receipt_url: null,
    paid_at: null,
    insurance_claim_number: null,
    insurance_claim_status: "not_submitted",
    insurance_submitted_at: null,
    insurance_resolved_at: null,
    insurance_note: null,
    stripe_checkout_session_id: null,
    stripe_payment_intent_id: null,
    stripe_invoice_id: null,
    ...overrides,
  };
}

function medicalRecord(overrides: Partial<MedicalRecordRow> & Pick<MedicalRecordRow, "id" | "patient_id">): MedicalRecordRow {
  return {
    dob: "1990-01-01",
    history: null,
    contraindications: {
      metal_implants: false,
      pacemaker: false,
      claustrophobia: false,
      contrast_allergy: false,
      pregnancy: false,
      other: null,
    },
    emergency_contact: { name: null, relationship: null, phone: null },
    patient_code: null,
    sex: null,
    preferred_name: null,
    address: null,
    suburb: null,
    state: null,
    postcode: null,
    medicare_number: null,
    medicare_expiry: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function equipment(overrides: Partial<EquipmentLog> & Pick<EquipmentLog, "id">): EquipmentLog {
  return {
    machine_name: "MRI-1",
    model: "Acme 3T",
    status: "operational",
    last_calibration: "2026-01-01",
    maintenance_due: "2026-06-01",
    usage_hours: 100,
    ...overrides,
  };
}

function emptySnapshot(currentUser: Profile): StoreSnapshot {
  return {
    currentUser,
    profiles: [],
    appointments: [],
    scans: [],
    reports: [],
    billing: [],
    records: [],
    equipment: [],
  };
}

describe("buildAssistantContext", () => {
  it("patient: scopes to only their own appointments, health flags, reports, and billing", () => {
    const me = profile({ id: "pat-1", role: "patient", full_name: "Jane Patient" });
    const store: StoreSnapshot = {
      ...emptySnapshot(me),
      appointments: [
        appointment({ id: "apt-1", patient_id: "pat-1", body_part: "Spine", status: "completed" }),
        appointment({ id: "apt-2", patient_id: "other-patient" }),
      ],
      records: [
        medicalRecord({
          id: "rec-1",
          patient_id: "pat-1",
          dob: "1985-05-05",
          contraindications: {
            metal_implants: true,
            pacemaker: false,
            claustrophobia: false,
            contrast_allergy: false,
            pregnancy: false,
            other: null,
          },
        }),
      ],
      scans: [scan({ id: "scan-1", appointment_id: "apt-1" })],
      reports: [
        report({ id: "rep-1", scan_id: "scan-1", status: "finalized", findings: "Normal", impression: "No abnormality" }),
      ],
      billing: [billing({ id: "bill-1", appointment_id: "apt-1", payment_status: "pending" })],
    };

    const { role, summary } = buildAssistantContext(store);

    expect(role).toBe("patient");
    expect(summary).toContain("Jane Patient");
    expect(summary).toContain("Appointments (1):");
    expect(summary).toContain("Spine MRI");
    expect(summary).not.toContain("apt-2");
    expect(summary).toContain("metal implants");
    expect(summary).toContain('impression: "No abnormality"');
    expect(summary).toContain("1 invoice(s) total, 1 unpaid/pending");
  });

  it("technician: shows today's scan queue with safety flags, excluding other days", () => {
    const me = profile({ id: "tech-1", role: "technician", full_name: "Tom Tech" });
    const store: StoreSnapshot = {
      ...emptySnapshot(me),
      appointments: [
        appointment({ id: "apt-1", patient_id: "pat-1", date: TODAY, time_slot: "10:00", status: "scheduled" }),
        appointment({ id: "apt-2", patient_id: "pat-2", date: "2020-01-01", status: "scheduled" }),
      ],
      records: [
        medicalRecord({
          id: "rec-1",
          patient_id: "pat-1",
          contraindications: {
            metal_implants: false,
            pacemaker: true,
            claustrophobia: false,
            contrast_allergy: false,
            pregnancy: false,
            other: null,
          },
        }),
      ],
    };

    const { role, summary } = buildAssistantContext(store);

    expect(role).toBe("technician");
    expect(summary).toContain("Today's scan queue (1)");
    expect(summary).toContain("pacemaker");
    expect(summary).not.toContain("apt-2");
  });

  it("radiologist: shows the unreported queue and count of the radiologist's own finalized reports", () => {
    const me = profile({ id: "rad-1", role: "radiologist", full_name: "Dr. Rae" });
    const store: StoreSnapshot = {
      ...emptySnapshot(me),
      scans: [
        scan({ id: "scan-1", appointment_id: "apt-1", body_part: "Knee" }),
        scan({ id: "scan-2", appointment_id: "apt-2", body_part: "Brain" }),
      ],
      reports: [
        report({ id: "rep-2", scan_id: "scan-2", status: "finalized", radiologist_id: "rad-1", impression: "Clear" }),
      ],
    };

    const { role, summary } = buildAssistantContext(store);

    expect(role).toBe("radiologist");
    expect(summary).toContain("Unreported queue (1)");
    expect(summary).toContain("Knee MRI");
    expect(summary).toContain("You have finalized 1 report(s).");
  });

  it("reception: shows administrative status only (arrival/referral/payment), no findings or contraindications", () => {
    const me = profile({ id: "recep-1", role: "reception", full_name: "Rita Reception" });
    const store: StoreSnapshot = {
      ...emptySnapshot(me),
      profiles: [profileRow({ id: "pat-1", role: "patient", full_name: "Pat Patient" })],
      appointments: [
        appointment({
          id: "apt-1",
          patient_id: "pat-1",
          date: TODAY,
          time_slot: "11:00",
          arrival_status: "waiting",
        }),
      ],
      billing: [billing({ id: "bill-1", appointment_id: "apt-1", payment_status: "paid", payment_method: "card" })],
    };

    const { role, summary } = buildAssistantContext(store);

    expect(role).toBe("reception");
    expect(summary).toContain("Pat Patient");
    expect(summary).toContain("arrival: waiting");
    expect(summary).toContain("referral: missing");
    expect(summary).toContain("payment: paid (card)");
    expect(summary).toContain("Currently waiting: 1");
    expect(summary).not.toMatch(/findings|contraindication/i);
  });

  it("referring_doctor: shows only patients they referred, including finalized impressions", () => {
    const me = profile({ id: "doc-1", role: "referring_doctor", full_name: "Dr. Referrer" });
    const store: StoreSnapshot = {
      ...emptySnapshot(me),
      profiles: [profileRow({ id: "pat-1", role: "patient", full_name: "Pat Patient" })],
      appointments: [
        appointment({ id: "apt-1", patient_id: "pat-1", referring_doctor_id: "doc-1", body_part: "Hip" }),
        appointment({ id: "apt-2", patient_id: "pat-2", referring_doctor_id: "other-doc" }),
      ],
      scans: [scan({ id: "scan-1", appointment_id: "apt-1" })],
      reports: [report({ id: "rep-1", scan_id: "scan-1", status: "finalized", impression: "Mild inflammation" })],
    };

    const { role, summary } = buildAssistantContext(store);

    expect(role).toBe("referring_doctor");
    expect(summary).toContain("Patients you referred (1)");
    expect(summary).toContain("Pat Patient");
    expect(summary).toContain("Hip MRI");
    expect(summary).toContain('finalized impression: "Mild inflammation"');
    expect(summary).not.toContain("apt-2");
  });

  it("admin: reports only aggregate operational metrics, never a patient's name", () => {
    const me = profile({ id: "admin-1", role: "admin", full_name: "Adam Admin" });
    const store: StoreSnapshot = {
      ...emptySnapshot(me),
      profiles: [profileRow({ id: "pat-1", role: "patient", full_name: "Very Identifiable Patient Name" })],
      appointments: [
        appointment({ id: "apt-1", patient_id: "pat-1", date: TODAY, status: "scheduled" }),
      ],
      scans: [scan({ id: "scan-1", appointment_id: "apt-1" })],
      reports: [],
      billing: [billing({ id: "bill-1", appointment_id: "apt-1", payment_status: "pending" })],
      equipment: [equipment({ id: "eq-1", status: "maintenance" })],
    };

    const { role, summary } = buildAssistantContext(store);

    expect(role).toBe("admin");
    expect(summary).toContain("Adam Admin");
    expect(summary).not.toContain("Very Identifiable Patient Name");
    expect(summary).toContain("Total scans performed (all time): 1");
    expect(summary).toContain("Appointments today: 1");
    expect(summary).toContain("Open/unpaid invoices: 1");
    expect(summary).toContain("Equipment needing service: 1");
  });

  it("super_admin: routed through the same aggregate-only admin builder", () => {
    const me = profile({ id: "sa-1", role: "super_admin", full_name: "Sam SuperAdmin" });
    const store: StoreSnapshot = {
      ...emptySnapshot(me),
      profiles: [profileRow({ id: "pat-1", role: "patient", full_name: "Should Not Appear" })],
    };

    const { role, summary } = buildAssistantContext(store);

    expect(role).toBe("admin");
    expect(summary).not.toContain("Should Not Appear");
  });
});
