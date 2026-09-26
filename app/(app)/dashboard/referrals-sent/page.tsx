"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { Loader2, Send } from "lucide-react";
import { useStore } from "@/frontend/lib/store";
import { EmptyState, SectionTitle } from "@/frontend/components/shared/ui";
import { useAppointments } from "@/frontend/lib/hooks/useAppointments";
import { useMyDoctorReferrals } from "@/frontend/components/referring-doctor/hooks";

// "Referrals I've sent" (see app/(app)/dashboard/page.tsx's redirect and
// Shell.tsx's referring_doctor nav). Re-fetches its own list on mount, so
// it needs no signal from /dashboard/refer to stay current.
export default function ReferralsSentPage() {
  const store = useStore();
  const me = store.currentUser;
  const { effectiveRole } = store;
  const router = useRouter();

  useEffect(() => {
    if (effectiveRole !== "referring_doctor") router.replace("/dashboard");
  }, [effectiveRole, router]);

  const { data: appointmentsData } = useAppointments();
  const { referrals: myDoctorReferrals, loadError: myDoctorReferralsError } = useMyDoctorReferrals(me.id);

  if (effectiveRole !== "referring_doctor") return null;

  return (
    <div className="mx-auto max-w-6xl space-y-10">
      <section id="referrals-sent" className="card p-5 sm:p-6">
        <SectionTitle
          icon={Send}
          title="Referrals I've sent"
          subtitle="Patients you've referred, whether or not they've booked yet"
        />
        {myDoctorReferralsError && (
          <p role="alert" className="mb-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
            Could not load your referrals: {myDoctorReferralsError}
          </p>
        )}
        {myDoctorReferrals === null ? (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 size={14} className="animate-spin" aria-hidden /> Loading…
          </p>
        ) : myDoctorReferrals.length === 0 ? (
          <EmptyState
            message="No referrals sent yet"
            hint="Use the Refer a patient page to refer someone — they'll see it waiting for them the moment they have an account."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {myDoctorReferrals.map((r) => {
              const appointment = r.used_in_appointment_id
                ? (appointmentsData ?? []).find((a) => a.id === r.used_in_appointment_id)
                : undefined;
              return (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div>
                    <p className="font-semibold text-navy">
                      {r.patient_full_name} — {r.body_part}
                    </p>
                    <p className="text-xs text-slate-500">
                      {r.patient_email}
                      {r.patient_dob && ` · DOB ${format(parseISO(r.patient_dob), "d MMM yyyy")}`}
                    </p>
                    {r.notes && <p className="mt-1 text-xs text-slate-500">&ldquo;{r.notes}&rdquo;</p>}
                  </div>
                  {appointment ? (
                    <span className="chip bg-emerald-100 text-emerald-800">
                      Booked — {format(parseISO(appointment.date), "d MMM yyyy")}
                    </span>
                  ) : r.patient_id ? (
                    <span className="chip bg-sky-100 text-sky-800">Waiting for patient to book</span>
                  ) : (
                    <span className="chip bg-slate-200 text-slate-700">Awaiting patient sign-up</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
