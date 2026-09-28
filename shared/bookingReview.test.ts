import { describe, expect, it } from "vitest";
import { bookingResultMessage, bookingReviewLabel, referralDocumentRule, PENDING_BOOKING_MESSAGE } from "@/shared/bookingReview";

describe("referralDocumentRule", () => {
  const base = { doctorDetailsGiven: false, usingSystemReferral: false };

  it("is optional for a self-referred Shoulder or Knee scan", () => {
    expect(referralDocumentRule({ ...base, bodyPart: "Shoulder", doctorChoice: "none" })).toBe("optional");
  });

  it("is required for a self-referred sign-off body part", () => {
    expect(referralDocumentRule({ ...base, bodyPart: "Brain", doctorChoice: "none" })).toBe("required");
  });

  it("is required for 'other doctor' with no details", () => {
    expect(referralDocumentRule({ ...base, bodyPart: "Right Knee", doctorChoice: "other" })).toBe("required");
  });

  it("is optional when a registered doctor is picked", () => {
    expect(referralDocumentRule({ ...base, bodyPart: "Brain", doctorChoice: "registered" })).toBe("optional");
  });

  it("leaves it to the doctor's referral match when another doctor is named", () => {
    expect(referralDocumentRule({ ...base, bodyPart: "Brain", doctorChoice: "other", doctorDetailsGiven: true })).toBe(
      "unless_doctor_sent"
    );
  });

  it("is optional when a linked system referral is used", () => {
    expect(referralDocumentRule({ ...base, bodyPart: "Brain", doctorChoice: "registered", usingSystemReferral: true })).toBe(
      "optional"
    );
  });
});

describe("bookingResultMessage", () => {
  const summary = "Brain MRI at Berwick on 3 Oct 09:00";

  it("tells the patient a pending booking is reserved but not confirmed", () => {
    const text = bookingResultMessage({ status: "pending", summary, doctorChoice: "registered" });
    expect(text).toContain(PENDING_BOOKING_MESSAGE);
    expect(text).not.toMatch(/is confirmed/);
  });

  it("adds the manual-review follow-up for an unregistered doctor", () => {
    expect(bookingResultMessage({ status: "pending", summary, doctorChoice: "other" })).toMatch(/reviewed manually.*clinic will follow up/);
  });

  it("confirms immediately for a matched referral or a booking that needs no review", () => {
    expect(bookingResultMessage({ status: "auto_confirmed", summary, doctorChoice: "registered" })).toMatch(/is confirmed/);
    expect(bookingResultMessage({ status: "not_required", summary, doctorChoice: "none" })).toMatch(/is confirmed/);
  });
});

describe("bookingReviewLabel", () => {
  const base = { booking_review_reason: null, status: "scheduled" as const, confirmed: false };

  it("labels pending bookings as reserved, not confirmed", () => {
    expect(bookingReviewLabel({ ...base, booking_review_status: "pending" })).toEqual({
      text: "Time reserved — awaiting referral check (not confirmed yet)",
      tone: "pending",
    });
  });

  it("shows the decline reason", () => {
    expect(
      bookingReviewLabel({ ...base, status: "cancelled", booking_review_status: "declined", booking_review_reason: "Wrong body part" })
    ).toEqual({ text: "Not approved: Wrong body part", tone: "declined" });
  });

  it("shows a confirmed label after approval, and nothing for bookings that never needed review", () => {
    expect(bookingReviewLabel({ ...base, confirmed: true, booking_review_status: "approved" })?.tone).toBe("confirmed");
    expect(bookingReviewLabel({ ...base, confirmed: true, booking_review_status: "not_required" })).toBeNull();
  });
});
