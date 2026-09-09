"use client";

import React, { useEffect, useRef, useState } from "react";
import { Send, Sparkles, Trash2, X } from "lucide-react";
import { ROLE_LABEL } from "@/backend/lib/assistant/prompts";
import type { AssistantChatMessage, AssistantResponseBody, AssistantRole } from "@/shared/assistant/types";

interface AssistantWidgetProps {
  role: AssistantRole;
  userId: string | null;
  contextSummary: string;
  quickActions: string[];
  title?: string;
  onExchange?: (userMessage: string, reply: string, refused: boolean) => void;
}

export default function AssistantWidget({
  role,
  userId,
  contextSummary,
  quickActions,
  title = "Capital Radiology Assistant",
  onExchange,
}: AssistantWidgetProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<AssistantChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    const userMsg: AssistantChatMessage = { role: "user", content: trimmed };
    const historyForRequest = messages.slice(-6);
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setSending(true);

    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, userId, message: trimmed, history: historyForRequest, contextSummary }),
      });
      const data: AssistantResponseBody = await res.json();
      const reply = data.reply || "Sorry, I couldn't generate a response.";
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
      onExchange?.(trimmed, reply, Boolean(data.refused));
    } catch {
      const reply = "Sorry, something went wrong reaching the assistant. Please try again.";
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
      onExchange?.(trimmed, reply, true);
    } finally {
      setSending(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    send(input);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="assistant-panel"
        aria-label={open ? "Close assistant" : "Open assistant"}
        className="fixed bottom-6 right-6 z-50 grid h-14 w-14 place-items-center rounded-full bg-medical text-white shadow-lg transition hover:bg-medical-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-medical"
      >
        {open ? <X size={22} aria-hidden /> : <Sparkles size={22} aria-hidden />}
      </button>

      {open && (
        <div
          id="assistant-panel"
          role="dialog"
          aria-label={title}
          className="fixed bottom-24 right-6 z-50 flex h-[32rem] max-h-[75vh] w-[22rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        >
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-navy px-4 py-3">
            <div>
              <p className="text-sm font-bold text-white">{title}</p>
              <p className="text-[11px] text-slate-300">{ROLE_LABEL[role] ?? role} &middot; scoped to your data</p>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setMessages([])}
                aria-label="Clear session"
                title="Clear session"
                className="rounded-md p-1.5 text-slate-300 transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                <Trash2 size={15} aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close assistant"
                className="rounded-md p-1.5 text-slate-300 transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                <X size={16} aria-hidden />
              </button>
            </div>
          </div>

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {messages.length === 0 && (
              <div className="space-y-3">
                <p className="text-sm text-slate-500">
                  Ask me about {role === "public" ? "our MRI services, locations or how booking works" : "things in your authorized scope"}.
                </p>
                {quickActions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {quickActions.map((qa) => (
                      <button
                        key={qa}
                        type="button"
                        onClick={() => send(qa)}
                        className="rounded-full border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:border-medical hover:text-medical focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-medical"
                      >
                        {qa}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm leading-relaxed ${
                    m.role === "user" ? "bg-medical text-white" : "bg-slate-100 text-navy"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}

            {sending && (
              <div className="flex justify-start">
                <div className="rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-500">Thinking&hellip;</div>
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="border-t border-slate-100 p-3">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(input);
                  }
                }}
                rows={1}
                placeholder="Ask a question…"
                aria-label="Message"
                className="input max-h-24 flex-1 resize-none overflow-y-auto py-2"
              />
              <button
                type="submit"
                disabled={sending || !input.trim()}
                aria-label="Send message"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-medical text-white transition hover:bg-medical-dark disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-medical"
              >
                <Send size={15} aria-hidden />
              </button>
            </div>
            <p className="mt-2 text-[10px] leading-snug text-slate-400">
              Responses are supportive only, not a diagnosis, and don&rsquo;t replace clinician review.
            </p>
          </form>
        </div>
      )}
    </>
  );
}
