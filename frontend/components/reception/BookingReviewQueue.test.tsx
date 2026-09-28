import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const PENDING = {
  id: "apt-1",
  patient_id: "pat-1",
  date: "2031-02-03",
  time_slot: "09:00",
  location: "Berwick",
  body_part: "Brain",
  status: "scheduled",
  confirmed: false,
  booking_review_status: "pending",
  referral_url: "referrals/pat-1/1-referral.pdf",
  referring_doctor_id: null,
  referring_doctor_name: "Dr Outside",
  referring_doctor_practice: "Northside GP",
  created_at: "2031-01-20T01:00:00.000Z",
};

const rpcSpy = vi.fn();
const notifySpy = vi.fn();
let pendingRows = [PENDING];

function chain(result: unknown) {
  const c: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "order"]) c[m] = () => c;
  c.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return c;
}

vi.mock("@/frontend/lib/supabase/client", () => ({
  createClient: () => ({
    from: (table: string) => chain({ data: table === "appointments" ? pendingRows : [], error: null }),
    rpc: (name: string, args: unknown) => {
      rpcSpy(name, args);
      pendingRows = [];
      return Promise.resolve({ data: {}, error: null });
    },
  }),
}));

vi.mock("@/frontend/lib/hooks/useProfiles", () => ({
  useProfiles: () => ({ data: [{ id: "pat-1", full_name: "Pat Patient", phone: "0400 000 000", role: "patient" }] }),
}));

vi.mock("@/frontend/lib/hooks/useMedicalRecords", () => ({
  useMedicalRecords: () => ({
    data: [
      {
        patient_id: "pat-1",
        dob: "1990-05-05",
        history: null,
        contraindications: { metal_implants: false, pacemaker: true, claustrophobia: false, contrast_allergy: false, pregnancy: false, other: null },
      },
    ],
  }),
}));

vi.mock("@/frontend/lib/storage", () => ({ getSignedUrl: () => Promise.resolve("https://signed.example/ref.pdf") }));
vi.mock("@/frontend/lib/notify", () => ({ notifyPatient: (...args: unknown[]) => notifySpy(...args) }));

import BookingReviewQueue from "@/frontend/components/reception/BookingReviewQueue";

beforeEach(() => {
  pendingRows = [PENDING];
  rpcSpy.mockClear();
  notifySpy.mockClear();
});
afterEach(cleanup);

describe("BookingReviewQueue", () => {
  it("shows what a reviewer needs to check", async () => {
    render(<BookingReviewQueue />);
    expect(await screen.findByText(/Pat Patient · Brain MRI/)).toBeInTheDocument();
    expect(screen.getByText(/DOB 5 May 1990/)).toBeInTheDocument();
    expect(screen.getByText(/pacemaker/)).toBeInTheDocument();
    expect(screen.getByText(/Dr Outside · Northside GP/)).toBeInTheDocument();
    expect(screen.getByText("Not registered")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Open uploaded referral/ })).toBeInTheDocument();
  });

  it("approves through review_booking and notifies the patient", async () => {
    render(<BookingReviewQueue />);
    fireEvent.click(await screen.findByRole("button", { name: /Approve and confirm/ }));

    await waitFor(() => expect(rpcSpy).toHaveBeenCalledWith("review_booking", {
      p_appointment_id: "apt-1",
      p_decision: "approve",
      p_reason: null,
    }));
    expect(notifySpy).toHaveBeenCalledWith("pat-1", "appointment_confirmed", "Appointment confirmed", expect.any(String), "apt-1");
    expect(await screen.findByText(/No bookings waiting for review/)).toBeInTheDocument();
  });

  it("will not decline without a reason", async () => {
    render(<BookingReviewQueue />);
    fireEvent.click(await screen.findByRole("button", { name: /Decline/ }));
    expect(await screen.findByText(/Give a reason for declining/)).toBeInTheDocument();
    expect(rpcSpy).not.toHaveBeenCalled();
  });

  it("declines with the reason given", async () => {
    render(<BookingReviewQueue />);
    fireEvent.change(await screen.findByLabelText(/Reason for declining/), { target: { value: "Referral is for the knee" } });
    fireEvent.click(screen.getByRole("button", { name: /Decline/ }));

    await waitFor(() => expect(rpcSpy).toHaveBeenCalledWith("review_booking", {
      p_appointment_id: "apt-1",
      p_decision: "decline",
      p_reason: "Referral is for the knee",
    }));
    expect(notifySpy).toHaveBeenCalledWith("pat-1", "appointment_declined", "Appointment not confirmed", expect.stringContaining("Referral is for the knee"), "apt-1");
  });
});
