"use client";

import React, { useState } from "react";
import { MessageSquare, Users2 } from "lucide-react";
import { useStore } from "@/frontend/lib/store";
import { EmptyState, SectionTitle } from "@/frontend/components/shared/ui";
import { MessageThreadView } from "@/frontend/components/shared/Messaging";

/**
 * Shared by technician/radiologist/admin dashboards: patient<->staff
 * messaging (FR41, any staff member can pick up any patient thread — real
 * clinics route to whoever's available, not one fixed assignee) and the
 * single internal staff channel (FR43).
 */
export default function StaffMessagingPanel() {
  const store = useStore();
  const patientThreads = store.messageThreads.filter((t) => t.kind === "patient");
  const internalThread = store.messageThreads.find((t) => t.kind === "internal");
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(patientThreads[0]?.patient_id ?? null);

  const selectedThread = patientThreads.find((t) => t.patient_id === selectedPatientId);
  const selectedMessages = selectedThread ? store.messages.filter((m) => m.thread_id === selectedThread.id) : [];
  const internalMessages = internalThread ? store.messages.filter((m) => m.thread_id === internalThread.id) : [];

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section id="patient-messages" className="card p-5 sm:p-6">
        <SectionTitle icon={MessageSquare} title="Patient messages" subtitle="Secure messaging with patients (FR41)" />
        {patientThreads.length === 0 ? (
          <EmptyState message="No patient conversations yet" />
        ) : (
          <>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {patientThreads.map((t) => {
                const patient = store.profiles.find((p) => p.id === t.patient_id);
                const active = t.patient_id === selectedPatientId;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedPatientId(t.patient_id)}
                    className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
                      active ? "bg-medical text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {patient?.full_name ?? "Unknown patient"}
                  </button>
                );
              })}
            </div>
            {selectedThread && (
              <MessageThreadView
                messages={selectedMessages}
                onSend={(body) => store.sendPatientMessage(selectedThread.patient_id as string, body)}
                placeholder="Reply to patient…"
                emptyHint="Replies here are visible to the patient immediately."
              />
            )}
          </>
        )}
      </section>

      <section id="internal-messages" className="card p-5 sm:p-6">
        <SectionTitle icon={Users2} title="Staff channel" subtitle="Internal messaging between technicians, radiologists, and admin (FR43)" />
        <MessageThreadView
          messages={internalMessages}
          onSend={(body) => store.sendInternalMessage(body)}
          placeholder="Message the team…"
          emptyHint="Visible to every technician, radiologist, and admin."
        />
      </section>
    </div>
  );
}
