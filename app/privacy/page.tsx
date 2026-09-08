import Link from "next/link";
import { Activity } from "lucide-react";

export const metadata = { title: "Privacy Policy — Capital Radiology" };

export default function PrivacyPage() {
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
            <h1 className="text-2xl font-bold text-navy">Privacy Policy</h1>
            <p className="mt-1 text-sm text-slate-500">Last updated: {new Date().getFullYear()}</p>
          </div>

          <Section title="What we collect">
            When you register or book an appointment, we collect your name, date of birth, contact details,
            medical history relevant to your scan (including implants, allergies, and contraindications),
            referral documents, imaging studies, and radiology reports. When you make a payment, we record
            billing and, where applicable, insurance claim details.
          </Section>

          <Section title="Why we collect it">
            This information is used solely to schedule and perform your MRI examination, produce and share
            your radiology report with you and your referring doctor, process payment, and meet our legal and
            clinical record-keeping obligations. We do not sell or use your health information for advertising.
          </Section>

          <Section title="Who can see it">
            Access is role-restricted: your treating technician and radiologist can see what's needed to
            perform and report your scan; billing staff can see payment information; your referring doctor (if
            any) can see your finalized report; administrators can see operational data needed to run the
            clinic. Every access is logged for audit purposes.
          </Section>

          <Section title="How it's protected">
            Data is encrypted in transit (HTTPS) and at rest, protected by role-based access controls, and all
            sensitive actions are recorded in an append-only audit trail retained for at least 12 months for
            compliance review.
          </Section>

          <Section title="Your rights">
            You may request a copy of your data, correct inaccurate information via your profile, or request
            deletion of your account and associated data at any time from your dashboard's "Privacy & your
            data" section. Deletion requests are reviewed by our team before being carried out, since some
            health records are subject to retention requirements under applicable regulations.
          </Section>

          <Section title="Contact">
            Questions about this policy or your data can be directed to our clinic administration team via the
            contact details on our{" "}
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
