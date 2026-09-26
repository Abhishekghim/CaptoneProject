"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare } from "lucide-react";
import { useStore } from "@/frontend/lib/store";
import { createClient } from "@/frontend/lib/supabase/client";
import type { Message } from "@/shared/types";
import { MessageThreadView } from "@/frontend/components/shared/Messaging";
import AnnouncementsBanner from "@/frontend/components/patient/AnnouncementsBanner";
import { SectionTitle } from "@/frontend/components/shared/ui";
import StaffMessagingPanel from "@/frontend/components/shared/StaffMessagingPanel";

/* ------------------------------------------------------------------ */
/* Messages (FR41) — real message_threads/messages read, replacing the */
/* mock store's messageThreads/messages/sendPatientMessage (see        */
/* backend/database/022_messaging.sql, 023_messaging_rpcs.sql). Two-   */
/* step query (thread, then its messages) rather than a nested embed —*/
/* same pragmatic reasoning as useMyFinalReports and                   */
/* TechnicianPortal's useTodaysQueue. null = still loading.            */
/* ------------------------------------------------------------------ */
function useMyMessages(patientId: string) {
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: thread, error: threadError } = await supabase
      .from("message_threads")
      .select("id")
      .eq("kind", "patient")
      .eq("patient_id", patientId)
      .maybeSingle();
    if (threadError) {
      setLoadError(threadError.message);
      return;
    }
    if (!thread) {
      setLoadError(null);
      setMessages([]);
      return;
    }
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("thread_id", thread.id)
      .order("created_at", { ascending: true });
    if (error) {
      setLoadError(error.message);
      return;
    }
    setLoadError(null);
    setMessages((data ?? []) as Message[]);
  }, [patientId]);

  useEffect(() => {
    load();
  }, [load]);

  return { messages, loadError, reload: load };
}

// Shared route: /dashboard/messages is patient's care-team messaging AND
// admin/super_admin's staff messaging panel — branches on effectiveRole the
// same way /dashboard/appointments and /dashboard/billing do. Patient's
// branch below is unchanged from before this split.
export default function MessagesPage() {
  const { effectiveRole, currentUser } = useStore();
  const router = useRouter();

  useEffect(() => {
    if (effectiveRole !== "patient" && effectiveRole !== "admin" && effectiveRole !== "super_admin") {
      router.replace("/dashboard");
    }
  }, [effectiveRole, router]);

  const { messages: myMessagesData, loadError: myMessagesError, reload: reloadMyMessages } = useMyMessages(currentUser.id);
  const [sendMessageError, setSendMessageError] = useState<string | null>(null);

  async function sendMessageToClinic(body: string) {
    const supabase = createClient();
    const { error } = await supabase.rpc("send_patient_message", { p_patient_id: currentUser.id, p_body: body });
    if (error) {
      setSendMessageError(error.message);
      return;
    }
    setSendMessageError(null);
    reloadMyMessages();
  }

  if (effectiveRole === "admin" || effectiveRole === "super_admin") {
    return (
      <div className="mx-auto max-w-7xl">
        <StaffMessagingPanel />
      </div>
    );
  }

  if (effectiveRole !== "patient") return null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <AnnouncementsBanner />

      <section className="card p-5 sm:p-6">
        <SectionTitle icon={MessageSquare} title="Messages" subtitle="Secure messaging with your care team (FR41)" />
        {myMessagesError && (
          <p role="alert" className="mb-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
            Could not load your messages: {myMessagesError}
          </p>
        )}
        {sendMessageError && (
          <p role="alert" className="mb-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
            Could not send: {sendMessageError}
          </p>
        )}
        <MessageThreadView
          messages={myMessagesData ?? []}
          onSend={sendMessageToClinic}
          placeholder="Message the clinic…"
          emptyHint="A technician, radiologist, or admin can reply here."
        />
      </section>
    </div>
  );
}
