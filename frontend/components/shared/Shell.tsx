"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import {
  Activity, BarChart3, Bell, Boxes, CalendarClock, ClipboardList, Crown, Eye, FileSignature, FileUp,
  HeartPulse, Info, KeySquare, LayoutDashboard, LogOut, MessageSquare, Newspaper, Receipt, ScanLine,
  Send, ShieldAlert, ShieldCheck, Stethoscope, UserCheck, UserPlus, UserRound, UserX, Users, UsersRound, Wrench, X,
} from "lucide-react";
import { useStore } from "@/frontend/lib/store";
import { createClient } from "@/frontend/lib/supabase/client";
import type { Notification, Role } from "@/shared/types";
import AssistantWidget from "./AssistantWidget";
import { buildAssistantContext } from "@/frontend/lib/assistant/scope";
import { QUICK_ACTIONS } from "@/backend/lib/assistant/prompts";
import { useAppointments } from "@/frontend/lib/hooks/useAppointments";
import { useScans } from "@/frontend/lib/hooks/useScans";
import { useReports } from "@/frontend/lib/hooks/useReports";
import { useBilling } from "@/frontend/lib/hooks/useBilling";
import { useMedicalRecords } from "@/frontend/lib/hooks/useMedicalRecords";
import { useEquipment } from "@/frontend/lib/hooks/useEquipment";
import { useProfiles } from "@/frontend/lib/hooks/useProfiles";

const ROLE_META: Record<Role, { label: string; icon: React.ElementType; blurb: string }> = {
  patient: { label: "Patient", icon: UserRound, blurb: "Book scans, view reports & billing" },
  technician: { label: "Technician", icon: ScanLine, blurb: "Run today's scan queue" },
  radiologist: { label: "Radiologist", icon: Stethoscope, blurb: "Read images, sign reports" },
  admin: { label: "Admin", icon: ShieldCheck, blurb: "KPIs, equipment, audit trail" },
  referring_doctor: { label: "Referring Doctor", icon: FileUp, blurb: "Upload referrals, view your patients' reports" },
  super_admin: { label: "Super Admin", icon: Crown, blurb: "Accounts, roles, and everything admin has" },
  reception: { label: "Reception", icon: UsersRound, blurb: "Check-in, waiting room, front-desk schedule" },
};

const NAV_BY_ROLE: Record<Role, { label: string; icon: React.ElementType; href?: string }[]> = {
  patient: [
    { label: "Book an MRI", icon: CalendarClock, href: "/dashboard/book" },
    { label: "Health profile", icon: HeartPulse, href: "/dashboard/profile" },
    { label: "Appointment history", icon: ClipboardList, href: "/dashboard/appointments" },
    { label: "Results & reports", icon: FileSignature, href: "/dashboard/results" },
    { label: "Billing history", icon: Receipt, href: "/dashboard/billing" },
    { label: "Messages", icon: MessageSquare, href: "/dashboard/messages" },
    { label: "Notification preferences", icon: Bell, href: "/dashboard/settings" },
    { label: "Clinic info", icon: Info, href: "/dashboard/clinic-info" },
    { label: "Privacy & data", icon: ShieldCheck, href: "/dashboard/privacy" },
  ],
  technician: [
    { label: "Today's queue", icon: CalendarClock, href: "/dashboard/queue" },
    { label: "Scan logger", icon: ScanLine, href: "/dashboard/scan-logger" },
  ],
  radiologist: [
    { label: "Unreported scans", icon: ClipboardList, href: "/dashboard/unreported" },
    { label: "Read & report", icon: Activity, href: "/dashboard/read" },
  ],
  admin: [
    { label: "Overview", icon: LayoutDashboard, href: "/dashboard/overview" },
    { label: "Appointments", icon: CalendarClock, href: "/dashboard/appointments" },
    { label: "Billing", icon: Receipt, href: "/dashboard/billing" },
    { label: "Equipment", icon: Wrench, href: "/dashboard/equipment" },
    { label: "Inventory", icon: Boxes, href: "/dashboard/inventory" },
    { label: "Reports", icon: BarChart3, href: "/dashboard/reports" },
    { label: "Content", icon: Newspaper, href: "/dashboard/content" },
    { label: "Security alerts", icon: ShieldAlert, href: "/dashboard/security-alerts" },
    { label: "Account deletions", icon: UserX, href: "/dashboard/account-deletions" },
    { label: "Messages", icon: MessageSquare, href: "/dashboard/messages" },
    { label: "Audit log", icon: ShieldCheck, href: "/dashboard/audit-log" },
  ],
  referring_doctor: [
    { label: "Refer a patient", icon: UserPlus, href: "/dashboard/refer" },
    { label: "Referrals sent", icon: Send, href: "/dashboard/referrals-sent" },
    { label: "My patients", icon: Users, href: "/dashboard/my-patients" },
  ],
  super_admin: [
    { label: "Staff accounts", icon: KeySquare, href: "/dashboard/staff-accounts" },
    { label: "Doctor requests", icon: UserCheck, href: "/dashboard/doctor-requests" },
    { label: "Overview", icon: LayoutDashboard, href: "/dashboard/overview" },
    { label: "Appointments", icon: CalendarClock, href: "/dashboard/appointments" },
    { label: "Billing", icon: Receipt, href: "/dashboard/billing" },
    { label: "Equipment", icon: Wrench, href: "/dashboard/equipment" },
    { label: "Inventory", icon: Boxes, href: "/dashboard/inventory" },
    { label: "Reports", icon: BarChart3, href: "/dashboard/reports" },
    { label: "Content", icon: Newspaper, href: "/dashboard/content" },
    { label: "Security alerts", icon: ShieldAlert, href: "/dashboard/security-alerts" },
    { label: "Account deletions", icon: UserX, href: "/dashboard/account-deletions" },
    { label: "Messages", icon: MessageSquare, href: "/dashboard/messages" },
    { label: "Audit log", icon: ShieldCheck, href: "/dashboard/audit-log" },
  ],
  reception: [
    { label: "Today's schedule", icon: CalendarClock, href: "/dashboard/schedule" },
    { label: "Patients", icon: Users, href: "/dashboard/patients" },
  ],
};

