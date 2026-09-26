"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/frontend/lib/supabase/client";

// Real `patient_medical_records` read — staff-wide via the
// `records_staff_read`-style RLS (any staff role can read all records; see
// backend/database/schema.sql section 2.2 + 012_patient_records_extended.sql
// for the extra reception-owned demographic columns). Local row type instead
// of shared/types.ts's MedicalRecord, which may be stale after the schema
// changes layered on across phases — this mirrors the real columns exactly.
// null = still loading, [] = loaded and empty. Each caller gets its own
// independent fetch (no shared cache/context — same convention as the other
// hooks in this directory).
export interface MedicalRecordRow {
  id: string;
  patient_id: string;
  dob: string;
  history: string | null;
  contraindications: {
    metal_implants: boolean;
    pacemaker: boolean;
    claustrophobia: boolean;
    contrast_allergy: boolean;
    pregnancy: boolean;
    other: string | null;
  };
  emergency_contact: {
    name: string | null;
    relationship: string | null;
    phone: string | null;
  };
  patient_code: string | null;
  sex: string | null;
  preferred_name: string | null;
  address: string | null;
  suburb: string | null;
  state: string | null;
  postcode: string | null;
  medicare_number: string | null;
  medicare_expiry: string | null;
  created_at: string;
  updated_at: string;
}

export function useMedicalRecords() {
  const [data, setData] = useState<MedicalRecordRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: rows, error } = await supabase.from("patient_medical_records").select("*");
    if (error) {
      setLoadError(error.message);
      return;
    }
    setLoadError(null);
    setData((rows ?? []) as MedicalRecordRow[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loadError, reload: load };
}
