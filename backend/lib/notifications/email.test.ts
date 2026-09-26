import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

describe("sendEmail", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.unstubAllEnvs();
    vi.doUnmock("resend");
  });

  it("returns ok:false without throwing when RESEND_API_KEY is unset", async () => {
    delete process.env.RESEND_API_KEY;
    const { sendEmail } = await import("@/backend/lib/notifications/email");

    const result = await sendEmail({ to: "patient@example.com", subject: "Hi", html: "<p>Hi</p>" });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/RESEND_API_KEY/i);
  });

  it("sends via the Resend client and returns ok:true when the key is configured", async () => {
    process.env.RESEND_API_KEY = "test-key";
    process.env.NOTIFICATIONS_FROM_EMAIL = "Capital Radiology <notifications@capitalradiology.example>";

    const send = vi.fn().mockResolvedValue({ data: { id: "email-1" }, error: null });
    vi.doMock("resend", () => ({
      Resend: vi.fn().mockImplementation(() => ({ emails: { send } })),
    }));

    const { sendEmail } = await import("@/backend/lib/notifications/email");
    const result = await sendEmail({ to: "patient@example.com", subject: "Hi", html: "<p>Hi</p>" });

    expect(result).toEqual({ ok: true });
    expect(send).toHaveBeenCalledWith({
      from: "Capital Radiology <notifications@capitalradiology.example>",
      to: "patient@example.com",
      subject: "Hi",
      html: "<p>Hi</p>",
    });
  });

  it("returns ok:false with the provider's error message when Resend reports an error", async () => {
    process.env.RESEND_API_KEY = "test-key";

    const send = vi.fn().mockResolvedValue({ data: null, error: { message: "Invalid recipient" } });
    vi.doMock("resend", () => ({
      Resend: vi.fn().mockImplementation(() => ({ emails: { send } })),
    }));

    const { sendEmail } = await import("@/backend/lib/notifications/email");
    const result = await sendEmail({ to: "bad", subject: "Hi", html: "<p>Hi</p>" });

    expect(result).toEqual({ ok: false, error: "Invalid recipient" });
  });
});
