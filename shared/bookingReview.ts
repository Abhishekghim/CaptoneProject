import type { Appointment, BookingReviewStatus } from "@/shared/types";

// Must match public.body_part_requires_review (033_booking_review_gate.sql).
export const REVIEW_BODY_PARTS = ["Brain", "Cervical Spine", "Lumbar Spine", "Abdomen", "Pelvis"];

export type DoctorChoice = "none" | "registered" | "other";

/**
 * "required": the form must have a document before submitting.
 * "unless_doctor_sent": the database may find the doctor's own referral
 *   (037_booking_referral_approval.sql) and will ask for one if it doesn't.
 * "optional": self-referred scan that needs no sign-off.
 */
export type DocumentRule = "required" | "unless_doctor_sent" | "optional";

export function referralDocumentRule(opts: {
  bodyPart: string;
  doctorChoice: DoctorChoice;
  doctorDetailsGiven: boolean;
  usingSystemReferral: boolean;
}): DocumentRule {
  // A registered internal doctor approves the booking directly; an external
  // one is matched to their own referral, and the server asks for a document
  // only if that match fails.
  if (opts.usingSystemReferral || opts.doctorChoice === "registered") return "optional";
  if (opts.doctorChoice === "other") return opts.doctorDetailsGiven ? "unless_doctor_sent" : "required";
  return REVIEW_BODY_PARTS.includes(opts.bodyPart) ? "required" : "optional";
}

export const PENDING_BOOKING_MESSAGE =
  "Your appointment time is reserved while we check your referral. It is not confirmed yet — we'll notify you once it has been reviewed.";

export function bookingResultMessage(opts: {
  status: BookingReviewStatus;
  summary: string;
  doctorChoice: DoctorChoice;
}): string {
  if (opts.status === "pending") {
    const manual =
      opts.doctorChoice === "other"
        ? " Your referral will be reviewed manually by our team and the clinic will follow up if anything else is needed."
        : "";
    return `${opts.summary}: ${PENDING_BOOKING_MESSAGE}${manual}`;
  }
  if (opts.status === "auto_confirmed") {
    return `${opts.summary} is confirmed — your doctor's referral is already on file.`;
  }
  return `${opts.summary} is confirmed.`;
}

export type BookingReviewLabel = { text: string; tone: "pending" | "declined" | "confirmed" };

/** Label for a booking's review state, or null when there is nothing to show. */
export function bookingReviewLabel(
  a: Pick<Appointment, "booking_review_status" | "booking_review_reason" | "status" | "confirmed">
): BookingReviewLabel | null {
  if (a.booking_review_status === "declined") {
    return {
      text: a.booking_review_reason ? `Not approved: ${a.booking_review_reason}` : "Not approved",
      tone: "declined",
    };
  }
  if (a.status !== "scheduled") return null;
  if (a.booking_review_status === "pending" || !a.confirmed) {
    return { text: "Time reserved — awaiting referral check (not confirmed yet)", tone: "pending" };
  }
  if (a.booking_review_status === "approved" || a.booking_review_status === "auto_confirmed") {
    return { text: "Referral checked — confirmed", tone: "confirmed" };
  }
  return null;
}
