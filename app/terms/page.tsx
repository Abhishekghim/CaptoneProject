import Link from "next/link";
import { Activity } from "lucide-react";

export const metadata = { title: "Terms of Service — Capital Radiology" };

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="mb-6 flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-medical">
            <Activity size={18} className="text-white" aria-hidden />
          </div>
          <span className="text-sm font-bold text-navy">Capital Radiology</span>
        </Link>

        <div className="card space-y-6 p-6 sm:p-8">
          <div>
            <h1 className="text-2xl font-bold text-navy">Terms of Service</h1>
            <p className="mt-1 text-sm text-slate-500">Last updated: {new Date().getFullYear()}</p>
          </div>

          <Section title="The service">
            Capital Radiology's online portal lets patients book MRI appointments, manage their health profile,
            view results and billing, and communicate with clinic staff; it lets referring doctors track
            referrals and view their patients' reports; and it lets clinic staff manage scans, reports,
            equipment, and operations.
          </Section>

          <Section title="Your account">
            You are responsible for keeping your login credentials confidential and for the accuracy of the
            information you provide, including your medical history and safety checklist answers, which
            directly affect the safety of your scan.
          </Section>

          <Section title="Appointments and cancellations">
            Appointments can be rescheduled or cancelled from your dashboard up until the appointment begins.
            Repeated late cancellations or no-shows may be subject to clinic policy at the discretion of
            administration.
          </Section>

          <Section title="Medical disclaimer">
            This portal facilitates scheduling and delivery of imaging services; it does not provide medical
            advice. Radiology reports are produced by a qualified radiologist and should be discussed with
            your referring doctor or treating clinician.
          </Section>

          <Section title="Referring doctors">
            Referring-doctor accounts are provisioned after a verification request is reviewed by clinic
            administration. A referring doctor may view reports and referral status only for patients they
            have referred or who have named them as their referring doctor.
          </Section>

          <Section title="Changes to these terms">
            We may update these terms from time to time; continued use of the portal after a change
            constitutes acceptance of the updated terms. Material changes will be announced on the patient
            portal.
          </Section>

          <Section title="Contact">
            Questions about these terms can be directed to our clinic administration team via the{" "}
            <Link href="/#contact" className="font-semibold text-medical hover:underline">contact page</Link>.
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-sm font-bold uppercase tracking-wide text-medical">{title}</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-slate-700">{children}</p>
    </section>
  );
}
