"use client";

import React, { useState } from "react";
import { format, parseISO } from "date-fns";
import { ClipboardCheck, FileClock, Loader2, Receipt } from "lucide-react";
import { useStore } from "@/frontend/lib/store";
import { downloadReceiptPdf, generateReceiptPdf } from "@/frontend/lib/receiptPdf";
import { uploadToBucket } from "@/frontend/lib/storage";
import { createClient } from "@/frontend/lib/supabase/client";
import { notifyPatient } from "@/frontend/lib/notify";
import { EmptyState, SectionTitle, StatusChip } from "@/frontend/components/shared/ui";
import { useAppointments } from "@/frontend/lib/hooks/useAppointments";
import { useProfiles, type ProfileRow } from "@/frontend/lib/hooks/useProfiles";
import { useBilling } from "@/frontend/lib/hooks/useBilling";
import type { Appointment, Billing } from "@/shared/types";

function Loading() {
  return (
    <p className="flex items-center gap-2 text-sm text-slate-500">
      <Loader2 size={14} className="animate-spin" aria-hidden /> Loading…
    </p>
  );
}

// Relocated from AdminDashboard.tsx (was inline lines 236-456) as part of the
// admin route split — logic unchanged. Keeps its 3 sub-headings (Open
// billing, Insurance claims, Paid receipts) together as one cohesive view.
export default function BillingPanel() {
  const { currentUser } = useStore();
  const { data: billing, loadError: billingLoadError, reload: reloadBilling } = useBilling();
  const { data: appointments, loadError: aptLoadError } = useAppointments();
  const { data: profiles, loadError: profilesLoadError } = useProfiles();

  const open = (billing ?? []).filter((b) => b.payment_status !== "paid" && b.payment_status !== "refunded");
  const insuranceClaims = (billing ?? []).filter((b) => b.payment_method === "insurance" && b.insurance_claim_status !== "not_submitted");
  const paid = (billing ?? []).filter((b) => b.payment_status === "paid" && b.receipt_url);

  const [payingId, setPayingId] = useState<string | null>(null);
  const [payErrors, setPayErrors] = useState<Record<string, string>>({});

  async function markPaid(billId: string, method: string) {
    const bill = (billing ?? []).find((x) => x.id === billId);
    if (!bill) return;
    const apt = (appointments ?? []).find((a) => a.id === bill.appointment_id);
    const patient = apt && (profiles ?? []).find((p) => p.id === apt.patient_id);

    setPayingId(billId);
    setPayErrors((e) => ({ ...e, [billId]: "" }));

    const paidAt = new Date().toISOString();
    const lines = [
      "Capital Radiology — Payment Receipt",
      "",
      `Receipt: ${bill.id}`,
      `Patient: ${patient?.full_name ?? "—"}`,
      `Procedure: ${apt?.body_part ?? "—"}`,
      `Amount paid: $${bill.amount.toFixed(2)}`,
      `Payment method: ${method}`,
      `Paid at: ${paidAt}`,
    ];
    const pdfBlob = generateReceiptPdf(lines);
    const file = new File([pdfBlob], `receipt-${billId}.pdf`, { type: "application/pdf" });

    const uploaded = await uploadToBucket("receipts", file, currentUser.id);
    if (!uploaded.ok) {
      setPayingId(null);
      setPayErrors((e) => ({ ...e, [billId]: uploaded.error }));
      return;
    }

    const supabase = createClient();
    const { error } = await supabase
      .from("billing")
      .update({ payment_status: "paid", payment_method: method, paid_at: paidAt, receipt_url: uploaded.path })
      .eq("id", billId);
    setPayingId(null);
    if (error) {
      setPayErrors((e) => ({ ...e, [billId]: error.message }));
      return;
    }
    reloadBilling();

    if (apt) {
      notifyPatient(
        apt.patient_id,
        "payment_received",
        "Payment received",
        "<p>We've received your payment and your receipt is ready.</p>",
        apt.id
      );
    }
  }

  // Staff-initiated Stripe Invoicing (app/api/payments/invoice) — a separate,
  // "send-and-wait" alternative to markPaid above: instead of recording a
  // payment staff already took, this asks Stripe to email the patient a
  // formal invoice they pay on their own time (insurance/corporate accounts,
  // etc). Mirrors markPaid's busy/error per-row state shape exactly, plus one
  // more per-row map for the resulting hosted invoice link once sent.
  const [invoicingId, setInvoicingId] = useState<string | null>(null);
  const [invoiceErrors, setInvoiceErrors] = useState<Record<string, string>>({});
  const [invoiceLinks, setInvoiceLinks] = useState<Record<string, string>>({});

  async function sendInvoice(billId: string) {
    setInvoicingId(billId);
    setInvoiceErrors((e) => ({ ...e, [billId]: "" }));

    try {
      const res = await fetch("/api/payments/invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ billId }),
      });
      const data = await res.json();
      setInvoicingId(null);
      if (!res.ok || !data.hostedInvoiceUrl) {
        setInvoiceErrors((e) => ({ ...e, [billId]: data.error || "Could not create the invoice." }));
        return;
      }
      setInvoiceLinks((l) => ({ ...l, [billId]: data.hostedInvoiceUrl }));
      reloadBilling();
    } catch {
      setInvoicingId(null);
      setInvoiceErrors((e) => ({ ...e, [billId]: "Network error — please try again." }));
    }
  }

  const loadError = billingLoadError || aptLoadError || profilesLoadError;
  const loading = (!billing || !appointments || !profiles) && !loadError;

  return (
    <section className="card space-y-6 p-5 sm:p-6">
      {loadError && (
        <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          Could not load billing: {loadError}
        </p>
      )}
      <div>
        <SectionTitle icon={Receipt} title="Open billing" subtitle="Record payments and issue digital receipts" />
        {loading ? (
          <Loading />
        ) : open.length === 0 ? (
          <EmptyState message="No open bills" hint="New bookings generate a pending bill automatically." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-4">Patient</th>
                  <th className="py-2 pr-4">Procedure</th>
                  <th className="py-2 pr-4">Amount</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2">Record payment</th>
                </tr>
              </thead>
              <tbody>
                {open.map((b) => {
                  const apt = (appointments ?? []).find((a) => a.id === b.appointment_id);
                  const patient = apt && (profiles ?? []).find((p) => p.id === apt.patient_id);
                  return (
                    <tr key={b.id} className="border-b border-slate-100 last:border-0">
                      <td className="py-2.5 pr-4 font-semibold text-navy">{patient?.full_name ?? "—"}</td>
                      <td className="py-2.5 pr-4">{apt ? `${apt.body_part} · ${format(parseISO(apt.date), "d MMM")}` : "—"}</td>
                      <td className="py-2.5 pr-4 font-semibold">${b.amount.toFixed(2)}</td>
                      <td className="py-2.5 pr-4"><StatusChip status={b.payment_status} /></td>
                      <td className="py-2.5">
                        <div className="flex flex-wrap gap-2">
                          <button type="button" disabled={payingId === b.id} className="btn-ghost px-3 py-1 text-xs" onClick={() => markPaid(b.id, "card")}>
                            {payingId === b.id ? "Processing…" : "Card"}
                          </button>
                          <button type="button" disabled={invoicingId === b.id} className="btn-ghost px-3 py-1 text-xs" onClick={() => sendInvoice(b.id)}>
                            {invoicingId === b.id ? "Sending…" : "Send invoice"}
                          </button>
                          {b.insurance_claim_status === "not_submitted" ? (
                            <InsuranceClaimForm billId={b.id} onDone={reloadBilling} />
                          ) : (
                            <span className="chip bg-violet-100 text-violet-800">Claim {b.insurance_claim_status}</span>
                          )}
                        </div>
                        {payErrors[b.id] && (
                          <p role="alert" className="mt-1 text-[11px] font-semibold text-rose-700">{payErrors[b.id]}</p>
                        )}
                        {invoiceErrors[b.id] && (
                          <p role="alert" className="mt-1 text-[11px] font-semibold text-rose-700">{invoiceErrors[b.id]}</p>
                        )}
                        {invoiceLinks[b.id] && (
                          <p className="mt-1 text-[11px] font-semibold text-emerald-700">
                            Invoice sent —{" "}
                            <a href={invoiceLinks[b.id]} target="_blank" rel="noopener noreferrer" className="underline">
                              view it
                            </a>
                          </p>
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

      <div>
        <SectionTitle icon={ClipboardCheck} title="Insurance claims (FR38)" subtitle="Submitted claims awaiting or past approval" />
        {loading ? (
          <Loading />
        ) : insuranceClaims.length === 0 ? (
          <EmptyState message="No insurance claims submitted" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {insuranceClaims.map((b) => {
              const apt = (appointments ?? []).find((a) => a.id === b.appointment_id);
              const patient = apt && (profiles ?? []).find((p) => p.id === apt.patient_id);
              return (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-semibold text-navy">{patient?.full_name ?? "—"} — ${b.amount.toFixed(2)}</p>
                    <p className="text-xs text-slate-500">
                      Claim {b.insurance_claim_number} · submitted {b.insurance_submitted_at ? format(parseISO(b.insurance_submitted_at), "d MMM yyyy") : "—"}
                    </p>
                    {b.insurance_note && <p className="text-xs text-slate-500">Note: {b.insurance_note}</p>}
                  </div>
                  {b.insurance_claim_status === "submitted" ? (
                    <ResolveClaimForm billId={b.id} apt={apt} onDone={reloadBilling} />
                  ) : (
                    <span className={`chip ${b.insurance_claim_status === "approved" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>
                      {b.insurance_claim_status}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div>
        <SectionTitle icon={FileClock} title="Paid receipts" subtitle="Real, downloadable PDF receipts" />
        {loading ? (
          <Loading />
        ) : (
          <PaidReceiptsList paid={paid} appointments={appointments ?? []} profiles={profiles ?? []} />
        )}
      </div>
    </section>
  );
}

function InsuranceClaimForm({ billId, onDone }: { billId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [claimNumber, setClaimNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button type="button" className="btn-ghost px-3 py-1 text-xs" onClick={() => setOpen(true)}>Submit insurance claim</button>
    );
  }
  return (
    <div>
      <form
        className="flex items-center gap-1.5"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!claimNumber.trim()) return;
          setBusy(true);
          setError(null);
          const supabase = createClient();
          const { error: updateError } = await supabase
            .from("billing")
            .update({
              insurance_claim_number: claimNumber.trim(),
              insurance_claim_status: "submitted",
              insurance_submitted_at: new Date().toISOString(),
            })
            .eq("id", billId);
          setBusy(false);
          if (updateError) {
            setError(updateError.message);
            return;
          }
          setOpen(false);
          onDone();
        }}
      >
        <input
          autoFocus value={claimNumber} onChange={(e) => setClaimNumber(e.target.value)}
          placeholder="Claim #" className="input w-28 px-2 py-1 text-xs" disabled={busy}
        />
        <button type="submit" disabled={busy} className="btn-primary px-2 py-1 text-xs">{busy ? "Submitting…" : "Submit"}</button>
      </form>
      {error && <p role="alert" className="mt-1 text-[11px] font-semibold text-rose-700">{error}</p>}
    </div>
  );
}

function ResolveClaimForm({ billId, apt, onDone }: { billId: string; apt: Appointment | undefined; onDone: () => void }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function resolve(approved: boolean) {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("resolve_insurance_claim", {
      p_bill_id: billId,
      p_approved: approved,
      p_note: note || null,
    });
    setBusy(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    onDone();
    if (apt) {
      notifyPatient(
        apt.patient_id,
        "insurance_claim_resolved",
        approved ? "Insurance claim approved" : "Insurance claim rejected",
        approved
          ? "<p>Your insurance claim was approved and your bill is now settled.</p>"
          : `<p>Your insurance claim was rejected.${note ? ` Reason: ${note}` : ""}</p>`,
        apt.id
      );
    }
  }

  return (
    <div>
      <div className="flex items-center gap-1.5">
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className="input w-32 px-2 py-1 text-xs" disabled={busy} />
        <button type="button" disabled={busy} className="btn-ghost px-2 py-1 text-xs" onClick={() => resolve(true)}>Approve</button>
        <button type="button" disabled={busy} className="px-2 py-1 text-xs font-semibold text-rose-600 hover:text-rose-700" onClick={() => resolve(false)}>Reject</button>
      </div>
      {error && <p role="alert" className="mt-1 text-[11px] font-semibold text-rose-700">{error}</p>}
    </div>
  );
}

function PaidReceiptsList({
  paid, appointments, profiles,
}: {
  paid: Billing[];
  appointments: Appointment[];
  profiles: ProfileRow[];
}) {
  if (paid.length === 0) return <EmptyState message="No paid receipts yet" />;

  return (
    <ul className="divide-y divide-slate-100">
      {paid.map((b) => {
        const apt = appointments.find((a) => a.id === b.appointment_id);
        const patient = apt && profiles.find((p) => p.id === apt.patient_id);
        return (
          <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
            <span>{patient?.full_name ?? "—"} · ${b.amount.toFixed(2)} · {b.paid_at ? format(parseISO(b.paid_at), "d MMM yyyy") : "—"}</span>
            <button
              type="button"
              className="btn-ghost px-3 py-1 text-xs"
              onClick={() =>
                downloadReceiptPdf(`receipt-${b.id}.pdf`, [
                  "Capital Radiology — Payment Receipt",
                  "",
                  `Receipt: ${b.id}`,
                  `Patient: ${patient?.full_name ?? "—"}`,
                  `Procedure: ${apt?.body_part ?? "—"}`,
                  `Amount paid: $${b.amount.toFixed(2)}`,
                  `Payment method: ${b.payment_method ?? "—"}`,
                  `Paid at: ${b.paid_at ?? "—"}`,
                ])
              }
            >
              <Receipt size={13} aria-hidden /> Download PDF
            </button>
          </li>
        );
      })}
    </ul>
  );
}
