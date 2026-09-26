import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { createAdminClient } from "@/backend/lib/supabase/admin";
import { getStripeClient } from "@/backend/lib/stripe";
import { generateReceiptPdf } from "@/frontend/lib/receiptPdf";

type AdminClient = ReturnType<typeof createAdminClient>;

// Shared "mark this bill paid + issue a receipt" logic, used by BOTH Stripe
// payment paths that land on this webhook:
//   - checkout.session.completed — the patient's own online card payment
//     (app/api/payments/checkout, the self-service "Pay now" flow)
//   - invoice.paid — a staff-initiated, formally invoiced payment
//     (app/api/payments/invoice, the "send-and-wait" billing flow)
// Both do exactly the same thing once Stripe confirms money has moved: look
// up the bill, short-circuit if it's already paid (idempotency — Stripe WILL
// redeliver events), generate + upload a receipt PDF, and update the billing
// row. Only the payment_method label and the path-specific Stripe id
// column(s) differ, so those are the only things callers parameterize.
async function settleBillAsPaid(
  adminClient: AdminClient,
  params: {
    billId: string;
    eventId: string; // Checkout Session id or Invoice id — for logging only
    paymentMethod: "card" | "invoice";
    paymentMethodLine: string; // human-readable line for the receipt PDF
    extraColumns: Record<string, string | null>; // path-specific stripe_* columns to set alongside payment_status
  }
): Promise<NextResponse> {
  const { billId, eventId, paymentMethod, paymentMethodLine, extraColumns } = params;

  const { data: bill, error: billError } = await adminClient
    .from("billing")
    .select("id, amount, payment_status, appointment_id")
    .eq("id", billId)
    .maybeSingle();

  if (billError) {
    // A DB read failure is exactly the kind of transient problem a Stripe
    // retry might resolve — 500 so it retries.
    console.error("[webhooks/stripe] failed to look up billing row", { billId, eventId, error: billError.message });
    return NextResponse.json({ error: "Lookup failed." }, { status: 500 });
  }

  if (!bill) {
    console.error("[webhooks/stripe] event for a billId with no matching billing row", { billId, eventId });
    // Nothing we can do with this event — not a transient failure, so 200
    // to stop Stripe retrying it forever.
    return NextResponse.json({ received: true });
  }

  // Idempotency: Stripe WILL call this webhook more than once for the same
  // event (retries, redelivery). If this bill is already paid, there is
  // nothing left to do — short-circuit before any receipt/upload work, so a
  // duplicate delivery never issues a second receipt or double-charges any
  // downstream side effect. This must happen before any receipt/upload work
  // for BOTH payment paths.
  if (bill.payment_status === "paid") {
    return NextResponse.json({ received: true });
  }

  const { data: appointment } = await adminClient
    .from("appointments")
    .select("body_part, patient_id")
    .eq("id", bill.appointment_id)
    .maybeSingle();

  const { data: patientProfile } = appointment
    ? await adminClient.from("profiles").select("full_name").eq("id", appointment.patient_id).maybeSingle()
    : { data: null };

  const paidAt = new Date().toISOString();

  // Same receipt content/format as AdminDashboard.tsx's markPaid, with the
  // payment-method line substituted per online path.
  const lines = [
    "Capital Radiology — Payment Receipt",
    "",
    `Receipt: ${bill.id}`,
    `Patient: ${patientProfile?.full_name ?? "—"}`,
    `Procedure: ${appointment?.body_part ?? "—"}`,
    `Amount paid: $${Number(bill.amount).toFixed(2)}`,
    `Payment method: ${paymentMethodLine}`,
    `Paid at: ${paidAt}`,
  ];

  let receiptPath: string | null = null;

  if (appointment) {
    try {
      const pdfBlob = generateReceiptPdf(lines);
      const pdfBuffer = Buffer.from(await pdfBlob.arrayBuffer());
      // Same `${ownerId}/${timestamp}-${filename}` shape as
      // frontend/lib/storage.ts's uploadToBucket, using the patient as the
      // owner folder segment.
      const path = `${appointment.patient_id}/${Date.now()}-receipt-${bill.id}.pdf`;

      const { error: uploadError } = await adminClient.storage.from("receipts").upload(path, pdfBuffer, {
        contentType: "application/pdf",
        upsert: false,
      });

      if (uploadError) {
        // Log loudly — the payment DID succeed and must still be recorded as
        // paid below, but a missing receipt needs a human to notice and
        // follow up (e.g. regenerate it manually). Don't let this turn into
        // Stripe endlessly retrying an event whose payment already landed.
        console.error("[webhooks/stripe] FOLLOW-UP NEEDED: receipt upload failed for a successful payment", {
          billId,
          eventId,
          error: uploadError.message,
        });
      } else {
        receiptPath = `receipts/${path}`;
      }
    } catch (err) {
      console.error("[webhooks/stripe] FOLLOW-UP NEEDED: receipt generation failed for a successful payment", {
        billId,
        eventId,
        error: err instanceof Error ? err.message : err,
      });
    }
  } else {
    console.error("[webhooks/stripe] FOLLOW-UP NEEDED: no appointment found for bill, could not build a receipt", {
      billId,
      appointmentId: bill.appointment_id,
    });
  }

  const { error: updateError } = await adminClient
    .from("billing")
    .update({
      payment_status: "paid",
      payment_method: paymentMethod,
      paid_at: paidAt,
      receipt_url: receiptPath,
      ...extraColumns,
    })
    .eq("id", billId);

  if (updateError) {
    // The payment succeeded but we failed to record it — this IS worth a
    // retry (transient DB error), so 500.
    console.error("[webhooks/stripe] FOLLOW-UP NEEDED: failed to mark billing row paid after a successful payment", {
      billId,
      eventId,
      error: updateError.message,
    });
    return NextResponse.json({ error: "Failed to record payment." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

// Stripe calls this route server-to-server with no session cookie —
// authenticity comes entirely from verifying the webhook signature (step 2
// below), which is a stronger guarantee than a login session anyway. Do NOT
// add requireUser()/requireStaff() here; there is no user to require.
//
// Handles TWO event types, both registered against this same endpoint:
//   - checkout.session.completed — the online counterpart to
//     AdminDashboard.tsx's markPaid for the patient self-service "Pay now"
//     flow (app/api/payments/checkout).
//   - invoice.paid — the online counterpart to markPaid for the
//     staff-initiated "send a formal invoice" flow (app/api/payments/invoice).
// Both branches do the same two things markPaid does — issue a receipt PDF
// into the `receipts` bucket, and mark the billing row paid — via the shared
// settleBillAsPaid() helper above, just from a webhook instead of a button
// click.
export async function POST(req: NextRequest) {
  // Raw bytes are required for signature verification — must read as text
  // BEFORE any JSON parsing, and before touching anything else about the
  // request. Nothing in this handler is trusted until the signature check
  // below passes.
  const rawBody = await req.text();
  const signature = req.headers.get("stripe-signature");

  const stripe = getStripeClient();
  if (!stripe) {
    // Shouldn't normally happen — if Stripe isn't configured at all, no
    // webhook endpoint should have been registered with them in the first
    // place — but handle it rather than throwing.
    console.warn("[webhooks/stripe] received a webhook call but Stripe is not configured.");
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.warn("[webhooks/stripe] STRIPE_WEBHOOK_SECRET is not set — rejecting webhook call.");
    return NextResponse.json({ error: "Not configured." }, { status: 400 });
  }

  // Signature verification is the ENTIRE security boundary for this
  // endpoint. Nothing above this line reads `rawBody`'s content as data,
  // and nothing below this line runs unless this succeeds. This section is
  // unchanged regardless of which event type follows it.
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature ?? "", webhookSecret);
  } catch (err) {
    console.warn("[webhooks/stripe] signature verification failed", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  const adminClient = createAdminClient();

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const billId = session.metadata?.billId;

    if (!billId) {
      console.error("[webhooks/stripe] checkout.session.completed with no billId in metadata", { sessionId: session.id });
      // Nothing we can do with this event — not a transient failure, so 200
      // to stop Stripe retrying it forever.
      return NextResponse.json({ received: true });
    }

    // A completed Checkout Session isn't necessarily a successful payment for
    // every payment method Stripe supports (e.g. delayed bank debits) — for
    // card payments session.payment_status is normally "paid" by the time
    // this event fires, but check explicitly rather than assuming.
    if (session.payment_status !== "paid") {
      return NextResponse.json({ received: true });
    }

    const paymentIntentId =
      typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;

    return settleBillAsPaid(adminClient, {
      billId,
      eventId: session.id,
      paymentMethod: "card",
      paymentMethodLine: "Paid online via card",
      extraColumns: {
        stripe_checkout_session_id: session.id,
        stripe_payment_intent_id: paymentIntentId,
      },
    });
  }

  if (event.type === "invoice.paid") {
    const invoice = event.data.object as Stripe.Invoice;

    // Same defensive check as the checkout branch: don't assume, verify.
    if (invoice.status !== "paid") {
      return NextResponse.json({ received: true });
    }

    let billId = invoice.metadata?.billId ?? null;

    if (!billId) {
      // Mirrors the checkout branch's missing-billId handling (log + 200,
      // not an error) — except here we get one extra chance first: fall back
      // to looking the billing row up by the invoice id we recorded when the
      // invoice was created (app/api/payments/invoice), in case metadata is
      // somehow missing on the event payload.
      const { data: billByInvoice } = await adminClient
        .from("billing")
        .select("id")
        .eq("stripe_invoice_id", invoice.id)
        .maybeSingle();
      billId = billByInvoice?.id ?? null;
    }

    if (!billId) {
      console.error("[webhooks/stripe] invoice.paid with no billId in metadata and no matching stripe_invoice_id", {
        invoiceId: invoice.id,
      });
      return NextResponse.json({ received: true });
    }

    // Note: unlike Checkout Sessions, an Invoice in this API version
    // (2026-08-26.dahlia — see node_modules/stripe/cjs/resources/Invoices.d.ts)
    // has no top-level `payment_intent` field — payment attribution moved to
    // the `payments`/InvoicePayment collection instead. There's nothing
    // simple to attach to stripe_payment_intent_id here, so it's left null
    // for invoice-paid updates; stripe_invoice_id is the durable reference
    // for this path instead.
    return settleBillAsPaid(adminClient, {
      billId,
      eventId: invoice.id,
      paymentMethod: "invoice",
      paymentMethodLine: "Paid via emailed invoice",
      extraColumns: {
        stripe_invoice_id: invoice.id,
        stripe_payment_intent_id: null,
      },
    });
  }

  // Ignore/no-op every other event type — return 200 so Stripe doesn't keep
  // retrying events this app has no handler for.
  return NextResponse.json({ received: true });
}
