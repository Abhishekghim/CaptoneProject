"use client";

import React, { useCallback, useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { KeySquare, Loader2, Power, UserPlus } from "lucide-react";
import { createClient } from "@/frontend/lib/supabase/client";
import { useStore } from "@/frontend/lib/store";
import type { Role } from "@/shared/types";
import { EmptyState, SectionTitle } from "@/frontend/components/shared/ui";

interface StaffRow {
  id: string;
  full_name: string;
  email: string;
  role: Role;
  is_active: boolean;
  created_at: string;
}

const ASSIGNABLE_ROLES: Role[] = ["technician", "radiologist", "admin", "super_admin", "referring_doctor"];
const ROLE_LABELS: Record<Role, string> = {
  patient: "Patient",
  technician: "Technician",
  radiologist: "Radiologist",
  admin: "Admin",
  super_admin: "Super Admin",
  referring_doctor: "Referring Doctor",
};

// Reads/writes profiles directly via Supabase — this is real account data,
// not the mock store. Creating an account still needs the service-role
// invite route (app/api/super-admin/staff/create); role changes and
// activate/deactivate are plain table updates the new
// "profiles_super_admin_all" RLS policy (backend/database/008_super_admin.sql)
// permits for a super_admin session directly, no server route needed.
export default function StaffDirectoryPanel() {
  const { currentUser } = useStore();
  const currentUserId = currentUser.id;
  const [rows, setRows] = useState<StaffRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, email, role, is_active, created_at")
      .neq("role", "patient")
      .order("created_at", { ascending: false });

    if (error) {
      setLoadError(error.message);
      return;
    }
    setLoadError(null);
    setRows((data ?? []) as StaffRow[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <section id="staff-accounts" className="card p-5 sm:p-6">
      <SectionTitle
        icon={KeySquare}
        title="Staff accounts"
        subtitle="Create accounts, assign roles, and deactivate access — super_admin only"
        action={
          <button type="button" className="btn-primary text-xs" onClick={() => setShowCreate((v) => !v)}>
            <UserPlus size={14} aria-hidden /> Create account
          </button>
        }
      />
      {showCreate && <CreateStaffForm onCreated={() => { setShowCreate(false); load(); }} />}

      {loadError && <p role="alert" className="mb-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">Could not load staff: {loadError}</p>}
      {!rows && !loadError ? (
        <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={14} className="animate-spin" aria-hidden /> Loading…</p>
      ) : !rows || rows.length === 0 ? (
        <EmptyState message="No staff accounts yet" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Email</th>
                <th className="py-2 pr-4">Role</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Joined</th>
                <th className="py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <StaffRowItem key={row.id} row={row} onChanged={load} isSelf={row.id === currentUserId} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function StaffRowItem({ row, onChanged, isSelf }: { row: StaffRow; onChanged: () => void; isSelf: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function changeRole(newRole: Role) {
    if (newRole === row.role) return;
    if (!confirm(`Change ${row.full_name}'s role from ${ROLE_LABELS[row.role]} to ${ROLE_LABELS[newRole]}?`)) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: updateError } = await supabase.from("profiles").update({ role: newRole }).eq("id", row.id);
    setBusy(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    onChanged();
  }

  async function toggleActive() {
    const action = row.is_active ? "deactivate" : "reactivate";
    if (!confirm(`${action === "deactivate" ? "Deactivate" : "Reactivate"} ${row.full_name}'s account?`)) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: updateError } = await supabase.from("profiles").update({ is_active: !row.is_active }).eq("id", row.id);
    setBusy(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    onChanged();
  }

  return (
    <tr className="border-b border-slate-100 last:border-0">
      <td className="py-2.5 pr-4 font-semibold text-navy">{row.full_name}</td>
      <td className="py-2.5 pr-4 text-slate-500">{row.email}</td>
      <td className="py-2.5 pr-4">
        <select
          className="input w-40 px-2 py-1 text-xs"
          value={row.role}
          disabled={busy || isSelf}
          onChange={(e) => changeRole(e.target.value as Role)}
        >
          {ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
        </select>
      </td>
      <td className="py-2.5 pr-4">
        <span className={`chip ${row.is_active ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"}`}>
          {row.is_active ? "Active" : "Deactivated"}
        </span>
      </td>
      <td className="py-2.5 pr-4 text-xs text-slate-500">{format(parseISO(row.created_at), "d MMM yyyy")}</td>
      <td className="py-2.5">
        {isSelf ? (
          <span className="text-xs text-slate-400">This is you</span>
        ) : (
          <button type="button" disabled={busy} onClick={toggleActive} className={`btn-ghost px-2.5 py-1 text-xs ${row.is_active ? "text-rose-700 hover:bg-rose-50" : ""}`}>
            <Power size={13} aria-hidden /> {row.is_active ? "Deactivate" : "Reactivate"}
          </button>
        )}
        {error && <p className="mt-1 text-xs font-semibold text-rose-700">{error}</p>}
      </td>
    </tr>
  );
}

function CreateStaffForm({ onCreated }: { onCreated: () => void }) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<Role>("technician");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/super-admin/staff/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), full_name: fullName.trim(), role }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || "Could not create this account.");
        return;
      }
      setSuccess(`Invite sent to ${email.trim()}.`);
      setEmail("");
      setFullName("");
      onCreated();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mb-4 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-4">
      <input required type="email" placeholder="Email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input required placeholder="Full name" className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
      <select className="input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
        {ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
      </select>
      <button type="submit" disabled={busy} className="btn-primary text-xs">
        {busy ? "Sending invite…" : "Send invite"}
      </button>
      {error && <p className="text-xs font-semibold text-rose-700 sm:col-span-4">{error}</p>}
      {success && <p className="text-xs font-semibold text-emerald-700 sm:col-span-4">{success}</p>}
    </form>
  );
}
