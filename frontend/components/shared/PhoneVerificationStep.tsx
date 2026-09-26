"use client";

import React, { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { createClient } from "@/frontend/lib/supabase/client";

const PHONE_PATTERN = /^\+[1-9]\d{7,14}$/;
const RESEND_COOLDOWN_SECONDS = 30;

// Test mode: bypasses the real Vonage/Twilio SMS OTP entirely (Vonage is
// still in trial/demo mode — slow, watermarked, delivery-lag-prone — see
// the phone OTP debugging session in this project's history). Set
// NEXT_PUBLIC_PHONE_VERIFICATION_TEST_MODE=true in .env.local to accept any
// 6-digit code instead of a real one; the server route this calls
// (app/api/dev/verify-phone-test/route.ts) independently re-checks its own
// non-public env var, so flipping only the client flag does nothing. Never
// set this in a real deployment.
const TEST_MODE = process.env.NEXT_PUBLIC_PHONE_VERIFICATION_TEST_MODE === "true";

// Embeddable two-step phone verification (send code / verify code), extracted
// from the former standalone app/verify-phone/page.tsx. Uses Supabase Auth's
// native phone-verification-on-an-existing-account flow — updateUser({ phone })
// sends the OTP, verifyOtp({ type: "phone_change" }) confirms it. Not Phone
// MFA, not the Twilio notifications module in backend/lib/notifications/sms.ts.
//
// Designed to be dropped inline into another form/card (e.g. BookingCard's
// booking-confirmation flow) rather than rendered as its own page: no logo
// header, no min-h-screen wrapper, no session-checking/already-verified
// redirect logic — the caller decides when this should be shown at all.
export default function PhoneVerificationStep({
  onVerified,
  onCancel,
}: {
  onVerified: () => void;
  onCancel?: () => void;
}) {
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [confirmedPhone, setConfirmedPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => setResendCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    const trimmedPhone = phone.trim();
    if (!PHONE_PATTERN.test(trimmedPhone)) {
      setError("Enter a valid phone number in international format, e.g. +61412345678.");
      return;
    }

    setSubmitting(true);
    try {
      if (TEST_MODE) {
        // No real SMS sent — skip straight to the code step.
        setConfirmedPhone(trimmedPhone);
        setCode("");
        setStep("code");
        setNotice("Test mode: enter any 6-digit code.");
        setResendCooldown(0);
        return;
      }

      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({ phone: trimmedPhone });
      if (updateError) {
        setError(updateError.message || "Could not send a verification code. Please try again.");
        return;
      }
      setConfirmedPhone(trimmedPhone);
      setCode("");
      setStep("code");
      setNotice(`We sent a 6-digit code to ${trimmedPhone}.`);
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    const trimmedCode = code.trim();
    if (!/^\d{6}$/.test(trimmedCode)) {
      setError("Enter the 6-digit code we texted you.");
      return;
    }

    setSubmitting(true);
    try {
      if (TEST_MODE) {
        // Any 6 digits pass the format check above — skip the real OTP
        // check and mark the phone genuinely confirmed via the Admin API
        // (real phone_confirmed_at, not a fake client-side flag) so the
        // booking form's "already verified" check works identically to a
        // real verification on the next booking.
        const res = await fetch("/api/dev/verify-phone-test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: confirmedPhone }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error || "Test-mode verification failed.");
          return;
        }
        onVerified();
        return;
      }

      const supabase = createClient();
      const { error: verifyError } = await supabase.auth.verifyOtp({
        phone: confirmedPhone,
        token: trimmedCode,
        type: "phone_change",
      });
      if (verifyError) {
        setError(verifyError.message || "That code didn't work. Please try again.");
        return;
      }

      // Keep profiles.phone in sync with the now-verified number, so staff
      // looking up the patient see the same number. Best-effort only — the
      // auth-level verification above is what matters, so a failure here
      // shouldn't block the caller from proceeding.
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { error: profileError } = await supabase
          .from("profiles")
          .update({ phone: confirmedPhone })
          .eq("id", user.id);
        if (profileError) {
          console.warn("Could not sync verified phone to profiles:", profileError.message);
        }
      }

      onVerified();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    if (resendCooldown > 0 || submitting) return;
    setError(null);
    setNotice(null);
    setSubmitting(true);
    try {
      const supabase = createClient();
      const { error: resendError } = await supabase.auth.resend({ type: "phone_change", phone: confirmedPhone });
      if (resendError) {
        setError(resendError.message || "Could not resend the code. Please try again.");
        return;
      }
      setNotice(`We sent a new code to ${confirmedPhone}.`);
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleUseDifferentNumber() {
    setError(null);
    setNotice(null);
    setCode("");
    setResendCooldown(0);
    setStep("phone");
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 sm:p-5">
      <h3 className="text-sm font-bold text-navy">Verify your phone number</h3>
      <p className="mt-1 text-xs text-slate-500">
        {TEST_MODE
          ? "Test mode is on — no real SMS is sent, any 6-digit code is accepted."
          : "We text a 6-digit code to confirm your number — this only happens once."}
      </p>

      {step === "phone" ? (
        <form className="mt-4 space-y-3" onSubmit={handleSendCode}>
          <div>
            <label htmlFor="pv-phone" className="mb-1 block text-xs font-semibold text-slate-600">
              Phone number
            </label>
            <input
              id="pv-phone"
              type="tel"
              required
              autoComplete="tel"
              placeholder="+61412345678"
              className="input w-full"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <p className="mt-1 text-[11px] text-slate-400">Include the country code, e.g. +61 for Australia.</p>
          </div>

          {error && (
            <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {notice}
            </p>
          )}

          <div className="flex items-center gap-3">
            <button type="submit" disabled={submitting} className="btn-primary justify-center py-2.5">
              <ShieldCheck size={16} aria-hidden />
              {submitting ? "Sending code…" : "Send code"}
            </button>
            {onCancel && (
              <button type="button" onClick={onCancel} className="text-sm font-semibold text-slate-500 hover:underline">
                Not now
              </button>
            )}
          </div>
        </form>
      ) : (
        <form className="mt-4 space-y-3" onSubmit={handleVerifyCode}>
          <div>
            <label htmlFor="pv-code" className="mb-1 block text-xs font-semibold text-slate-600">
              6-digit code
            </label>
            <input
              id="pv-code"
              type="text"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              required
              autoComplete="one-time-code"
              className="input w-full"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            />
            <p className="mt-1 text-[11px] text-slate-400">Sent to {confirmedPhone}.</p>
          </div>

          {error && (
            <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {notice}
            </p>
          )}

          <div className="flex items-center gap-3">
            <button type="submit" disabled={submitting} className="btn-primary justify-center py-2.5">
              <ShieldCheck size={16} aria-hidden />
              {submitting ? "Verifying…" : "Verify"}
            </button>
            {onCancel && (
              <button type="button" onClick={onCancel} className="text-sm font-semibold text-slate-500 hover:underline">
                Not now
              </button>
            )}
          </div>

          <div className="flex items-center justify-between text-sm">
            {TEST_MODE ? (
              <span />
            ) : (
              <button
                type="button"
                onClick={handleResend}
                disabled={resendCooldown > 0 || submitting}
                className="font-semibold text-medical hover:underline disabled:cursor-not-allowed disabled:text-slate-400 disabled:no-underline"
              >
                {resendCooldown > 0 ? `Resend code (${resendCooldown}s)` : "Didn't get a code? Resend"}
              </button>
            )}
            <button type="button" onClick={handleUseDifferentNumber} className="font-semibold text-slate-500 hover:underline">
              Use a different number
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