export default function Shell({ children }: { children: React.ReactNode }) {
  const store = useStore();
  const { currentUser, previewRole, setPreviewRole, effectiveRole } = store;
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const nav = NAV_BY_ROLE[effectiveRole];

  const {
    notifications: myNotificationsData,
    loadError: notificationsError,
    markRead: markNotificationRead,
  } = useMyNotifications(currentUser.id);
  const notifications = myNotificationsData ?? [];

  // Real Supabase reads feeding the assistant widget's context builder — see
  // frontend/lib/hooks/*.ts. The assistant is opened well after page load
  // (never on first paint), and buildAssistantContext only actually runs
  // when the user sends a message (via app/api/assistant/route.ts), so this
  // doesn't need to block the shell on 7 parallel fetches: any hook still
  // `null` (still loading) just defaults to [] below, same low-stakes
  // tradeoff as loading momentarily-incomplete data into a chat sidebar.
  const { data: appointmentsData } = useAppointments();
  const { data: scansData } = useScans();
  const { data: reportsData } = useReports();
  const { data: billingData } = useBilling();
  const { data: recordsData } = useMedicalRecords();
  const { data: equipmentData } = useEquipment();
  const { data: profilesData } = useProfiles();

  // Always scoped to the real currentUser, never the admin's previewRole —
  // preview only changes which dashboard renders, never authorization (see
  // the comment on previewRole in frontend/lib/store.tsx).
  const assistantContext = useMemo(
    () =>
      buildAssistantContext({
        currentUser,
        profiles: profilesData ?? [],
        appointments: appointmentsData ?? [],
        scans: scansData ?? [],
        reports: reportsData ?? [],
        billing: billingData ?? [],
        records: recordsData ?? [],
        equipment: equipmentData ?? [],
      }),
    [currentUser, profilesData, appointmentsData, scansData, reportsData, billingData, recordsData, equipmentData]
  );

  async function handleLogout() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
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
                {item.href ? (
                  <Link
                    href={item.href}
                    className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-300 transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-medical"
                  >
                    <item.icon size={17} aria-hidden />
                    {item.label}
                  </Link>
                ) : (
                  <a
                    href={`#${item.label.toLowerCase().replace(/[^a-z]+/g, "-")}`}
                    className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-300 transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-medical"
                  >
                    <item.icon size={17} aria-hidden />
                    {item.label}
                  </a>
                )}
              </li>
            ))}
          </ul>

          {(currentUser.role === "admin" || currentUser.role === "super_admin") && (
            <AdminDemoModePanel previewRole={previewRole} setPreviewRole={setPreviewRole} currentRole={currentUser.role} />
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
                notifications={notifications}
                markRead={markNotificationRead}
                loadError={notificationsError}
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
          // Metadata only, never the chat content itself — see the comment
          // on public.log_action() in backend/database/028_log_action_rpc.sql
          // (mirrors logAssistantAction's own reasoning in the old mock
          // store, frontend/lib/store.tsx ~lines 750-753). Fire-and-forget:
          // the mock's own logAssistantAction was synchronous and never
          // blocked the UI, so this doesn't await the RPC either.
          const supabase = createClient();
          supabase
            .rpc("log_action", {
              p_action: "ASSISTANT_QUERY",
              p_entity: "assistant",
              p_entity_id: null,
              p_details: { summary: refused ? "Assistant query refused (out of scope)" : "Assistant query answered" },
            })
            .then(({ error }) => {
              if (error) console.warn("Failed to log assistant action:", error.message);
            });
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
  currentRole,
}: {
  previewRole: Role | null;
  setPreviewRole: (role: Role | null) => void;
  currentRole: Role;
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
          .filter((role) => role !== currentRole)
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

// Real Supabase read/write (backend/database/schema.sql — the notifications
// table, notifications_read_own/notifications_mark_read_own RLS — already
// existed before this phase; frontend/components/shared/Shell.tsx was the
// last remaining mock consumer, via store.notifications/markNotificationRead),
// replacing frontend/lib/store.tsx's mock notifications array. null = still
// loading.
function useMyNotifications(userId: string) {
  const [notifications, setNotifications] = useState<Notification[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) {
      setLoadError(error.message);
      return;
    }
    setLoadError(null);
    setNotifications((data ?? []) as Notification[]);
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const markRead = useCallback(async (id: string) => {
    const supabase = createClient();
    const { error } = await supabase.from("notifications").update({ read: true }).eq("id", id);
    if (error) {
      setLoadError(error.message);
      return;
    }
    setNotifications((prev) => (prev ? prev.map((n) => (n.id === id ? { ...n, read: true } : n)) : prev));
  }, []);

  return { notifications, loadError, markRead, reload: load };
}

/* ------------------------------------------------------------------ */
function NotificationBell({
  notifications,
  markRead,
  loadError,
}: {
  notifications: Notification[];
  markRead: (id: string) => void;
  loadError?: string | null;
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
            {loadError ? (
              <p role="alert" className="px-2 py-4 text-center text-sm text-rose-700">Could not load: {loadError}</p>
            ) : notifications.length === 0 ? (
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
