import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/backend/lib/adminAuth";
import { createAdminClient } from "@/backend/lib/supabase/admin";
import { getStripeClient } from "@/backend/lib/stripe";

interface CheckoutBody {
  billId?: string;
}

// Starts a real, hosted Stripe Checkout Session for a patient paying their
// own bill online ("Pay now" — see app/(app)/dashboard/billing/page.tsx).
// This is additive alongside the existing staff-facing manual "record a
// payment" flow (AdminDashboard.tsx markPaid) — that flow is untouched.
export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  let body: CheckoutBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const billId = body.billId?.trim();
  if (!billId) {
    return NextResponse.json({ error: "billId is required." }, { status: 400 });
  }

  // Fetch the bill using the CALLER'S OWN session client, not the admin
  // client — this is deliberate: billing_patient_read_own RLS (schema.sql)
  // only lets this query return a row when the bill belongs to an
  // appointment owned by the calling patient (or the caller is staff), so a
  // successful fetch *is* the ownership check. No row (or a query error)
  // means either the bill doesn't exist or the caller doesn't own it — we
  // deliberately don't distinguish the two in the response, to avoid leaking
  // which bills exist. Do NOT add a redundant `patient_id === user.id`
  // check on top of this: RLS is the actual security boundary here, and a
  // client-side check that duplicates it would be misleading about where
  // the real enforcement lives.
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

  const stripe = getStripeClient();
  if (!stripe) {
    return NextResponse.json({ error: "Online payment is not available right now." }, { status: 503 });
  }

  // Amount in cents, computed server-side from the DB column — NEVER from
  // anything the client supplied. This is the whole point of a hosted
  // Checkout Session: the browser never gets to say how much it's paying.
  const amountCents = Math.round(Number(bill.amount) * 100);
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return NextResponse.json({ error: "This bill has an invalid amount." }, { status: 400 });
  }

  const appointment = Array.isArray(bill.appointments) ? bill.appointments[0] : bill.appointments;
  const bodyPart = appointment?.body_part ?? "MRI scan";

  const origin = req.nextUrl.origin;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "aud",
            product_data: { name: `MRI scan — ${bodyPart}` },
            unit_amount: amountCents,
          },
          quantity: 1,
        },
      ],
      metadata: { billId },
      success_url: `${origin}/dashboard/billing?payment=success`,
      cancel_url: `${origin}/dashboard/billing?payment=cancelled`,
    });

    // Recording the session id needs the service-role client: billing_admin_write
    // (schema.sql) only grants UPDATE to admins, and there's no narrower RLS
    // policy letting a patient update their own billing row. Using the admin
    // client here is safe specifically because the RLS-scoped select above
    // already proved this caller owns this bill before we got here — the
    // ownership check happened before any privilege escalation, not after.
    const adminClient = createAdminClient();
    const { error: updateError } = await adminClient
      .from("billing")
      .update({ stripe_checkout_session_id: session.id })
      .eq("id", billId);

    if (updateError) {
      console.error("[payments/checkout] failed to record checkout session id on billing row", {
        billId,
        sessionId: session.id,
        error: updateError.message,
      });
      // The session was created and is usable — don't fail the request over
      // a bookkeeping write. The webhook can still cross-check by billId
      // alone if this column never gets set.
    }

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[payments/checkout] Stripe error", { billId, userId: user.id, error: err });
    return NextResponse.json({ error: "Could not start the payment. Please try again." }, { status: 502 });
  }
}
