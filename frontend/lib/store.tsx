"use client";

// Identity-only context for the app. Every piece of clinical/operational
// data this used to hold in-memory (appointments, billing, scans, reports,
// equipment, messaging, inventory, CMS content, referrals, medical records,
// audit log, notifications) has been migrated to real Supabase tables and is
// now read via the hooks in frontend/lib/hooks/ instead. All that remains
// here is:
//   - currentUser: the real, authenticated user's profile, sourced from
//     app/(app)/layout.tsx's server-side Supabase query.
//   - previewRole/setPreviewRole/effectiveRole: a UI-only admin/super_admin
//     "preview another role's dashboard" feature. It never changes
//     currentUser or authorization — only which dashboard renders (see
//     Shell.tsx).
import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { Profile, Role } from "@/shared/types";

interface Store {
  // real, authenticated identity — sourced from Supabase auth + profiles.role,
  // fetched server-side (see app/(app)/layout.tsx). Never changes for the
  // lifetime of the session; nothing in this app lets a user pick their own role.
  currentUser: Profile;

  // Admin-only, UI-level preview of another role's dashboard. Does NOT change
  // currentUser — this only controls which dashboard renders (see Shell.tsx).
  previewRole: Role | null;
  setPreviewRole: (role: Role | null) => void;
  effectiveRole: Role;
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ profile, children }: { profile: Profile; children: React.ReactNode }) {
  const currentUser = profile;
  const [previewRole, setPreviewRoleState] = useState<Role | null>(null);
  const effectiveRole = previewRole ?? currentUser.role;

  const setPreviewRole = useCallback(
    (role: Role | null) => {
      // Defense in depth: the panel that calls this is already hidden for
      // non-admin-tier roles (see Shell.tsx), but never let preview change identity.
      if (currentUser.role !== "admin" && currentUser.role !== "super_admin") return;
      setPreviewRoleState(role);
    },
    [currentUser.role]
  );

  const value = useMemo<Store>(
    () => ({ currentUser, previewRole, setPreviewRole, effectiveRole }),
    [currentUser, previewRole, setPreviewRole, effectiveRole]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside <StoreProvider>");
  return ctx;
}
