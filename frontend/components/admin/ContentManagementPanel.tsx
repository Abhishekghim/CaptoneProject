"use client";

import React, { useState } from "react";
import { format, parseISO } from "date-fns";
import { Bell, DollarSign, FileEdit, Megaphone } from "lucide-react";
import { useStore } from "@/frontend/lib/store";
import { BODY_PARTS } from "@/frontend/lib/seed";
import type { ContentPageId } from "@/shared/types";
import { EmptyState, SectionTitle } from "@/frontend/components/shared/ui";

export default function ContentManagementPanel() {
  const store = useStore();

  return (
    <section id="content-management" className="card space-y-6 p-5 sm:p-6">
      <div>
        <SectionTitle icon={FileEdit} title="Site content" subtitle="About / Contact / FAQ text shown in the patient portal (FR75)" />
        <div className="grid gap-4 md:grid-cols-3">
          {store.contentPages.map((page) => (
            <ContentPageEditor key={page.id} pageId={page.id} />
          ))}
        </div>
      </div>

      <div className="border-t border-slate-100 pt-5">
        <SectionTitle icon={Bell} title="MRI prep instructions" subtitle="Per-scan patient preparation text (FR76)" />
        <div className="grid gap-3 md:grid-cols-2">
          {BODY_PARTS.map((bp) => (
            <PrepInstructionEditor key={bp} bodyPart={bp} />
          ))}
        </div>
      </div>

      <div className="border-t border-slate-100 pt-5">
        <SectionTitle icon={DollarSign} title="Service pricing" subtitle="Editable per-scan pricing (FR77)" />
        <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-4">
          {BODY_PARTS.map((bp) => (
            <PriceEditor key={bp} bodyPart={bp} />
          ))}
        </div>
      </div>

      <div className="border-t border-slate-100 pt-5">
        <SectionTitle icon={Megaphone} title="Announcements" subtitle="Alerts shown on the patient portal (FR78)" />
        <AnnouncementsEditor />
      </div>
    </section>
  );
}

function ContentPageEditor({ pageId }: { pageId: ContentPageId }) {
  const store = useStore();
  const page = store.contentPages.find((p) => p.id === pageId);
  const [title, setTitle] = useState(page?.title ?? "");
  const [body, setBody] = useState(page?.body ?? "");
  const [saved, setSaved] = useState(false);

  if (!page) return null;

  return (
    <form
      className="rounded-lg border border-slate-200 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        store.updateContentPage(pageId, { title, body });
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
      }}
    >
      <label className="label" htmlFor={`cp-title-${pageId}`}>Title</label>
      <input id={`cp-title-${pageId}`} className="input mb-2" value={title} onChange={(e) => setTitle(e.target.value)} />
      <label className="label" htmlFor={`cp-body-${pageId}`}>Content</label>
      <textarea id={`cp-body-${pageId}`} rows={5} className="input text-xs" value={body} onChange={(e) => setBody(e.target.value)} />
      <div className="mt-2 flex items-center gap-2">
        <button type="submit" className="btn-primary text-xs">Save</button>
        {saved && <span className="text-xs font-semibold text-emerald-700">Saved</span>}
      </div>
      <p className="mt-1 text-[11px] text-slate-400">Last updated {format(parseISO(page.updated_at), "d MMM yyyy")}</p>
    </form>
  );
}

function PrepInstructionEditor({ bodyPart }: { bodyPart: string }) {
  const store = useStore();
  const existing = store.prepInstructions.find((p) => p.body_part === bodyPart);
  const [text, setText] = useState(existing?.instructions ?? "");
  const [saved, setSaved] = useState(false);

  return (
    <form
      className="rounded-lg border border-slate-200 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        store.updatePrepInstruction(bodyPart, text);
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
      }}
    >
      <p className="mb-1 text-sm font-bold text-navy">{bodyPart}</p>
      <textarea rows={2} className="input text-xs" placeholder="No special preparation needed…" value={text} onChange={(e) => setText(e.target.value)} />
      <div className="mt-2 flex items-center gap-2">
        <button type="submit" className="btn-ghost text-xs">Save</button>
        {saved && <span className="text-xs font-semibold text-emerald-700">Saved</span>}
      </div>
    </form>
  );
}

function PriceEditor({ bodyPart }: { bodyPart: string }) {
  const store = useStore();
  const [price, setPrice] = useState(store.scanPrices[bodyPart] ?? 0);
  const [saved, setSaved] = useState(false);

  return (
    <form
      className="rounded-lg border border-slate-200 p-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        store.updateScanPrice(bodyPart, price);
        setSaved(true);
        setTimeout(() => setSaved(false), 1200);
      }}
    >
      <p className="text-xs font-semibold text-navy">{bodyPart}</p>
      <div className="mt-1 flex items-center gap-1.5">
        <span className="text-xs text-slate-500">$</span>
        <input type="number" min={0} step="0.01" className="input px-2 py-1 text-xs" value={price} onChange={(e) => setPrice(Number(e.target.value))} />
        <button type="submit" className="btn-ghost px-2 py-1 text-xs">Save</button>
      </div>
      {saved && <span className="text-[11px] font-semibold text-emerald-700">Saved</span>}
    </form>
  );
}

function AnnouncementsEditor() {
  const store = useStore();
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");

  return (
    <div>
      <form
        className="mb-4 grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim() || !message.trim()) return;
          store.addAnnouncement(title.trim(), message.trim());
          setTitle("");
          setMessage("");
        }}
      >
        <input placeholder="Title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input placeholder="Message" className="input sm:col-span-1" value={message} onChange={(e) => setMessage(e.target.value)} />
        <button type="submit" className="btn-primary text-xs">Post announcement</button>
      </form>
      {store.announcements.length === 0 ? (
        <EmptyState message="No announcements posted" />
      ) : (
        <ul className="divide-y divide-slate-100">
          {store.announcements.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <div>
                <p className="text-sm font-semibold text-navy">{a.title}</p>
                <p className="text-xs text-slate-500">{a.message}</p>
              </div>
              <button
                type="button"
                onClick={() => store.toggleAnnouncement(a.id)}
                className={`chip ${a.active ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"}`}
              >
                {a.active ? "Active" : "Hidden"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
