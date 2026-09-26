import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/backend/lib/adminAuth";
import { createAdminClient } from "@/backend/lib/supabase/admin";
import { getStripeClient } from "@/backend/lib/stripe";

interface InvoiceBody {
  billId?: string;
}

// Starts a real, staff-initiated Stripe Invoice for a bill — "send-and-wait"
// billing (insurance/corporate accounts, or any bill staff want to formally
// invoice rather than wait for the patient to self-pay). This is additive
// alongside the existing patient-facing "Pay now" Stripe Checkout flow
// (app/api/payments/checkout/route.ts) and the manual "record a payment"
// flow (AdminDashboard.tsx markPaid) — neither is touched. Gated by
// requireAdmin(): generating a formal invoice is a billing-admin action in
// this app's existing model (billing_admin_write, schema.sql, is admin-only
// for UPDATE/ALL on `billing`), not a general staff action, so requireStaff()
// would be too broad here.
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { supabase, admin } = auth;

  let body: InvoiceBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const billId = body.billId?.trim();
  if (!billId) {
    return NextResponse.json({ error: "billId is required." }, { status: 400 });
  }

  // This route is already admin-gated, so there's no RLS-as-ownership-check
  // subtlety the way there is in the patient-facing checkout route — the
  // caller's own scoped client is fine here, it's just simpler than reaching
  // for the admin client on every read.
  const { data: bill, error: billError } = await supabase
    .from("billing")
    .select("id, amount, payment_status, appointment_id, appointments(body_part, patient_id)")
    .eq("id", billId)
    .single();

  if (billError || !bill) {
    return NextResponse.json({ error: "Bill not found." }, { status: 404 });
  }

  if (bill.payment_status === "paid") {
    return NextResponse.json({ error: "This bill has already been paid." }, { status: 400 });
  }

  const appointment = Array.isArray(bill.appointments) ? bill.appointments[0] : bill.appointments;
  if (!appointment) {
    return NextResponse.json({ error: "This bill has no associated appointment." }, { status: 400 });
  }

  const { data: patient, error: patientError } = await supabase
    .from("profiles")
    .select("id, email, full_name, stripe_customer_id")
    .eq("id", appointment.patient_id)
    .single();

  if (patientError || !patient) {
    return NextResponse.json({ error: "Patient not found." }, { status: 404 });
  }

  const stripe = getStripeClient();
  if (!stripe) {
    return NextResponse.json({ error: "Online payment is not available right now." }, { status: 503 });
  }

  // Amount in cents, computed server-side from the DB column — NEVER from
  // anything the client supplied.
  const amountCents = Math.round(Number(bill.amount) * 100);
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return NextResponse.json({ error: "This bill has an invalid amount." }, { status: 400 });
  }

  const bodyPart = appointment.body_part ?? "MRI scan";
  const adminClient = createAdminClient();

  try {
    // Find-or-create the Stripe Customer. Reuse it if this patient has
    // already been invoiced before; otherwise create one and persist its id.
    let customerId = patient.stripe_customer_id ?? null;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: patient.email,
        name: patient.full_name,
        metadata: { patientId: patient.id },
      });
      customerId = customer.id;

      // The write needs the service-role client: an admin staff member is
      // updating the PATIENT's row here, not their own, so
      // profiles_update_own's `with check (id = auth.uid())` doesn't apply —
      // same reasoning already established for stripe_checkout_session_id in
      // the Checkout route. This is a legitimately privileged write, not an
      // RLS edge case to debug around.
      const { error: profileUpdateError } = await adminClient
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .eq("id", patient.id);

      if (profileUpdateError) {
        console.error("[payments/invoice] failed to record stripe_customer_id on profile", {
          patientId: patient.id,
          customerId,
          error: profileUpdateError.message,
        });
        // Non-fatal — the customer exists in Stripe and is usable for this
        // invoice; a future invoice will just create another Customer if
        // this bookkeeping write never lands. Don't fail the request over it.
      }
    }

    const draftInvoice = await stripe.invoices.create({
      customer: customerId,
      collection_method: "send_invoice",
      days_until_due: 14,
      auto_advance: false,
      metadata: { billId },
    });

    await stripe.invoiceItems.create({
      customer: customerId,
      invoice: draftInvoice.id,
      amount: amountCents,
      currency: "aud",
      description: `MRI scan — ${bodyPart}`,
    });

    const finalized = await stripe.invoices.finalizeInvoice(draftInvoice.id);
    await stripe.invoices.sendInvoice(draftInvoice.id);

    const { error: billingUpdateError } = await adminClient
      .from("billing")
      .update({ stripe_invoice_id: finalized.id })
      .eq("id", billId);

    if (billingUpdateError) {
      console.error("[payments/invoice] failed to record stripe_invoice_id on billing row", {
        billId,
        invoiceId: finalized.id,
        error: billingUpdateError.message,
      });
      // The invoice was created, finalized, and sent, and is usable — don't
      // fail the request over a bookkeeping write. The webhook's invoice.paid
      // branch still has metadata.billId to fall back on, this column is
      // secondary lookup only.
    }

    return NextResponse.json({ hostedInvoiceUrl: finalized.hosted_invoice_url, invoicePdf: finalized.invoice_pdf });
  } catch (err) {
    console.error("[payments/invoice] Stripe error", { billId, adminId: admin.id, error: err });
    return NextResponse.json({ error: "Could not create the invoice. Please try again." }, { status: 502 });
  }
}
