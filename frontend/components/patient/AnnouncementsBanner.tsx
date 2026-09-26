"use client";

import { useEffect, useState } from "react";
import { Megaphone } from "lucide-react";
import { createClient } from "@/frontend/lib/supabase/client";

// Reads real Supabase data (backend/database/011_cms_content.sql) instead of
// the mock store's announcements — see
// frontend/components/admin/ContentManagementPanel.tsx, which writes this
// same table. Rendered at the top of every patient page (see each
// app/(app)/dashboard/*/page.tsx) so it stays visible regardless of which
// page a patient is on, not just the old single-scroll dashboard.
type AnnouncementRow = { id: string; title: string; message: string; active: boolean; created_at: string };

export function useActiveAnnouncements(): AnnouncementRow[] {
  const [announcements, setAnnouncements] = useState<AnnouncementRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("announcements")
        .select("id, title, message, active, created_at")
        .eq("active", true)
        .order("created_at", { ascending: false });
      if (cancelled || error || !data) return;
      setAnnouncements(data as AnnouncementRow[]);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return announcements;
}

export default function AnnouncementsBanner() {
  const activeAnnouncements = useActiveAnnouncements();

  if (activeAnnouncements.length === 0) return null;

  return (
    <div className="space-y-2">
      {activeAnnouncements.map((a) => (
        <div key={a.id} role="status" className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <Megaphone size={16} className="mt-0.5 shrink-0" aria-hidden />
          <p><span className="font-semibold">{a.title}</span> — {a.message}</p>
        </div>
      ))}
    </div>
  );
}
