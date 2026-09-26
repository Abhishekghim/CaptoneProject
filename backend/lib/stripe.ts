import "server-only";
import Stripe from "stripe";

// Lazily imports/instantiates the Stripe client only when STRIPE_SECRET_KEY
// is actually set, mirroring backend/lib/notifications/email.ts and sms.ts —
// this module is safe to import even in environments (local dev, CI) where
// no payment provider is configured; it just returns null instead of
// throwing. Callers (app/api/payments/checkout, app/api/webhooks/stripe)
// check for null and return a clean "not configured" error, never a crash.
let client: Stripe | null | undefined; // undefined = not yet checked, null = checked and not configured

// Pinned to the exact API version the installed `stripe` SDK's TypeScript
// types were generated against (node_modules/stripe/cjs/apiVersion.d.ts) —
// pinning (rather than leaving it unset, which would silently float to
// whatever the Stripe account's dashboard default is) keeps request/response
// shapes stable and in sync with the types this file is checked against.
const STRIPE_API_VERSION = "2026-08-26.dahlia";

export function getStripeClient(): Stripe | null {
  if (client !== undefined) return client;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    console.warn("[stripe] STRIPE_SECRET_KEY is not set — online card payment is disabled.");
    client = null;
    return client;
  }

  client = new Stripe(key, { apiVersion: STRIPE_API_VERSION });
  return client;
}
