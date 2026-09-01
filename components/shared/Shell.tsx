"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import {
  Activity, Bell, CalendarClock, ClipboardList, Eye, FileSignature, FileUp, LayoutDashboard,
  LogOut, ScanLine, ShieldCheck, Stethoscope, UserRound, Users, Wrench, X,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { useSession } from "@/lib/auth/SessionContext";
import type { Notification, Role } from "@/lib/types";
import AssistantWidget from "./AssistantWidget";
import { buildAssistantContext } from "@/lib/assistant/scope";
import { QUICK_ACTIONS } from "@/lib/assistant/prompts";

const ROLE_META: Record<Role, { label: string; icon: React.ElementType; blurb: string }> = {
  patient: { label: "Patient", icon: UserRound, blurb: "Book scans, view reports & billing" },
  technician: { label: "Technician", icon: ScanLine, blurb: "Run today's scan queue" },
  radiologist: { label: "Radiologist", icon: Stethoscope, blurb: "Read images, sign reports" },
  admin: { label: "Admin", icon: ShieldCheck, blurb: "KPIs, equipment, audit trail" },
  referring_doctor: { label: "Referring Doctor", icon: FileUp, blurb: "Upload referrals, view your patients' reports" },
};

const NAV_BY_ROLE: Record<Role, { label: string; icon: React.ElementType }[]> = {
  patient: [
    { label: "Book an MRI", icon: CalendarClock },
    { label: "Health profile", icon: ClipboardList },
    { label: "Results & billing", icon: FileSignature },
  ],
  technician: [
    { label: "Today's queue", icon: CalendarClock },
    { label: "Scan logger", icon: ScanLine },
  ],
  radiologist: [
    { label: "Unreported scans", icon: ClipboardList },
    { label: "DICOM viewer", icon: Activity },
    { label: "Report editor", icon: FileSignature },
  ],
  admin: [
    { label: "Overview", icon: LayoutDashboard },
    { label: "Equipment", icon: Wrench },
    { label: "Audit log", icon: ShieldCheck },
  ],
  referring_doctor: [
    { label: "My referrals", icon: Users },
  ],
};

