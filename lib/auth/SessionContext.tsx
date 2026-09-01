"use client";

import React, { createContext, useCallback, useContext, useState } from "react";
import type { Profile } from "@/lib/types";

// Client-only session state backing the TEMPORARY local auth (see
// lib/auth/local-accounts.ts). Lives in memory for the life of the tab —
// a full page reload clears it, same as the accounts it points to.
interface SessionValue {
  session: Profile | null;
  login: (profile: Profile) => void;
  logout: () => void;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Profile | null>(null);
  const login = useCallback((profile: Profile) => setSession(profile), []);
  const logout = useCallback(() => setSession(null), []);

  return <SessionContext.Provider value={{ session, login, logout }}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}
