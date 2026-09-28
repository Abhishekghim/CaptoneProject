import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const rpcSpy = vi.fn();

vi.mock("@/frontend/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { getUser: () => Promise.resolve({ data: { user: { phone_confirmed_at: "2026-01-01T00:00:00Z" } } }) },
    from: (table: string) => {
      if (table !== "doctor_referrals") throw new Error(`Unexpected table: ${table}`);
      return { select: () => ({ eq: () => ({ is: () => Promise.resolve({ data: [], error: null }) }) }) };
    },
    rpc: (name: string, args: Record<string, unknown>) => {
      if (name === "get_taken_slots") return Promise.resolve({ data: [], error: null });
      rpcSpy(name, args);
      return Promise.resolve({ data: { id: "apt-1", booking_review_status: "pending", confirmed: false }, error: null });
    },
  }),
}));

vi.mock("@/frontend/lib/store", () => ({
  useStore: () => ({ currentUser: { id: "pat-1", role: "patient", full_name: "Pat Patient" } }),
}));

vi.mock("@/frontend/lib/hooks/useProfiles", () => ({
  useProfiles: () => ({ data: [{ id: "doc-1", role: "referring_doctor", full_name: "Dr Internal" }], loadError: null }),
}));

vi.mock("@/frontend/lib/hooks/useScanPrices", () => ({
  useScanPrices: () => ({ data: {}, loadError: null }),
}));

vi.mock("@/frontend/lib/storage", () => ({
  uploadToBucket: () => Promise.resolve({ ok: true, path: "referrals/pat-1/1-referral.pdf" }),
}));

vi.mock("@/frontend/lib/notify", () => ({ notifyPatient: vi.fn() }));

vi.mock("@/frontend/components/shared/Calendar", () => ({
  DatePickerField: ({ value }: { value: string }) => <input aria-label="Date" value={value} readOnly />,
}));

vi.mock("@/frontend/components/shared/PhoneVerificationStep", () => ({ default: () => null }));

import BookingCard from "@/frontend/components/patient/BookingCard";

function setup() {
  render(<BookingCard onBooked={() => {}} />);
  fireEvent.change(screen.getByLabelText("Body part"), { target: { value: "Right Knee" } });
}

function attachReferral() {
  const file = new File(["%PDF"], "referral.pdf", { type: "application/pdf" });
  fireEvent.change(screen.getByLabelText(/Referral document/), { target: { files: [file] } });
}

async function submit() {
  await waitFor(() => expect(screen.getByRole("button", { name: /Book appointment/ })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: /Book appointment/ }));
}

beforeEach(() => rpcSpy.mockClear());
afterEach(cleanup);

describe("BookingCard referral rules", () => {
  it("requires a referral document when the patient picks another doctor and leaves the details blank", async () => {
    setup();
    fireEvent.change(screen.getByLabelText("Referring doctor"), { target: { value: "__other__" } });
    expect(screen.getByLabelText(/Doctor.s name/)).toHaveValue("");

    await submit();

    expect(await screen.findByText(/Please attach your referral document/)).toBeInTheDocument();
    expect(rpcSpy).not.toHaveBeenCalled();
  });

  it("books other-doctor referrals for manual review and says the time is reserved, not confirmed", async () => {
    setup();
    fireEvent.change(screen.getByLabelText("Referring doctor"), { target: { value: "__other__" } });
    attachReferral();

    await submit();

    await waitFor(() => expect(rpcSpy).toHaveBeenCalledTimes(1));
    const [name, args] = rpcSpy.mock.calls[0];
    expect(name).toBe("book_appointment");
    expect(args).toMatchObject({
      p_other_doctor: true,
      p_referring_doctor_id: null,
      p_referring_doctor_name: null,
      p_referral_url: "referrals/pat-1/1-referral.pdf",
    });
    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent(/not confirmed yet/);
    expect(status).toHaveTextContent(/reviewed manually/);
  });

  it("sends the registered doctor's account for a Flow A booking", async () => {
    setup();
    fireEvent.change(screen.getByLabelText("Referring doctor"), { target: { value: "doc-1" } });
    attachReferral();

    await submit();

    await waitFor(() => expect(rpcSpy).toHaveBeenCalledTimes(1));
    expect(rpcSpy.mock.calls[0][1]).toMatchObject({ p_referring_doctor_id: "doc-1", p_other_doctor: false });
    expect(await screen.findByRole("status")).not.toHaveTextContent(/reviewed manually/);
  });

  it("lets a registered-doctor booking go without a document so the doctor's referral can be matched", async () => {
    setup();
    fireEvent.change(screen.getByLabelText("Referring doctor"), { target: { value: "doc-1" } });
    await submit();
    await waitFor(() => expect(rpcSpy).toHaveBeenCalledTimes(1));
    expect(rpcSpy.mock.calls[0][1]).toMatchObject({ p_referring_doctor_id: "doc-1", p_referral_url: null });
  });

  it("still books a self-referred knee scan without a document", async () => {
    setup();
    await submit();
    await waitFor(() => expect(rpcSpy).toHaveBeenCalledTimes(1));
    expect(rpcSpy.mock.calls[0][1]).toMatchObject({ p_referral_url: null, p_other_doctor: false });
  });
});
