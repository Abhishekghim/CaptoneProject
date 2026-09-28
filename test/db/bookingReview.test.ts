// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { asUser, createTestDb, createUser, type Tx } from "./harness";

// Runs the real schema.sql + migrations (including 037) in an in-process
// Postgres and exercises the booking review workflow the way the app calls it.

let db: PGlite;
const ids = {} as Record<
  "patient" | "otherPatient" | "noRecordPatient" | "reception" | "admin" | "technician" | "radiologist" | "internalDoc" | "externalDoc",
  string
>;

let dayOffset = 0;
function nextDate() {
  dayOffset += 1;
  const d = new Date(Date.UTC(2031, 0, 1 + dayOffset));
  return d.toISOString().slice(0, 10);
}

type Booking = {
  id: string;
  status: string;
  confirmed: boolean;
  booking_review_status: string;
  referring_doctor_id: string | null;
  referring_doctor_name: string | null;
  referral_url: string | null;
  date: string;
  time_slot: string;
  location: string;
};

type BookArgs = {
  patientId?: string;
  date?: string;
  slot?: string;
  location?: string;
  bodyPart?: string;
  doctorId?: string | null;
  doctorName?: string | null;
  doctorPractice?: string | null;
  referralUrl?: string | null;
  referralId?: string | null;
  otherDoctor?: boolean;
};

async function callBook(tx: Tx, a: BookArgs & { patientId: string }): Promise<Booking> {
  const { rows } = await tx.query<Booking>(
    `select * from public.book_appointment(
       p_patient_id => $1, p_date => $2::date, p_time_slot => $3, p_location => $4, p_body_part => $5,
       p_referring_doctor_id => $6, p_referring_doctor_name => $7, p_referring_doctor_practice => $8,
       p_referral_url => $9, p_amount => 480, p_payment_type => null,
       p_referral_id => $10, p_other_doctor => $11)`,
    [
      a.patientId, a.date ?? nextDate(), a.slot ?? "09:00", a.location ?? "Berwick", a.bodyPart ?? "Brain",
      a.doctorId ?? null, a.doctorName ?? null, a.doctorPractice ?? null,
      a.referralUrl ?? null, a.referralId ?? null, a.otherDoctor ?? false,
    ]
  );
  return rows[0];
}

function book(caller: string, a: BookArgs = {}) {
  return asUser(db, caller, (tx) => callBook(tx, { patientId: caller, ...a }));
}

function doc(patientId: string) {
  return `referrals/${patientId}/${Date.now()}-referral.pdf`;
}

function review(caller: string, appointmentId: string, decision: "approve" | "decline", reason?: string) {
  return asUser(db, caller, async (tx) => {
    const { rows } = await tx.query<Booking & { booking_reviewed_by: string; booking_reviewed_at: string; booking_review_reason: string; cancellation_reason: string }>(
      `select * from public.review_booking($1, $2, $3)`,
      [appointmentId, decision, reason ?? null]
    );
    return rows[0];
  });
}

async function takenSlots(caller: string, date: string, location = "Berwick") {
  return asUser(db, caller, async (tx) => {
    const { rows } = await tx.query<{ get_taken_slots: string[] }>(`select public.get_taken_slots($1::date, $2)`, [date, location]);
    return rows[0].get_taken_slots;
  });
}

async function notificationsFor(userId: string, appointmentId: string) {
  const { rows } = await db.query<{ type: string; read: boolean; message: string }>(
    `select type, read, message from public.notifications where user_id = $1 and appointment_id = $2 order by created_at`,
    [userId, appointmentId]
  );
  return rows;
}

type ReferralFields = {
  doctorId: string;
  patientEmail: string;
  bodyPart: string;
  patientName?: string;
  dob?: string | null;
  phone?: string | null;
  withDocument?: boolean;
  hoursAgo?: number;
};

