import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// Fake chainable Supabase client. Each table's shape mirrors exactly how
// ContentManagementPanel calls it (see frontend/components/admin/ContentManagementPanel.tsx):
// content_pages/announcements use .select(...).order(...), prep_instructions/
// scan_prices use a bare .select(...); content_pages.update(...).eq(...) is
// awaited directly (no further chaining), which is what update/eq resolve to.
const updateSpy = vi.fn();

const CONTENT_PAGES = [
  { id: "about", title: "About Us", body: "Original about body", updated_at: "2026-01-01T00:00:00.000Z", updated_by: null },
];

function makeFakeSupabaseClient() {
  return {
    from(table: string) {
      switch (table) {
        case "content_pages":
          return {
            select: () => ({
              order: () => Promise.resolve({ data: CONTENT_PAGES, error: null }),
            }),
            update: (payload: unknown) => ({
              eq: (_col: string, val: unknown) => {
                updateSpy(payload, val);
                return Promise.resolve({ error: null });
              },
            }),
          };
        case "prep_instructions":
          return { select: () => Promise.resolve({ data: [], error: null }) };
        case "scan_prices":
          return { select: () => Promise.resolve({ data: [], error: null }) };
        case "announcements":
          return {
            select: () => ({
              order: () => Promise.resolve({ data: [], error: null }),
            }),
            insert: () => Promise.resolve({ error: null }),
          };
        default:
          throw new Error(`Unexpected table in test fake: ${table}`);
      }
    },
  };
}

vi.mock("@/frontend/lib/supabase/client", () => ({
  createClient: () => makeFakeSupabaseClient(),
}));

vi.mock("@/frontend/lib/store", () => ({
  useStore: () => ({
    currentUser: { id: "admin-1", email: "admin@example.com", full_name: "Adam Admin", role: "admin", created_at: "2026-01-01T00:00:00.000Z" },
  }),
}));

// vi.mock calls above are hoisted above this import by Vitest, so
// ContentManagementPanel picks up the mocked client/store modules.
import ContentManagementPanel from "@/frontend/components/admin/ContentManagementPanel";

describe("ContentManagementPanel", () => {
  beforeEach(() => {
    updateSpy.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the loaded content page with its title and body", async () => {
    render(<ContentManagementPanel />);

    const titleInput = await screen.findByDisplayValue("About Us");
    expect(titleInput).toBeInTheDocument();
    expect(screen.getByDisplayValue("Original about body")).toBeInTheDocument();
  });

  it("submitting the edit form calls .update() with the edited title/body and the admin's id", async () => {
    render(<ContentManagementPanel />);

    const titleInput = await screen.findByDisplayValue("About Us");
    const bodyTextarea = screen.getByDisplayValue("Original about body");

    fireEvent.change(titleInput, { target: { value: "About Capital Radiology" } });
    fireEvent.change(bodyTextarea, { target: { value: "Updated about body" } });

    const form = titleInput.closest("form");
    expect(form).not.toBeNull();
    const saveButton = within(form as HTMLFormElement).getByRole("button", { name: /save/i });
    fireEvent.click(saveButton);

    await waitFor(() => expect(updateSpy).toHaveBeenCalledTimes(1));
    expect(updateSpy).toHaveBeenCalledWith(
      { title: "About Capital Radiology", body: "Updated about body", updated_by: "admin-1" },
      "about"
    );
  });
});
