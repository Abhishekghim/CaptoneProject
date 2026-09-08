"use client";

import React, { useState } from "react";
import { format, parseISO } from "date-fns";
import { Send } from "lucide-react";
import { useStore } from "@/lib/store";
import type { Message } from "@/lib/types";
import { EmptyState } from "@/components/shared/ui";

/** Shared message-list + composer, used for both patient<->staff (FR41) and internal staff<->staff (FR43) threads. */
export function MessageThreadView({
  messages,
  onSend,
  placeholder,
  emptyHint,
}: {
  messages: Message[];
  onSend: (body: string) => void;
  placeholder: string;
  emptyHint: string;
}) {
  const store = useStore();
  const [draft, setDraft] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    onSend(draft.trim());
    setDraft("");
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="max-h-72 space-y-3 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-3">
        {messages.length === 0 ? (
          <EmptyState message="No messages yet" hint={emptyHint} />
        ) : (
          messages.map((m) => {
            const mine = m.sender_id === store.currentUser.id;
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${mine ? "bg-medical text-white" : "bg-white text-navy shadow-sm"}`}>
                  {!mine && <p className="mb-0.5 text-[11px] font-semibold text-slate-500">{m.sender_name}</p>}
                  <p className="whitespace-pre-wrap">{m.body}</p>
                  <p className={`mt-1 text-[10px] ${mine ? "text-white/70" : "text-slate-400"}`}>
                    {format(parseISO(m.created_at), "d MMM, h:mm a")}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>
      <form onSubmit={submit} className="flex gap-2">
        <label className="sr-only" htmlFor="message-composer">{placeholder}</label>
        <input
          id="message-composer"
          className="input flex-1"
          placeholder={placeholder}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="submit" className="btn-primary shrink-0 px-3" disabled={!draft.trim()}>
          <Send size={16} aria-hidden />
        </button>
      </form>
    </div>
  );
}
