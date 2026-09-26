"use client";

import React, { useCallback, useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { Bell, DollarSign, FileEdit, Loader2, Megaphone } from "lucide-react";
import { createClient } from "@/frontend/lib/supabase/client";
import { useStore } from "@/frontend/lib/store";
import { BODY_PARTS } from "@/frontend/lib/constants";
import type { ContentPageId } from "@/shared/types";
import { EmptyState, SectionTitle } from "@/frontend/components/shared/ui";

// Real Supabase-backed reads/writes (backend/database/011_cms_content.sql) —
// this used to be the mock store's content_pages/announcements/
// prep_instructions/scan_prices state (frontend/lib/store.tsx,
// frontend/lib/seed.ts). Hand-typed row types matching the .select() column
// lists below, same pattern as StaffRow in
// frontend/components/super-admin/StaffDirectoryPanel.tsx.
type ContentPageRow = {
  id: ContentPageId;
  title: string;
  body: string;
  updated_at: string;
  updated_by: string | null;
};

type AnnouncementRow = {
  id: string;
  title: string;
  message: string;
  active: boolean;
  created_at: string;
};

type PrepInstructionRow = {
  body_part: string;
  instructions: string;
  updated_at: string;
};

type ScanPriceRow = {
  body_part: string;
  price: number;
  updated_at: string;
};

export default function ContentManagementPanel() {
  const { currentUser } = useStore();

  const [pages, setPages] = useState<ContentPageRow[] | null>(null);
  const [pagesError, setPagesError] = useState<string | null>(null);
  const loadPages = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("content_pages")
      .select("id, title, body, updated_at, updated_by")
      .order("id", { ascending: true });
    if (error) {
      setPagesError(error.message);
      return;
    }
    setPagesError(null);
    setPages((data ?? []) as ContentPageRow[]);
  }, []);

  const [prepInstructions, setPrepInstructions] = useState<PrepInstructionRow[] | null>(null);
  const [prepError, setPrepError] = useState<string | null>(null);
  const loadPrepInstructions = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("prep_instructions")
      .select("body_part, instructions, updated_at");
    if (error) {
      setPrepError(error.message);
      return;
    }
    setPrepError(null);
    setPrepInstructions((data ?? []) as PrepInstructionRow[]);
  }, []);

  const [scanPrices, setScanPrices] = useState<ScanPriceRow[] | null>(null);
  const [priceError, setPriceError] = useState<string | null>(null);
  const loadScanPrices = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("scan_prices")
      .select("body_part, price, updated_at");
    if (error) {
      setPriceError(error.message);
      return;
    }
    setPriceError(null);
    setScanPrices((data ?? []) as ScanPriceRow[]);
  }, []);

  const [announcements, setAnnouncements] = useState<AnnouncementRow[] | null>(null);
  const [announcementsError, setAnnouncementsError] = useState<string | null>(null);
  const loadAnnouncements = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("announcements")
      .select("id, title, message, active, created_at")
      .order("created_at", { ascending: false });
    if (error) {
      setAnnouncementsError(error.message);
      return;
    }
    setAnnouncementsError(null);
    setAnnouncements((data ?? []) as AnnouncementRow[]);
  }, []);

  useEffect(() => {
    loadPages();
    loadPrepInstructions();
    loadScanPrices();
    loadAnnouncements();
  }, [loadPages, loadPrepInstructions, loadScanPrices, loadAnnouncements]);

  return (
    <section id="content-management" className="card space-y-6 p-5 sm:p-6">
      <div>
        <SectionTitle icon={FileEdit} title="Site content" subtitle="About / Contact / FAQ text shown in the patient portal (FR75)" />
        {pagesError && (
          <p role="alert" className="mb-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
            Could not load content pages: {pagesError}
          </p>
        )}
        {!pages && !pagesError ? (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 size={14} className="animate-spin" aria-hidden /> Loading…
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            {(pages ?? []).map((page) => (
              <ContentPageEditor key={page.id} page={page} currentUserId={currentUser.id} onSaved={loadPages} />
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-slate-100 pt-5">
        <SectionTitle icon={Bell} title="MRI prep instructions" subtitle="Per-scan patient preparation text (FR76)" />
        {prepError && (
          <p role="alert" className="mb-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
            Could not load prep instructions: {prepError}
          </p>
        )}
        {!prepInstructions && !prepError ? (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 size={14} className="animate-spin" aria-hidden /> Loading…
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {BODY_PARTS.map((bp) => (
              <PrepInstructionEditor
                key={bp}
                bodyPart={bp}
                existing={(prepInstructions ?? []).find((p) => p.body_part === bp) ?? null}
                onSaved={loadPrepInstructions}
              />
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-slate-100 pt-5">
        <SectionTitle icon={DollarSign} title="Service pricing" subtitle="Editable per-scan pricing (FR77)" />
        {priceError && (
          <p role="alert" className="mb-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
            Could not load pricing: {priceError}
          </p>
        )}
        {!scanPrices && !priceError ? (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 size={14} className="animate-spin" aria-hidden /> Loading…
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-4">
            {BODY_PARTS.map((bp) => (
              <PriceEditor
                key={bp}
                bodyPart={bp}
                existing={(scanPrices ?? []).find((p) => p.body_part === bp) ?? null}
                onSaved={loadScanPrices}
              />
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-slate-100 pt-5">
        <SectionTitle icon={Megaphone} title="Announcements" subtitle="Alerts shown on the patient portal (FR78)" />
        {announcementsError && (
          <p role="alert" className="mb-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
            Could not load announcements: {announcementsError}
          </p>
        )}
        <AnnouncementsEditor
          announcements={announcements}
          loading={!announcements && !announcementsError}
          onChanged={loadAnnouncements}
        />
      </div>
    </section>
  );
}

function ContentPageEditor({
  page,
  currentUserId,
  onSaved,
}: {
  page: ContentPageRow;
  currentUserId: string;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(page.title);
  const [body, setBody] = useState(page.body);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("content_pages")
      .update({ title, body, updated_by: currentUserId })
      .eq("id", page.id);
    setBusy(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
    onSaved();
  }

  return (
    <form className="rounded-lg border border-slate-200 p-3" onSubmit={submit}>
      <label className="label" htmlFor={`cp-title-${page.id}`}>Title</label>
      <input id={`cp-title-${page.id}`} className="input mb-2" value={title} onChange={(e) => setTitle(e.target.value)} />
      <label className="label" htmlFor={`cp-body-${page.id}`}>Content</label>
      <textarea id={`cp-body-${page.id}`} rows={5} className="input text-xs" value={body} onChange={(e) => setBody(e.target.value)} />
      <div className="mt-2 flex items-center gap-2">
        <button type="submit" disabled={busy} className="btn-primary text-xs">
          {busy ? "Saving…" : "Save"}
        </button>
        {saved && <span className="text-xs font-semibold text-emerald-700">Saved</span>}
      </div>
      {error && <p className="mt-1 text-xs font-semibold text-rose-700">{error}</p>}
      <p className="mt-1 text-[11px] text-slate-400">Last updated {format(parseISO(page.updated_at), "d MMM yyyy")}</p>
    </form>
  );
}

function PrepInstructionEditor({
  bodyPart,
  existing,
  onSaved,
}: {
  bodyPart: string;
  existing: PrepInstructionRow | null;
  onSaved: () => void;
}) {
  const [text, setText] = useState(existing?.instructions ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: upsertError } = await supabase
      .from("prep_instructions")
      .upsert({ body_part: bodyPart, instructions: text }, { onConflict: "body_part" });
    setBusy(false);
    if (upsertError) {
      setError(upsertError.message);
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
    onSaved();
  }

  return (
    <form className="rounded-lg border border-slate-200 p-3" onSubmit={submit}>
      <p className="mb-1 text-sm font-bold text-navy">{bodyPart}</p>
      <textarea rows={2} className="input text-xs" placeholder="No special preparation needed…" value={text} onChange={(e) => setText(e.target.value)} />
      <div className="mt-2 flex items-center gap-2">
        <button type="submit" disabled={busy} className="btn-ghost text-xs">
          {busy ? "Saving…" : "Save"}
        </button>
        {saved && <span className="text-xs font-semibold text-emerald-700">Saved</span>}
      </div>
      {error && <p className="mt-1 text-xs font-semibold text-rose-700">{error}</p>}
    </form>
  );
}

function PriceEditor({
  bodyPart,
  existing,
  onSaved,
}: {
  bodyPart: string;
  existing: ScanPriceRow | null;
  onSaved: () => void;
}) {
  const [price, setPrice] = useState(existing?.price ?? 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: upsertError } = await supabase
      .from("scan_prices")
      .upsert({ body_part: bodyPart, price }, { onConflict: "body_part" });
    setBusy(false);
    if (upsertError) {
      setError(upsertError.message);
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 1200);
    onSaved();
  }

  return (
    <form className="rounded-lg border border-slate-200 p-2.5" onSubmit={submit}>
      <p className="text-xs font-semibold text-navy">{bodyPart}</p>
      <div className="mt-1 flex items-center gap-1.5">
        <span className="text-xs text-slate-500">$</span>
        <input
          type="number"
          min={0}
          step="0.01"
          className="input px-2 py-1 text-xs"
          value={price}
          onChange={(e) => setPrice(Number(e.target.value))}
        />
        <button type="submit" disabled={busy} className="btn-ghost px-2 py-1 text-xs">
          {busy ? "…" : "Save"}
        </button>
      </div>
      {saved && <span className="text-[11px] font-semibold text-emerald-700">Saved</span>}
      {error && <p className="mt-1 text-[11px] font-semibold text-rose-700">{error}</p>}
    </form>
  );
}

function AnnouncementsEditor({
  announcements,
  loading,
  onChanged,
}: {
  announcements: AnnouncementRow[] | null;
  loading: boolean;
  onChanged: () => void;
}) {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !message.trim()) return;
    setPosting(true);
    setPostError(null);
    const supabase = createClient();
    const { error } = await supabase
      .from("announcements")
      .insert({ title: title.trim(), message: message.trim(), active: true });
    setPosting(false);
    if (error) {
      setPostError(error.message);
      return;
    }
    setTitle("");
    setMessage("");
    onChanged();
  }

  return (
    <div>
      <form className="mb-4 grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-3" onSubmit={submit}>
        <input placeholder="Title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input placeholder="Message" className="input sm:col-span-1" value={message} onChange={(e) => setMessage(e.target.value)} />
        <button type="submit" disabled={posting} className="btn-primary text-xs">
          {posting ? "Posting…" : "Post announcement"}
        </button>
        {postError && <p className="text-xs font-semibold text-rose-700 sm:col-span-3">{postError}</p>}
      </form>
      {loading ? (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 size={14} className="animate-spin" aria-hidden /> Loading…
        </p>
      ) : !announcements || announcements.length === 0 ? (
        <EmptyState message="No announcements posted" />
      ) : (
        <ul className="divide-y divide-slate-100">
          {announcements.map((a) => (
            <AnnouncementRowItem key={a.id} announcement={a} onChanged={onChanged} />
          ))}
        </ul>
      )}
    </div>
  );
}

function AnnouncementRowItem({ announcement, onChanged }: { announcement: AnnouncementRow; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("announcements")
      .update({ active: !announcement.active })
      .eq("id", announcement.id);
    setBusy(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    onChanged();
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2.5">
      <div>
        <p className="text-sm font-semibold text-navy">{announcement.title}</p>
        <p className="text-xs text-slate-500">{announcement.message}</p>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={toggle}
          className={`chip ${announcement.active ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"}`}
        >
          {announcement.active ? "Active" : "Hidden"}
        </button>
        {error && <span className="text-[11px] font-semibold text-rose-700">{error}</span>}
      </div>
    </li>
  );
}
