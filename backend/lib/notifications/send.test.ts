import { beforeEach, describe, expect, it, vi } from "vitest";
import { sendNotification } from "@/backend/lib/notifications/send";
import { createAdminClient } from "@/backend/lib/supabase/admin";
import { sendEmail } from "@/backend/lib/notifications/email";

vi.mock("@/backend/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));
vi.mock("@/backend/lib/notifications/email", () => ({
  sendEmail: vi.fn(),
}));

// Builds a fake Supabase query-builder chain: admin.from("profiles").select(...).eq(...).single()
function mockProfileLookup(result: { data: unknown; error: unknown }) {
  const single = vi.fn().mockResolvedValue(result);
  const eq = vi.fn().mockReturnValue({ single });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  vi.mocked(createAdminClient).mockReturnValue({ from } as unknown as ReturnType<typeof createAdminClient>);
  return { from, select, eq, single };
}

describe("sendNotification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends email only when emailHtml is provided and the profile has an email", async () => {
    mockProfileLookup({ data: { email: "patient@example.com" }, error: null });
    vi.mocked(sendEmail).mockResolvedValue({ ok: true });

    const result = await sendNotification({
      userId: "user-1",
      type: "appointment_confirmed",
      subject: "Your appointment is confirmed",
      emailHtml: "<p>Confirmed</p>",
    });

    expect(sendEmail).toHaveBeenCalledWith({
      to: "patient@example.com",
      subject: "Your appointment is confirmed",
      html: "<p>Confirmed</p>",
    });
    expect(result.email).toEqual({ ok: true });
  });

  it("skips email when emailHtml is provided but the profile has no email on file", async () => {
    mockProfileLookup({ data: { email: null }, error: null });

    await sendNotification({
      userId: "user-4",
      type: "billing_alert",
      subject: "Invoice",
      emailHtml: "<p>Invoice</p>",
    });

    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("never throws and sends nothing when the profile lookup fails", async () => {
    mockProfileLookup({ data: null, error: { message: "not found" } });

    const result = await sendNotification({
      userId: "missing-user",
      type: "appointment_confirmed",
      subject: "Hi",
      emailHtml: "<p>Hi</p>",
    });

    expect(result).toEqual({});
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("never throws and reports the failure when sendEmail itself rejects", async () => {
    mockProfileLookup({ data: { email: "patient@example.com" }, error: null });
    vi.mocked(sendEmail).mockRejectedValue(new Error("network down"));

    const result = await sendNotification({
      userId: "user-5",
      type: "appointment_confirmed",
      subject: "Hi",
      emailHtml: "<p>Hi</p>",
    });

    expect(result.email).toEqual({ ok: false, error: "network down" });
  });
});
