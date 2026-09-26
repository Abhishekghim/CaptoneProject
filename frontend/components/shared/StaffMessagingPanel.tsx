"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Loader2, MessageSquare, Users2 } from "lucide-react";
import { createClient } from "@/frontend/lib/supabase/client";
import { EmptyState, SectionTitle } from "@/frontend/components/shared/ui";
import { MessageThreadView } from "@/frontend/components/shared/Messaging";
import type { Message } from "@/shared/types";

/**
 * Shared by technician/radiologist/admin/reception dashboards: patient<->staff
 * messaging (FR41, any staff member can pick up any patient thread — real
 * clinics route to whoever's available, not one fixed assignee) and the
 * single internal staff channel (FR43).
 *
 * Reads/writes real Supabase tables (backend/database/022_messaging.sql,
 * 023_messaging_rpcs.sql) instead of the mock store's messageThreads/
 * messages/sendPatientMessage/sendInternalMessage. Thread/message creation
 * has no client-facing insert policy, so every send goes through the
 * send_patient_message / send_internal_message RPCs.
 */
type PatientThreadRow = { id: string; patient_id: string; patient_name: string };

function usePatientThreads() {
  const [threads, setThreads] = useState<PatientThreadRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: threadRows, error: threadError } = await supabase
      .from("message_threads")
      .select("id, patient_id")
      .eq("kind", "patient")
      .order("created_at", { ascending: false });
    if (threadError) {
      setLoadError(threadError.message);
      return;
    }
    const rows = (threadRows ?? []) as { id: string; patient_id: string }[];
    if (rows.length === 0) {
      setLoadError(null);
      setThreads([]);
      return;
    }

    const patientIds = rows.map((t) => t.patient_id);
    const { data: profileRows, error: profileError } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", patientIds);
    if (profileError) {
      setLoadError(profileError.message);
      return;
    }
    const nameById = new Map((profileRows ?? []).map((p) => [p.id as string, p.full_name as string]));

    setLoadError(null);
    setThreads(
      rows.map((t) => ({ id: t.id, patient_id: t.patient_id, patient_name: nameById.get(t.patient_id) ?? "Unknown patient" }))
    );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { threads, loadError, reload: load };
}

// null = still loading, [] = loaded, no messages yet. Also doubles as the
// internal thread's message loader (pass its thread id).
function useThreadMessages(threadId: string | null) {
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!threadId) {
      setLoadError(null);
      setMessages([]);
      return;
    }
    const supabase = createClient();
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });
    if (error) {
      setLoadError(error.message);
      return;
    }
    setLoadError(null);
    setMessages((data ?? []) as Message[]);
  }, [threadId]);

  useEffect(() => {
    load();
  }, [load]);

  return { messages, loadError, reload: load };
}

// undefined = still loading, null = no internal thread has been created yet
// (nobody has sent an internal message).
function useInternalThreadId() {
  const [threadId, setThreadId] = useState<string | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase.from("message_threads").select("id").eq("kind", "internal").maybeSingle();
    if (error) {
      setLoadError(error.message);
      return;
    }
    setLoadError(null);
    setThreadId(data?.id ?? null);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { threadId, loadError, reload: load };
}

export default function StaffMessagingPanel() {
  const { threads: patientThreadsData, loadError: patientThreadsError } = usePatientThreads();
  const patientThreads = patientThreadsData ?? [];
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);

  useEffect(() => {
    if (selectedThreadId === null && patientThreads.length > 0) {
      setSelectedThreadId(patientThreads[0].id);
    }
  }, [patientThreads, selectedThreadId]);

  const selectedThread = patientThreads.find((t) => t.id === selectedThreadId) ?? null;
  const {
    messages: selectedMessagesData,
    loadError: selectedMessagesError,
    reload: reloadSelectedMessages,
  } = useThreadMessages(selectedThread?.id ?? null);
  const [sendToPatientError, setSendToPatientError] = useState<string | null>(null);

  const { threadId: internalThreadId, loadError: internalThreadError } = useInternalThreadId();
  const {
    messages: internalMessagesData,
    loadError: internalMessagesError,
    reload: reloadInternalMessages,
  } = useThreadMessages(internalThreadId ?? null);
  const [sendInternalError, setSendInternalError] = useState<string | null>(null);

  async function sendToPatient(body: string) {
    if (!selectedThread) return;
    const supabase = createClient();
    const { error } = await supabase.rpc("send_patient_message", { p_patient_id: selectedThread.patient_id, p_body: body });
    if (error) {
      setSendToPatientError(error.message);
      return;
    }
    setSendToPatientError(null);
    reloadSelectedMessages();
  }

  async function sendInternal(body: string) {
    const supabase = createClient();
    const { error } = await supabase.rpc("send_internal_message", { p_body: body });
    if (error) {
      setSendInternalError(error.message);
      return;
    }
    setSendInternalError(null);
    reloadInternalMessages();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section id="patient-messages" className="card p-5 sm:p-6">
        <SectionTitle icon={MessageSquare} title="Patient messages" subtitle="Secure messaging with patients (FR41)" />
        {patientThreadsError && (
          <p role="alert" className="mb-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
            Could not load patient conversations: {patientThreadsError}
          </p>
        )}
        {patientThreadsData === null ? (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 size={14} className="animate-spin" aria-hidden /> Loading…
          </p>
        ) : patientThreads.length === 0 ? (
          <EmptyState message="No patient conversations yet" />
        ) : (
          <>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {patientThreads.map((t) => {
                const active = t.id === selectedThreadId;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedThreadId(t.id)}
                    className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
                      active ? "bg-medical text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {t.patient_name}
                  </button>
                );
              })}
            </div>
            {selectedMessagesError && (
              <p role="alert" className="mb-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
                Could not load messages: {selectedMessagesError}
              </p>
            )}
            {sendToPatientError && (
              <p role="alert" className="mb-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
                Could not send: {sendToPatientError}
              </p>
            )}
            {selectedThread && (
              <MessageThreadView
                messages={selectedMessagesData ?? []}
                onSend={sendToPatient}
                placeholder="Reply to patient…"
                emptyHint="Replies here are visible to the patient immediately."
              />
            )}
          </>
        )}
      </section>

      <section id="internal-messages" className="card p-5 sm:p-6">
        <SectionTitle icon={Users2} title="Staff channel" subtitle="Internal messaging between technicians, radiologists, and admin (FR43)" />
        {internalThreadError && (
          <p role="alert" className="mb-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
            Could not load the staff channel: {internalThreadError}
          </p>
        )}
        {internalMessagesError && (
          <p role="alert" className="mb-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
            Could not load messages: {internalMessagesError}
          </p>
        )}
        {sendInternalError && (
          <p role="alert" className="mb-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
            Could not send: {sendInternalError}
          </p>
        )}
        <MessageThreadView
          messages={internalMessagesData ?? []}
          onSend={sendInternal}
          placeholder="Message the team…"
          emptyHint="Visible to every technician, radiologist, and admin."
        />
      </section>
    </div>
  );
}
