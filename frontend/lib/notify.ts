"use client";

/**
 * Best-effort, fire-and-forget notification trigger — thin wrapper around
 * app/api/notifications/send/route.ts (which itself never throws and always
 * responds 200). Called right after a client-side write (booking, cancel,
 * reschedule, payment, insurance resolution) already succeeded, to notify
 * whichever user the action concerns — often, but not always, the caller
 * (e.g. reception/admin acting on a patient's behalf still notifies the
 * patient, not the staff member). Deliberately no retry/queueing logic:
 * callers should never await this or fail their main action if it errors.
 */
export type NotifyEventType =
  | "appointment_booked"
  | "appointment_reserved"
  | "appointment_confirmed"
  | "appointment_declined"
  | "appointment_cancelled"
  | "appointment_rescheduled"
  | "payment_received"
  | "insurance_claim_resolved"
  | "report_ready";

export const NOTIFICATIONS_REFRESH_EVENT = "notifications:refresh";

export function notifyPatient(
  userId: string,
  type: NotifyEventType,
  subject: string,
  emailHtml: string,
  appointmentId: string
): void {
  // The in-app notification for this action was already written by the
  // database; tell the bell to re-read it.
  window.dispatchEvent(new Event(NOTIFICATIONS_REFRESH_EVENT));
  fetch("/api/notifications/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, type, subject, emailHtml, appointmentId }),
  }).catch(() => {});
}