// Defaults describe a referral that matches `ids.patient` exactly.
async function createDoctorReferral(fields: ReferralFields) {
  const row = await asUser(db, fields.doctorId, async (tx) => {
    const { rows } = await tx.query<{ id: string; patient_id: string | null }>(
      `insert into public.doctor_referrals
         (referring_doctor_id, patient_full_name, patient_email, patient_dob, patient_phone, body_part, referral_url)
       values ($1, $2, $3, $4, $5, $6, $7) returning id, patient_id`,
      [
        fields.doctorId,
        fields.patientName ?? "Pat Patient",
        fields.patientEmail,
        fields.dob === undefined ? "1990-05-05" : fields.dob,
        fields.phone === undefined ? "+61 412 345 678" : fields.phone,
        fields.bodyPart,
        fields.withDocument === false ? null : `referrals/${fields.doctorId}/${Date.now()}-referral.pdf`,
      ]
    );
    return rows[0];
  });
  if (fields.hoursAgo) {
    await db.query(`update public.doctor_referrals set created_at = now() - make_interval(hours => $2) where id = $1`, [
      row.id,
      fields.hoursAgo,
    ]);
  }
  return row;
}

beforeAll(async () => {
  db = await createTestDb();
  ids.patient = await createUser(db, {
    role: "patient",
    email: "pat@test.dev",
    fullName: "Pat Patient",
    dob: "1990-05-05",
    phone: "0412 345 678",
  });
  ids.otherPatient = await createUser(db, { role: "patient", email: "other@test.dev", fullName: "Olive Other", dob: "1985-01-01" });
  ids.noRecordPatient = await createUser(db, { role: "patient", email: "norecord@test.dev" });
  ids.reception = await createUser(db, { role: "reception", email: "desk@test.dev" });
  ids.admin = await createUser(db, { role: "admin", email: "admin@test.dev" });
  ids.technician = await createUser(db, { role: "technician", email: "tech@test.dev" });
  ids.radiologist = await createUser(db, { role: "radiologist", email: "rad@test.dev" });
  ids.internalDoc = await createUser(db, { role: "referring_doctor", email: "internal@test.dev", fullName: "Dr Internal" });
  ids.externalDoc = await createUser(db, { role: "referring_doctor", email: "external@test.dev", fullName: "Dr External" });
  await db.query(
    `insert into public.referring_doctor_details (profile_id, practice_name, ahpra_number) values ($1, 'Outside GP', 'MED0001')`,
    [ids.externalDoc]
  );
}, 120_000);

afterAll(async () => {
  await db?.close();
});

describe("Flow A — registered clinic doctor", () => {
  it("holds the slot as pending and asks the internal doctor, not reception, to approve", async () => {
    const date = nextDate();
    const booking = await book(ids.patient, { date, doctorId: ids.internalDoc, referralUrl: doc(ids.patient) });

    expect(booking.confirmed).toBe(false);
    expect(booking.booking_review_status).toBe("pending");
    expect(booking.referring_doctor_id).toBe(ids.internalDoc);
    expect(await takenSlots(ids.otherPatient, date)).toContain("09:00");

    const patientNotes = await notificationsFor(ids.patient, booking.id);
    expect(patientNotes.map((n) => n.type)).toEqual(["appointment_reserved"]);
    expect(patientNotes[0].message).toMatch(/not confirmed yet/);

    const doctorNotes = await notificationsFor(ids.internalDoc, booking.id);
    expect(doctorNotes.map((n) => n.type)).toEqual(["booking_review_requested"]);
    expect(doctorNotes[0].message).not.toMatch(/Pat Patient/);
    expect(await notificationsFor(ids.reception, booking.id)).toEqual([]);
  });

  it("lets the internal doctor see the patient's health record and approve their own patient", async () => {
    const booking = await book(ids.patient, { doctorId: ids.internalDoc, referralUrl: doc(ids.patient) });
    const records = await asUser(db, ids.internalDoc, async (tx) => {
      const r = await tx.query<{ dob: string }>(`select dob from public.patient_medical_records where patient_id = $1`, [ids.patient]);
      return r.rows;
    });
    expect(records).toHaveLength(1);

    const approved = await review(ids.internalDoc, booking.id, "approve");
    expect(approved.booking_review_status).toBe("approved");
    expect(approved.booking_reviewed_by).toBe(ids.internalDoc);
  });

  it("sends a booking naming an external doctor with no matching referral to clinic reviewers", async () => {
    const booking = await book(ids.patient, { doctorId: ids.externalDoc, referralUrl: doc(ids.patient) });
    expect(booking.booking_review_status).toBe("pending");
    for (const reviewer of [ids.reception, ids.admin]) {
      expect((await notificationsFor(reviewer, booking.id)).map((n) => n.type)).toEqual(["booking_review_requested"]);
    }
    expect(await notificationsFor(ids.externalDoc, booking.id)).toEqual([]);
  });

  it("needs no document from the patient when an internal doctor is picked", async () => {
    const booking = await book(ids.patient, { doctorId: ids.internalDoc });
    expect(booking.booking_review_status).toBe("pending");
    expect(booking.referral_url).toBeNull();
    expect((await notificationsFor(ids.internalDoc, booking.id)).map((n) => n.type)).toEqual(["booking_review_requested"]);
  });

  it("still requires a document for an external doctor with no matching referral", async () => {
    await expect(book(ids.patient, { doctorId: ids.externalDoc, bodyPart: "Right Knee" })).rejects.toThrow(
      /attach your referral document/
    );
  });

  it("rejects a document path outside the patient's own referrals folder", async () => {
    await expect(
      book(ids.patient, { doctorId: ids.internalDoc, referralUrl: doc(ids.otherPatient) })
    ).rejects.toThrow(/could not be verified/);
  });
});

