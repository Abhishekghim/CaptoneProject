import { NextRequest, NextResponse } from "next/server";
import { buildSystemPrompt } from "@/backend/lib/assistant/prompts";
import type { AssistantChatMessage, AssistantRequestBody, AssistantRole } from "@/shared/assistant/types";

// TEMPORARY security note: this route enforces shape/size limits and rate
// limiting, and — most importantly — only ever sees the pre-filtered
// `contextSummary` string the client built via frontend/lib/assistant/scope.ts, never
// raw store data. But it has no way to verify `role`/`userId` are telling
// the truth, because this app has no real server-side session yet (see
// lib/auth/SessionContext.tsx — local-only auth, nothing sent to the
// server). Real enforcement requires wiring the Supabase auth already
// scaffolded in lib/supabase/: read the user from the session cookie here,
// look up their role/allowed IDs server-side, and build contextSummary from
// a DB query instead of trusting the client. Until then this matches the
// rest of the app's current (documented) security posture, not a
// production-ready boundary.

const ALLOWED_ROLES: AssistantRole[] = ["public", "patient", "technician", "radiologist", "referring_doctor", "admin"];
const MAX_MESSAGE_LENGTH = 2000;
const MAX_CONTEXT_LENGTH = 8000;
const MAX_HISTORY = 6;
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

// Best-effort in-memory rate limit. Resets on server restart and doesn't
// share state across multiple server instances — fine for a single demo
// process, not a substitute for a real shared limiter in production.
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT_MAX = 20;
const requestLog = new Map<string, number[]>();

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const timestamps = (requestLog.get(key) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  timestamps.push(now);
  requestLog.set(key, timestamps);
  return timestamps.length > RATE_LIMIT_MAX;
}

function auditLog(entry: Record<string, unknown>) {
  // No server-side datastore in this demo (the real destination is the
  // Supabase `audit_logs` table described in README.md). Console only here;
  // the client separately writes a matching entry into the in-app audit log
  // via store.logAssistantAction() so admins can see it in the Audit Log
  // panel for authenticated roles.
  console.log("[assistant-audit]", JSON.stringify({ ts: new Date().toISOString(), ...entry }));
}

export async function POST(req: NextRequest) {
  let body: AssistantRequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { role, userId, message, history, contextSummary } = body ?? ({} as AssistantRequestBody);

  if (!role || !ALLOWED_ROLES.includes(role)) {
    return NextResponse.json({ error: "Unknown or missing role." }, { status: 400 });
  }
  if (typeof message !== "string" || !message.trim() || message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json({ error: "Invalid message." }, { status: 400 });
  }
  if (typeof contextSummary !== "string" || contextSummary.length > MAX_CONTEXT_LENGTH) {
    return NextResponse.json({ error: "Invalid context." }, { status: 400 });
  }

  const rateKey = userId || req.headers.get("x-forwarded-for") || "anonymous";
  if (isRateLimited(rateKey)) {
    auditLog({ userId, role, outcome: "refused", reason: "rate_limited" });
    return NextResponse.json({
      reply: "You've sent a lot of messages in a short time — please wait a moment and try again.",
      refused: true,
    });
  }

  const trimmedHistory: AssistantChatMessage[] = Array.isArray(history)
    ? history
        .slice(-MAX_HISTORY)
        .filter((m): m is AssistantChatMessage => (m?.role === "user" || m?.role === "assistant") && typeof m?.content === "string")
        .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_LENGTH) }))
    : [];

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    auditLog({ userId, role, outcome: "not_configured" });
    return NextResponse.json({
      reply: "The AI assistant isn't connected yet — once an API key is configured on the server, I'll be able to help with things in your authorized scope.",
    });
  }

  const systemPrompt = buildSystemPrompt(role, contextSummary);

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.3,
        max_tokens: 500,
        messages: [
          { role: "system", content: systemPrompt },
          ...trimmedHistory,
          { role: "user", content: message },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      auditLog({ userId, role, outcome: "error", detail: errText.slice(0, 300) });
      return NextResponse.json(
        { reply: "Sorry, the assistant hit an error. Please try again shortly.", refused: true },
        { status: 502 }
      );
    }

    const data = await res.json();
    const reply: string = data?.choices?.[0]?.message?.content?.trim() || "Sorry, I couldn't generate a response.";

    auditLog({ userId, role, outcome: "answered", messageLength: message.length });
    return NextResponse.json({ reply });
  } catch (err) {
    auditLog({ userId, role, outcome: "error", detail: String(err).slice(0, 300) });
    return NextResponse.json(
      { reply: "Sorry, the assistant is temporarily unavailable.", refused: true },
      { status: 502 }
    );
  }
}
