import type { Appointment, ReferralStatus } from "@/shared/types";

export type { ReferralStatus };

// Reception's referral vocabulary is a display-level derivation over
// existing fields, falling back only when referral_status_override is set
// explicitly — this is what lets the technician's existing "acknowledge
// referral" flow (referral_reviewed) keep working unmodified. Ported
// verbatim from frontend/lib/store.tsx (where it originated as a pure,
// non-hook helper) so it can be imported from client components — and
// anywhere else that needs it — without pulling in the whole mock store
// just for this one pure function.
export function deriveReferralStatus(
  apt: Pick<Appointment, "referral_status_override" | "referral_url" | "referring_doctor_name" | "referring_doctor_id" | "referral_reviewed">
): ReferralStatus {
  if (apt.referral_status_override) return apt.referral_status_override;
  if (apt.referral_reviewed) return "verified";
  if (apt.referral_url || apt.referring_doctor_name || apt.referring_doctor_id) return "received";
  return "missing";
}