describe("approval", () => {
  it("confirms atomically, records who and when, notifies the patient and audits it", async () => {
    const booking = await book(ids.patient, { doctorId: ids.externalDoc, referralUrl: doc(ids.patient) });
    const approved = await review(ids.reception, booking.id, "approve");

    expect(approved.confirmed).toBe(true);
    expect(approved.booking_review_status).toBe("approved");
    expect(approved.booking_reviewed_by).toBe(ids.reception);
    expect(approved.booking_reviewed_at).toBeTruthy();
    expect(approved.status).toBe("scheduled");
    expect(await takenSlots(ids.otherPatient, booking.date)).toContain(booking.time_slot);

    const patientNotes = await notificationsFor(ids.patient, booking.id);
    expect(patientNotes.map((n) => n.type)).toEqual(["appointment_reserved", "appointment_confirmed"]);
    const reviewerNotes = await notificationsFor(ids.admin, booking.id);
    expect(reviewerNotes.every((n) => n.read)).toBe(true);

    const { rows } = await db.query<{ user_id: string }>(
      `select user_id from public.audit_logs where action = 'BOOKING_APPROVED' and entity_id = $1`,
      [booking.id]
    );
    expect(rows).toEqual([{ user_id: ids.reception }]);
  });

  it("cannot be applied twice", async () => {
    const booking = await book(ids.patient, { referralUrl: doc(ids.patient) });
    await review(ids.admin, booking.id, "approve");
    await expect(review(ids.reception, booking.id, "approve")).rejects.toThrow(/no longer waiting/);
    const notes = await notificationsFor(ids.patient, booking.id);
    expect(notes.filter((n) => n.type === "appointment_confirmed")).toHaveLength(1);
  });
});

describe("decline", () => {
  it("requires a reason", async () => {
    const booking = await book(ids.patient, { referralUrl: doc(ids.patient) });
    await expect(review(ids.reception, booking.id, "decline", "  ")).rejects.toThrow(/reason/);
  });

  it("cancels the booking, releases the slot, records and notifies the decision", async () => {
    const date = nextDate();
    const booking = await book(ids.patient, { date, slot: "11:00", referralUrl: doc(ids.patient) });
    const declined = await review(ids.admin, booking.id, "decline", "Referral is for a different body part.");

    expect(declined.status).toBe("cancelled");
    expect(declined.confirmed).toBe(false);
    expect(declined.booking_review_status).toBe("declined");
    expect(declined.booking_review_reason).toBe("Referral is for a different body part.");
    expect(declined.cancellation_reason).toMatch(/Referral not approved/);
    expect(await takenSlots(ids.otherPatient, date)).not.toContain("11:00");

    const rebooked = await book(ids.otherPatient, { date, slot: "11:00", bodyPart: "Right Knee" });
    expect(rebooked.booking_review_status).toBe("not_required");

    const notes = await notificationsFor(ids.patient, booking.id);
    expect(notes.map((n) => n.type)).toContain("appointment_declined");
    const { rows } = await db.query(`select 1 from public.audit_logs where action = 'BOOKING_DECLINED' and entity_id = $1`, [booking.id]);
    expect(rows).toHaveLength(1);
  });
});

