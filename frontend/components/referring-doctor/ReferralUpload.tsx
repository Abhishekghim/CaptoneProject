"use client";

import { useRef, useState } from "react";
import { FileUp } from "lucide-react";
import { useStore } from "@/frontend/lib/store";
import { uploadToBucket } from "@/frontend/lib/storage";
import { createClient } from "@/frontend/lib/supabase/client";

export default function ReferralUpload({ appointmentId, onUploaded }: { appointmentId: string; onUploaded: () => void }) {
  const store = useStore();
  const me = store.currentUser;
  const [file, setFile] = useState<File | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function upload() {
    if (!file) return;
    setUploading(true);
    setError(null);
    const result = await uploadToBucket("referrals", file, me.id);
    if (!result.ok) {
      setUploading(false);
      setError(result.error);
      return;
    }
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("appointments")
      .update({ referral_url: result.path })
      .eq("id", appointmentId);
    setUploading(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setDone(true);
    setTimeout(() => setDone(false), 2500);
    if (fileRef.current) fileRef.current.value = "";
    setFile(null);
    onUploaded();
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
      <input
        ref={fileRef}
        type="file"
        accept=".pdf,image/*"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="text-xs text-slate-600 file:mr-2 file:rounded-md file:border-0 file:bg-medical-light file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-medical hover:file:bg-sky-100"
      />
      <button type="button" onClick={upload} disabled={!file || uploading} className="btn-ghost text-xs disabled:opacity-50">
        <FileUp size={13} aria-hidden /> {uploading ? "Uploading…" : "Upload / update referral"}
      </button>
      {done && <span className="text-xs font-semibold text-emerald-700">Referral uploaded to secure storage.</span>}
      {error && <span className="text-xs font-semibold text-rose-700">{error}</span>}
    </div>
  );
}
