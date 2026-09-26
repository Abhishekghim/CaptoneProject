import { describe, expect, it } from "vitest";
import { deriveReferralStatus } from "@/shared/deriveReferralStatus";

// Only the fields deriveReferralStatus actually reads (per its own Pick<>
// parameter type) — no need to fabricate a full Appointment.
type Input = Parameters<typeof deriveReferralStatus>[0];

function apt(overrides: Partial<Input>): Input {
  return {
    referral_status_override: null,
    referral_url: null,
    referring_doctor_name: null,
    referring_doctor_id: null,
    referral_reviewed: false,
    ...overrides,
  };
}

describe("deriveReferralStatus", () => {
  it("returns referral_status_override outright when set, regardless of other fields", () => {
    expect(
      deriveReferralStatus(
        apt({
          referral_status_override: "expired",
          referral_reviewed: true,
          referral_url: "https://example.com/referral.pdf",
        })
      )
    ).toBe("expired");
  });

  it("returns 'rejected' override even when nothing else is set", () => {
    expect(deriveReferralStatus(apt({ referral_status_override: "rejected" }))).toBe("rejected");
  });

  it("returns 'verified' when referral_reviewed is true and no override", () => {
    expect(
      deriveReferralStatus(
        apt({ referral_reviewed: true, referring_doctor_name: "Dr. Smith" })
      )
    ).toBe("verified");
  });

  it("returns 'received' when a referral_url is present but not reviewed", () => {
    expect(
      deriveReferralStatus(apt({ referral_url: "https://example.com/referral.pdf" }))
    ).toBe("received");
  });

  it("returns 'received' when referring_doctor_name is present but not reviewed", () => {
    expect(deriveReferralStatus(apt({ referring_doctor_name: "Dr. Jones" }))).toBe("received");
  });

  it("returns 'received' when referring_doctor_id is present but not reviewed", () => {
    expect(deriveReferralStatus(apt({ referring_doctor_id: "doc-1" }))).toBe("received");
  });

  it("returns 'missing' when none of the referral fields are set", () => {
    expect(deriveReferralStatus(apt({}))).toBe("missing");
  });
});