describe("external doctor referral matching", () => {
  it("auto-confirms when the patient picks the external doctor and name, DOB and phone match", async () => {
    const ref = await createDoctorReferral({ doctorId: ids.externalDoc, patientEmail: "someone-else@test.dev", bodyPart: "Brain" });
    const booking = await book(ids.patient, { doctorId: ids.externalDoc, bodyPart: "Brain" });

    expect(booking.booking_review_status).toBe("auto_confirmed");
    expect(booking.confirmed).toBe(true);
    expect(booking.referring_doctor_id).toBe(ids.externalDoc);
    expect(booking.referral_url).toMatch(new RegExp(`^referrals/${ids.externalDoc}/`));
    const { rows } = await db.query<{ used_in_appointment_id: string }>(
      `select used_in_appointment_id from public.doctor_referrals where id = $1`,
      [ref.id]
    );
    expect(rows[0].used_in_appointment_id).toBe(booking.id);
    expect((await notificationsFor(ids.patient, booking.id)).map((n) => n.type)).toEqual(["appointment_booked"]);
  });

  it("auto-confirms when the patient types the doctor's name and practice instead", async () => {
    await createDoctorReferral({ doctorId: ids.externalDoc, patientEmail: "pat@test.dev", bodyPart: "Pelvis" });
    const booking = await book(ids.patient, {
      bodyPart: "Pelvis",
      otherDoctor: true,
      doctorName: "dr. external",
      doctorPractice: "OUTSIDE GP",
    });
    expect(booking.booking_review_status).toBe("auto_confirmed");
    expect(booking.referring_doctor_id).toBe(ids.externalDoc);
    expect(booking.referring_doctor_name).toBeNull();
  });

  it("confirms from the linked referral too (Use this referral)", async () => {
    const ref = await createDoctorReferral({ doctorId: ids.externalDoc, patientEmail: "pat@test.dev", bodyPart: "Abdomen" });
    const booking = await book(ids.patient, { referralId: ref.id, bodyPart: "Abdomen" });
    expect(booking.booking_review_status).toBe("auto_confirmed");
    await expect(book(ids.patient, { referralId: ref.id, bodyPart: "Abdomen" })).rejects.toThrow(/already been used/);
  });

  it.each<[string, Partial<ReferralFields>]>([
    ["a different phone number", { phone: "0499 999 999" }],
    ["a different date of birth", { dob: "1991-01-01" }],
    ["a different patient name", { patientName: "Patricia Patient" }],
    ["no phone number on the referral", { phone: null }],
    ["no referral document", { withDocument: false }],
    ["a referral older than 24 hours", { hoursAgo: 25 }],
  ])("does not match on %s: a document is then required and the booking goes to review", async (_label, change) => {
    const ref = await createDoctorReferral({ doctorId: ids.externalDoc, patientEmail: "x@test.dev", bodyPart: "Cervical Spine", ...change });
    await expect(book(ids.patient, { doctorId: ids.externalDoc, bodyPart: "Cervical Spine" })).rejects.toThrow(
      /attach your referral document/
    );
    const booking = await book(ids.patient, { doctorId: ids.externalDoc, bodyPart: "Cervical Spine", referralUrl: doc(ids.patient) });
    expect(booking.booking_review_status).toBe("pending");
    expect(booking.confirmed).toBe(false);
    // Retire this referral so it can't affect the next case.
    await db.query(`update public.doctor_referrals set used_in_appointment_id = $1 where id = $2`, [booking.id, ref.id]);
  });

  it("never auto-confirms on the doctor's name alone, without the practice", async () => {
    await createDoctorReferral({ doctorId: ids.externalDoc, patientEmail: "pat@test.dev", bodyPart: "Lumbar Spine" });
    const booking = await book(ids.patient, {
      bodyPart: "Lumbar Spine",
      otherDoctor: true,
      doctorName: "Dr External",
      referralUrl: doc(ids.patient),
    });
    expect(booking.booking_review_status).toBe("pending");
    expect(booking.referring_doctor_id).toBeNull();
  });

  it("treats two matching referrals as ambiguous", async () => {
    await createDoctorReferral({ doctorId: ids.externalDoc, patientEmail: "a@test.dev", bodyPart: "Shoulder" });
    await createDoctorReferral({ doctorId: ids.externalDoc, patientEmail: "b@test.dev", bodyPart: "Shoulder" });
    const booking = await book(ids.patient, { doctorId: ids.externalDoc, bodyPart: "Shoulder", referralUrl: doc(ids.patient) });
    expect(booking.booking_review_status).toBe("pending");
  });

  it("never auto-confirms an internal doctor's referral — that doctor approves it", async () => {
    const ref = await createDoctorReferral({ doctorId: ids.internalDoc, patientEmail: "pat@test.dev", bodyPart: "Left Knee" });
    const booking = await book(ids.patient, { referralId: ref.id, bodyPart: "Left Knee" });
    expect(booking.booking_review_status).toBe("pending");
    expect((await notificationsFor(ids.internalDoc, booking.id)).map((n) => n.type)).toEqual(["booking_review_requested"]);
  });

  it("refuses another patient's referral without revealing it", async () => {
    const ref = await createDoctorReferral({ doctorId: ids.internalDoc, patientEmail: "other@test.dev", bodyPart: "Brain" });
    await expect(book(ids.patient, { referralId: ref.id, bodyPart: "Brain" })).rejects.toThrow(/Referral not found/);
  });
});

