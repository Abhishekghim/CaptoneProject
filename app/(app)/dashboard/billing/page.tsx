"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { format, parseISO } from "date-fns";
import { CreditCard, FileText, Receipt } from "lucide-react";
import { useStore } from "@/frontend/lib/store";
import { downloadReceiptPdf } from "@/frontend/lib/receiptPdf";
import AnnouncementsBanner from "@/frontend/components/patient/AnnouncementsBanner";
import { EmptyState, SectionTitle, StatusChip } from "@/frontend/components/shared/ui";
import { useAppointments } from "@/frontend/lib/hooks/useAppointments";
import { useBilling } from "@/frontend/lib/hooks/useBilling";
import BillingPanel from "@/frontend/components/admin/BillingPanel";

// useSearchParams() (for the post-Stripe-Checkout ?payment=success|cancelled
// redirect below) requires a Suspense boundary in the app router — mirrors
// app/login/page.tsx's LoginPage/LoginForm split.
//
// Shared route: /dashboard/billing is patient's billing history + Stripe Pay
// Now AND admin/super_admin's billing-ops panel — branches on effectiveRole
// the same way /dashboard/appointments does. Patient's branch (incl. this
// Suspense wrapper and the Stripe-return handling below) is unchanged.
export default function BillingPage() {
  return (
    <Suspense>
      <BillingPageInner />
    </Suspense>
  );
}

function BillingPageInner() {
  const { effectiveRole, currentUser } = useStore();
  const router = useRouter();

  useEffect(() => {
    if (effectiveRole !== "patient" && effectiveRole !== "admin" && effectiveRole !== "super_admin") {
      router.replace("/dashboard");
    }
  }, [effectiveRole, router]);

  // appts_patient_read_own RLS scopes this the same way as
  // billing_patient_read_own below — see the note on useAppointments() in
  // frontend/lib/hooks/useAppointments.ts.
  const { data: appointmentsData, loadError: aptLoadError } = useAppointments();
  const myAppointments = (appointmentsData ?? []).filter((a) => a.patient_id === currentUser.id);

  // billing_patient_read_own RLS scopes this to the caller's own
  // appointments' bills (or staff) — same reasoning as myAppointments above.
  const { data: billingData, loadError: billingLoadError, reload: reloadBilling } = useBilling();
  const myBills = (billingData ?? []).filter((b) => myAppointments.some((a) => a.id === b.appointment_id));

  // Stripe Checkout redirects back to /dashboard/billing?payment=success|cancelled
  // (see app/api/payments/checkout/route.ts's success_url/cancel_url). A
  // successful payment is confirmed server-side by app/api/webhooks/stripe,
  // not by this redirect — this is just "the patient is back, go refresh
  // what they see" so the just-paid bill's status/receipt shows up without
  // a manual page reload. Runs once on mount; no polling.
  const searchParams = useSearchParams();
  const [paymentBanner, setPaymentBanner] = useState<"success" | null>(null);
  const paymentParamHandled = useRef(false);
  useEffect(() => {
    if (paymentParamHandled.current) return;
    paymentParamHandled.current = true;
    const payment = searchParams.get("payment");
    if (payment === "success") {
      setPaymentBanner("success");
      reloadBilling();
    }
    // "cancelled" (the patient backed out of Stripe's page) needs no
    // handling — just let the page load normally.
  }, [searchParams, reloadBilling]);

  const [payingBillId, setPayingBillId] = useState<string | null>(null);
  const [payNowErrors, setPayNowErrors] = useState<Record<string, string>>({});

  async function payNow(billId: string) {
    setPayingBillId(billId);
    setPayNowErrors((e) => ({ ...e, [billId]: "" }));
    try {
      const res = await fetch("/api/payments/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ billId }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setPayingBillId(null);
        setPayNowErrors((e) => ({ ...e, [billId]: data.error || "Could not start the payment." }));
        return;
      }
      // Full navigation, not client-side routing — Stripe's Checkout page is off-site.
      window.location.href = data.url;
    } catch {
      setPayingBillId(null);
      setPayNowErrors((e) => ({ ...e, [billId]: "Network error — please try again." }));
    }
  }

  if (effectiveRole === "admin" || effectiveRole === "super_admin") {
    return (
      <div className="mx-auto max-w-7xl">
        <BillingPanel />
      </div>
    );
  }

  if (effectiveRole !== "patient") return null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <AnnouncementsBanner />

      <div className="card p-5 sm:p-6">
        <SectionTitle icon={Receipt} title="Billing history" subtitle="Digital receipts issue automatically on payment" />
        {paymentBanner === "success" && (
          <p role="status" className="mb-3 rounded-md bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
            Payment received — thank you!
          </p>
        )}
        {(aptLoadError || billingLoadError) && (
          <p role="alert" className="mb-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
            Could not load billing: {aptLoadError || billingLoadError}
          </p>
        )}
        {myBills.length === 0 ? (
          <EmptyState message="No bills yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-4">Appointment</th>
                  <th className="py-2 pr-4">Amount</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Receipt</th>
                  <th className="py-2">Pay</th>
                </tr>
              </thead>
              <tbody>
                {myBills.map((b) => {
                  const apt = myAppointments.find((a) => a.id === b.appointment_id);
                  // Never offer online payment for a bill that's already
                  // paid or refunded. Also held back while a bill is under
                  // active insurance review, to avoid a patient paying out
                  // of pocket for something the claim may already cover —
                  // "pending" (never submitted/no insurance) and "failed"
                  // (a prior charge attempt that didn't go through) are
                  // the cases where "Pay now" is unambiguously useful.
                  const canPayOnline = b.payment_status === "pending" || b.payment_status === "failed";
                  return (
                    <tr key={b.id} className="border-b border-slate-100 last:border-0">
                      <td className="py-2.5 pr-4">
                        {apt ? `${apt.body_part} · ${format(parseISO(apt.date), "d MMM")}` : b.appointment_id}
                      </td>
                      <td className="py-2.5 pr-4 font-semibold">${b.amount.toFixed(2)}</td>
                      <td className="py-2.5 pr-4"><StatusChip status={b.payment_status} /></td>
                      <td className="py-2.5 pr-4">
                        {b.receipt_url ? (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 font-semibold text-medical hover:underline"
                            onClick={() =>
                              downloadReceiptPdf(`receipt-${b.id}.pdf`, [
                                "Capital Radiology — Payment Receipt",
                                "",
                                `Receipt: ${b.id}`,
                                `Patient: ${currentUser.full_name}`,
                                `Procedure: ${apt?.body_part ?? "—"}`,
                                `Amount paid: $${b.amount.toFixed(2)}`,
                                `Payment method: ${b.payment_method ?? "—"}`,
                                `Paid at: ${b.paid_at ?? "—"}`,
                              ])
                            }
                          >
                            <FileText size={14} aria-hidden /> Download PDF
                          </button>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-2.5">
                        {canPayOnline ? (
                          <div className="space-y-1">
                            <button
                              type="button"
                              disabled={payingBillId === b.id}
                              className="btn-primary inline-flex items-center gap-1 px-3 py-1 text-xs disabled:opacity-60"
                              onClick={() => payNow(b.id)}
                            >
                              <CreditCard size={14} aria-hidden />
                              {payingBillId === b.id ? "Redirecting…" : "Pay now"}
                            </button>
                            {payNowErrors[b.id] && (
                              <p role="alert" className="text-xs text-rose-600">
                                {payNowErrors[b.id]}
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