export default function Shell({ children }: { children: React.ReactNode }) {
  const store = useStore();
  const {
    currentUser, previewRole, setPreviewRole, effectiveRole, notifications, markNotificationRead,
    appointments, scans, reports, billing, records, equipment, profiles, logAssistantAction,
  } = store;
  const { logout } = useSession();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const nav = NAV_BY_ROLE[effectiveRole];

  // Always scoped to the real currentUser, never the admin's previewRole —
  // preview only changes which dashboard renders, never authorization (see
  // the comment on previewRole in lib/store.tsx).
  const assistantContext = useMemo(
    () => buildAssistantContext({ currentUser, profiles, appointments, scans, reports, billing, records, equipment }),
    [currentUser, profiles, appointments, scans, reports, billing, records, equipment]
  );

  // TEMPORARY: local-only auth. To go live with Supabase, swap this back to
  // `await createClient().auth.signOut()` — see
  // lib/supabase/login-page.server-reference.tsx for the pattern.
  function handleLogout() {
    setSigningOut(true);
    logout();
    router.push("/login");
    setSigningOut(false);
  }

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col bg-navy text-white lg:flex">
        <div className="flex items-center gap-2.5 border-b border-white/10 px-5 py-5">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-medical">
            <Activity size={20} aria-hidden />
          </div>
          <div>
            <p className="text-sm font-bold leading-tight">Capital Radiology</p>
            <p className="text-[11px] text-slate-400">Online MRI portal</p>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4" aria-label="Section navigation">
          <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            {ROLE_META[effectiveRole].label} workspace
          </p>
          <ul className="space-y-1">
            {nav.map((item) => (
              <li key={item.label}>
                <a
                  href={`#${item.label.toLowerCase().replace(/[^a-z]+/g, "-")}`}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-300 transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-medical"
                >
                  <item.icon size={17} aria-hidden />
                  {item.label}
                </a>
              </li>
            ))}
          </ul>

          {currentUser.role === "admin" && (
            <AdminDemoModePanel previewRole={previewRole} setPreviewRole={setPreviewRole} />
          )}
        </nav>

        <div className="border-t border-white/10 px-5 py-4 text-[11px] leading-relaxed text-slate-400">
          Signed in as {currentUser.email}
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {previewRole && (
          <div className="flex items-center justify-between gap-3 bg-amber-100 px-4 py-2 text-xs font-semibold text-amber-900 sm:px-6">
            <span className="flex items-center gap-1.5">
              <Eye size={14} aria-hidden />
              Admin demo preview — viewing the {ROLE_META[previewRole].label} dashboard. This is a read-through
              preview, not a login: you are still authenticated as {currentUser.full_name} (Admin).
            </span>
            <button
              type="button"
              onClick={() => setPreviewRole(null)}
              className="flex items-center gap-1 rounded-md bg-white/60 px-2 py-1 hover:bg-white"
            >
              <X size={12} aria-hidden /> Exit preview
            </button>
          </div>
        )}

        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <div>
              <p className="text-sm font-bold text-navy">
                {ROLE_META[currentUser.role].label} — {currentUser.full_name}
              </p>
              <p className="text-xs text-slate-500">{ROLE_META[currentUser.role].blurb}</p>
            </div>

            <div className="flex items-center gap-2">
              <NotificationBell
                notifications={notifications.filter((n) => n.user_id === currentUser.id)}
                markRead={markNotificationRead}
              />
              <button
                type="button"
                onClick={handleLogout}
                disabled={signingOut}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-medical"
              >
                <LogOut size={14} aria-hidden />
                {signingOut ? "Signing out…" : "Log out"}
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>

        <footer className="border-t border-slate-200 px-6 py-4 text-xs text-slate-500">
          Capital Radiology · Project 24 — encrypted at rest & in transit in production (NFR5–NFR6) · WCAG 2.1 AA targets (NFR20)
        </footer>
      </div>

      <AssistantWidget
        role={currentUser.role}
        userId={currentUser.id}
        contextSummary={assistantContext.summary}
        quickActions={QUICK_ACTIONS[currentUser.role]}
        onExchange={(_userMessage, _reply, refused) => {
          logAssistantAction(refused ? "Assistant query refused (out of scope)" : "Assistant query answered");
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
// Admin-only preview of other roles' dashboards. Explicitly labeled as a
// preview, not a login: it never touches auth, never changes currentUser,
// and every write in the app still happens (and audits) as the real admin.
function AdminDemoModePanel({
  previewRole,
  setPreviewRole,
}: {
  previewRole: Role | null;
  setPreviewRole: (role: Role | null) => void;
}) {
  return (
    <div className="mt-6 rounded-lg border border-white/10 bg-white/5 p-3">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        <Eye size={12} aria-hidden /> Admin demo mode
      </p>
      <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
        Preview another dashboard for demos. This does not sign you in as that role.
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {(Object.keys(ROLE_META) as Role[])
          .filter((role) => role !== "admin")
          .map((role) => {
            const Meta = ROLE_META[role];
            const active = previewRole === role;
            return (
              <button
                key={role}
                type="button"
                onClick={() => setPreviewRole(active ? null : role)}
                aria-pressed={active}
                className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold transition ${
                  active ? "bg-medical text-white" : "bg-white/10 text-slate-300 hover:bg-white/20"
                }`}
              >
                <Meta.icon size={12} aria-hidden />
                {Meta.label}
              </button>
            );
          })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
function NotificationBell({
  notifications,
  markRead,
}: {
  notifications: Notification[];
  markRead: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const unread = notifications.filter((n) => !n.read).length;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
        className="relative flex items-center justify-center rounded-lg border border-slate-200 bg-white p-2 text-slate-600 transition hover:border-medical hover:text-medical focus-visible:outline focus-visible:outline-2 focus-visible:outline-medical"
      >
        <Bell size={16} aria-hidden />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close notifications"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-30 cursor-default"
          />
          <div className="absolute right-0 z-40 mt-2 w-80 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
            <p className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Notifications</p>
            {notifications.length === 0 ? (
              <p className="px-2 py-4 text-center text-sm text-slate-500">No notifications yet.</p>
            ) : (
              <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto">
                {notifications.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => markRead(n.id)}
                      className={`block w-full px-2 py-2.5 text-left text-sm transition hover:bg-slate-50 ${
                        n.read ? "" : "bg-sky-50/60"
                      }`}
                    >
                      <span className="flex items-center gap-1.5 font-semibold text-navy">
                        {!n.read && <span className="h-1.5 w-1.5 rounded-full bg-medical" aria-hidden />}
                        {n.title}
                      </span>
                      <span className="mt-0.5 block text-xs text-slate-600">{n.message}</span>
                      <span className="mt-0.5 block text-[11px] text-slate-400">
                        {format(parseISO(n.created_at), "d MMM, h:mm a")}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