describe("Flow C — other doctor with no details", () => {
  it("requires a referral document", async () => {
    await expect(book(ids.patient, { otherDoctor: true, bodyPart: "Right Knee" })).rejects.toThrow(/attach your referral document/);
  });

  it("goes to manual review once a document is attached", async () => {
    const booking = await book(ids.patient, { otherDoctor: true, bodyPart: "Right Knee", referralUrl: doc(ids.patient) });
    expect(booking.booking_review_status).toBe("pending");
    expect(booking.referring_doctor_id).toBeNull();
    expect(booking.referring_doctor_name).toBeNull();
    expect(booking.confirmed).toBe(false);
  });
});

describe("slot reservation", () => {
  it("lets only one of two simultaneous requests reserve the same slot", async () => {
    const date = nextDate();
    const results = await Promise.allSettled([
      book(ids.patient, { date, slot: "10:00", referralUrl: doc(ids.patient) }),
      book(ids.otherPatient, { date, slot: "10:00", bodyPart: "Left Knee" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(String(rejected.reason)).toMatch(/already booked/);
  });

  it("blocks a direct insert that bypasses book_appointment too", async () => {
    const date = nextDate();
    await book(ids.patient, { date, slot: "13:00", referralUrl: doc(ids.patient) });
    await expect(
      asUser(db, ids.otherPatient, (tx) =>
        tx.query(
          `insert into public.appointments (patient_id, date, time_slot, location, body_part) values ($1, $2, '13:00', 'Berwick', 'Brain')`,
          [ids.otherPatient, date]
        )
      )
    ).rejects.toThrow(/duplicate key|unique/);
  });
});

describe("authorization", () => {
  it.each([
    ["the patient themselves", () => ids.patient],
    ["another patient", () => ids.otherPatient],
    ["a technician", () => ids.technician],
    ["a radiologist", () => ids.radiologist],
    ["an internal doctor who isn't on the booking", () => ids.internalDoc],
    ["the external referring doctor on the booking", () => ids.externalDoc],
  ])("does not let %s approve", async (_label, who) => {
    const booking = await book(ids.patient, { doctorId: ids.externalDoc, referralUrl: doc(ids.patient) });
    await expect(review(who(), booking.id, "approve")).rejects.toThrow(/Only clinic reviewers or the patient's clinic doctor/);
    await expect(review(who(), booking.id, "decline", "no")).rejects.toThrow(/Only clinic reviewers or the patient's clinic doctor/);
  });

  it("hides one patient's pending booking and referral from another patient", async () => {
    const booking = await book(ids.patient, { referralUrl: doc(ids.patient) });
    const rows = await asUser(db, ids.otherPatient, async (tx) => {
      const r = await tx.query(`select id, referral_url from public.appointments where id = $1`, [booking.id]);
      return r.rows;
    });
    expect(rows).toEqual([]);
  });

  it("stops anyone, including reception, confirming by editing the row directly", async () => {
    const booking = await book(ids.patient, { referralUrl: doc(ids.patient) });
    for (const who of [ids.patient, ids.reception]) {
      await expect(
        asUser(db, who, (tx) => tx.query(`update public.appointments set confirmed = true where id = $1`, [booking.id]))
      ).rejects.toThrow(/booking review workflow/);
      await expect(
        asUser(db, who, (tx) =>
          tx.query(`update public.appointments set booking_review_status = 'approved' where id = $1`, [booking.id])
        )
      ).rejects.toThrow(/booking review workflow/);
    }
  });

  it("forces a direct insert to pending instead of confirmed", async () => {
    const date = nextDate();
    const row = await asUser(db, ids.patient, async (tx) => {
      const r = await tx.query<Booking>(
        `insert into public.appointments (patient_id, date, time_slot, location, body_part, confirmed, booking_review_status)
         values ($1, $2, '14:00', 'Berwick', 'Brain', true, 'approved') returning *`,
        [ids.patient, date]
      );
      return r.rows[0];
    });
    expect(row.confirmed).toBe(false);
    expect(row.booking_review_status).toBe("pending");
  });

  it("does not let a technician start a scan until the booking is approved", async () => {
    const booking = await book(ids.patient, { referralUrl: doc(ids.patient) });
    const start = () =>
      asUser(db, ids.technician, (tx) => tx.query(`update public.appointments set status = 'in_progress' where id = $1`, [booking.id]));
    await expect(start()).rejects.toThrow(/waiting for referral approval/);
    await review(ids.reception, booking.id, "approve");
    await expect(start()).resolves.toBeTruthy();
  });
});

describe("existing workflows", () => {
  it("still confirms a self-referred Shoulder/Knee booking immediately", async () => {
    const booking = await book(ids.patient, { bodyPart: "Shoulder" });
    expect(booking.booking_review_status).toBe("not_required");
    expect(booking.confirmed).toBe(true);
    expect((await notificationsFor(ids.patient, booking.id)).map((n) => n.type)).toEqual(["appointment_booked"]);
  });

  it("still requires review for a sign-off body part, and needs a document for it", async () => {
    await expect(book(ids.patient, { bodyPart: "Lumbar Spine" })).rejects.toThrow(/attach your referral document/);
  });

  it("still confirms a staff booking made at reception", async () => {
    const booking = await asUser(db, ids.reception, (tx) => callBook(tx, { patientId: ids.patient, bodyPart: "Brain" }));
    expect(booking.booking_review_status).toBe("not_required");
    expect(booking.confirmed).toBe(true);
  });

  it("does not let a patient book on someone else's behalf", async () => {
    await expect(
      asUser(db, ids.patient, (tx) => callBook(tx, { patientId: ids.otherPatient, bodyPart: "Shoulder" }))
    ).rejects.toThrow(/only book appointments for yourself/);
  });

  it("lets a patient reschedule and cancel a pending booking, which stays unconfirmed", async () => {
    const booking = await book(ids.patient, { referralUrl: doc(ids.patient) });
    const moved = await asUser(db, ids.patient, async (tx) => {
      const r = await tx.query<Booking>(`select * from public.reschedule_appointment($1, $2::date, '15:00', 'Berwick')`, [
        booking.id,
        nextDate(),
      ]);
      return r.rows[0];
    });
    expect(moved.booking_review_status).toBe("pending");
    expect(moved.confirmed).toBe(false);

    await asUser(db, ids.patient, (tx) => tx.query(`update public.appointments set status = 'cancelled' where id = $1`, [booking.id]));
    await expect(review(ids.reception, booking.id, "approve")).rejects.toThrow(/no longer waiting/);
  });

  it("still lets a technician acknowledge the referral on a pending booking", async () => {
    const booking = await book(ids.patient, { referralUrl: doc(ids.patient) });
    await asUser(db, ids.technician, (tx) =>
      tx.query(
        `update public.appointments set referral_reviewed = true, referral_reviewed_by = $2, referral_reviewed_at = now() where id = $1`,
        [booking.id, ids.technician]
      )
    );
    const { rows } = await db.query<{ referral_reviewed: boolean; booking_review_status: string }>(
      `select referral_reviewed, booking_review_status from public.appointments where id = $1`,
      [booking.id]
    );
    expect(rows[0]).toEqual({ referral_reviewed: true, booking_review_status: "pending" });
  });
});
