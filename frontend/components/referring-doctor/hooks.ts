"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/frontend/lib/supabase/client";
import type { DoctorReferral, MriScan } from "@/shared/types";

// A referring_doctor gets a `referring_doctor_details` row only when they
// came through the external request-then-approve queue (database/004) —
// AHPRA number, practice name, all captured there. A doctor super_admin
// creates directly via the Staff Accounts panel (database/008) never gets
// one, which is exactly what marks them as "employed under Capital
// Radiology" rather than an external GP/specialist. Scan images are only
// released to the internal kind (database/009) — this hook mirrors that
// same check client-side, purely to decide whether to render the viewer at
// all (the real enforcement is the storage RLS policy, not this).
export function useIsInternalReferringDoctor(profileId: string): boolean | null {
  const [isInternal, setIsInternal] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("referring_doctor_details")
        .select("profile_id")
        .eq("profile_id", profileId)
        .maybeSingle();
      if (!cancelled) setIsInternal(!data);
    })();
    return () => { cancelled = true; };
  }, [profileId]);
  return isInternal;
}

// A doctor's own submitted referrals, read straight from the real
// doctor_referrals table (backend/database/006_doctor_referrals.sql) — RLS
// (doctor_referrals_read) already scopes this to rows where
// referring_doctor_id = auth.uid(). null = still loading.
export function useMyDoctorReferrals(doctorId: string) {
  const [referrals, setReferrals] = useState<DoctorReferral[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("doctor_referrals")
      .select("*")
      .eq("referring_doctor_id", doctorId)
      .order("created_at", { ascending: false });
    if (error) {
      setLoadError(error.message);
      return;
    }
    setLoadError(null);
    setReferrals((data ?? []) as DoctorReferral[]);
  }, [doctorId]);

  useEffect(() => {
    load();
  }, [load]);

  return { referrals, loadError, reload: load };
}

// Real mri_scans lookup for the (still mock-store-sourced) appointments this
// doctor is listed as referring on — a simple display-only read (never a
// write) scoped to these appointment ids, batched into one query rather than
// one per row. null = still loading.
export function useScansByAppointment(appointmentIds: string[]) {
  const idsKey = [...appointmentIds].sort().join(",");
  const [scansByAppointment, setScansByAppointment] = useState<Record<string, MriScan> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const ids = idsKey ? idsKey.split(",") : [];
    if (ids.length === 0) {
      setLoadError(null);
      setScansByAppointment({});
      return;
    }
    (async () => {
      const supabase = createClient();
      const { data, error } = await supabase.from("mri_scans").select("*").in("appointment_id", ids);
      if (cancelled) return;
      if (error) {
        setLoadError(error.message);
        return;
      }
      setLoadError(null);
      const map: Record<string, MriScan> = {};
      (data ?? []).forEach((s) => {
        map[(s as MriScan).appointment_id] = s as MriScan;
      });
      setScansByAppointment(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [idsKey]);

  return { scansByAppointment, loadError };
}
