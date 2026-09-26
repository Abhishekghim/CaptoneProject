import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/backend/lib/adminAuth";
import { createAdminClient } from "@/backend/lib/supabase/admin";

interface RegisterPatientBody {
  fullName?: string;
  dob?: string;
  sex?: string | null;
  preferredName?: string | null;
  phone?: string;
  email?: string;
  address?: string | null;
  suburb?: string | null;
  state?: string | null;
  postcode?: string | null;
  medicareNumber?: string | null;
  medicareExpiry?: string | null;
  // When a prior call already surfaced possible duplicates and reception
  // confirmed this is genuinely a different person, forceCreate skips the
  // duplicate check and creates the record anyway — never a silent/automatic
  // merge. Mirrors the mock's registerPatient({ forceCreate }).
  forceCreate?: boolean;
}

interface PossibleDuplicate {
  id: string;
  full_name: string;
  dob: string;
  phone?: string;
}

// Walk-in patient registration (Reception Portal). The one write in this
// whole effort that has to be a Route Handler rather than a direct client
// call or RPC: profiles.id is a foreign key to auth.users(id), so "creating
// a patient record" means provisioning a real Supabase Auth user first,
// which requires the service-role Auth Admin API — never available to the
// browser.
//
// Deliberately uses `createUser`, not `inviteUserByEmail` (see
// app/api/super-admin/staff/create/route.ts for that pattern): a walk-in
// patient reception registers may have no email at all, and even when they
// do, reception registering them isn't the same as inviting them to use the
// patient portal — no invite email should go out. `email_confirm: true`
// plus a random password means the account exists and satisfies the
// profiles.email not null unique constraint without anyone being emailed or
// needing to log in. See the comment on MedicalRecord.patient_code in
// shared/types.ts for why a portal login is never assumed here.
export async function POST(req: NextRequest) {
  const auth = await requireStaff();
  if ("error" in auth) return auth.error;

  let body: RegisterPatientBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const fullName = body.fullName?.trim() ?? "";
  const dob = body.dob?.trim() ?? "";
  const phone = body.phone?.trim() ?? "";
  const email = body.email?.trim() ?? "";
  const forceCreate = Boolean(body.forceCreate);

  if (!fullName) {
    return NextResponse.json({ error: "Full name is required." }, { status: 400 });
  }
  // Must be a real past date — patient_medical_records has a
  // `dob < current_date` check constraint (backend/database/schema.sql).
  const today = new Date().toISOString().slice(0, 10);
  if (!dob || Number.isNaN(Date.parse(dob)) || dob >= today) {
    return NextResponse.json({ error: "A valid date of birth in the past is required." }, { status: 400 });
  }

  const adminClient = createAdminClient();

  // Duplicate check (never auto-merge) — same name + same DOB, or same name
  // + same mobile. Matches the mock's exact logic in frontend/lib/store.tsx
  // registerPatient. Service role is used here mainly for consistency with
  // the createUser step below, which requires it regardless — is_staff()
  // already permits broad profiles/records reads under normal RLS too.
  if (!forceCreate) {
    const { data: patientProfiles, error: profilesError } = await adminClient
      .from("profiles")
      .select("id, full_name, phone")
      .eq("role", "patient");

    if (profilesError) {
      return NextResponse.json({ error: profilesError.message }, { status: 502 });
    }

    const normalizedName = fullName.toLowerCase();
    const nameMatches = (patientProfiles ?? []).filter(
      (p) => p.full_name.trim().toLowerCase() === normalizedName
    );

    let possibleDuplicates: PossibleDuplicate[] = [];

    if (nameMatches.length > 0) {
      const ids = nameMatches.map((p) => p.id);
      const { data: recordRows, error: recordsError } = await adminClient
        .from("patient_medical_records")
        .select("patient_id, dob")
        .in("patient_id", ids);

      if (recordsError) {
        return NextResponse.json({ error: recordsError.message }, { status: 502 });
      }

      const dobByPatientId = new Map<string, string>(
        (recordRows ?? []).map((r) => [r.patient_id as string, r.dob as string])
      );
      const normalizedPhone = phone.replace(/\s+/g, "");

      possibleDuplicates = nameMatches
        .filter((p) => {
          const recordDob = dobByPatientId.get(p.id) ?? "";
          const dobMatch = Boolean(recordDob) && recordDob === dob;
          const phoneMatch = Boolean(normalizedPhone) && (p.phone ?? "").replace(/\s+/g, "") === normalizedPhone;
          return dobMatch || phoneMatch;
        })
        .map((p) => ({
          id: p.id as string,
          full_name: p.full_name as string,
          dob: dobByPatientId.get(p.id) ?? "",
          phone: p.phone ?? undefined,
        }));
    }

    if (possibleDuplicates.length > 0) {
      // 200, not an error status — matches the mock's non-error "here are
      // some maybes, confirm or force" flow.
      return NextResponse.json({ ok: false, possibleDuplicates });
    }
  }

  // A real email, if given, is used as-is. Otherwise generate a unique
  // placeholder — this satisfies profiles.email not null unique without
  // implying the patient has a real email or portal access.
  const finalEmail = email || `patient-${crypto.randomUUID()}@registered.local`;
  const generatedPassword = crypto.randomUUID();

  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email: finalEmail,
    password: generatedPassword,
    email_confirm: true,
    user_metadata: { full_name: fullName, role: "patient" },
  });

  if (createError || !created?.user) {
    const message = createError?.message?.toLowerCase().includes("already been registered")
      ? "A user with this email already has an account."
      : createError?.message || "Could not register this patient.";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const newProfileId = created.user.id;

  // handle_new_user() (backend/database/schema.sql) fires on the auth.users
  // insert above and creates the profiles row itself from user_metadata —
  // do NOT insert into profiles manually here, that would conflict with the
  // trigger. It doesn't carry phone through, though, so set that separately
  // — mirroring the mock, which only ever set profiles.phone when a mobile
  // number was actually provided.
  if (phone) {
    const { error: phoneError } = await adminClient
      .from("profiles")
      .update({ phone })
      .eq("id", newProfileId);
    if (phoneError) {
      return NextResponse.json(
        { error: `Patient account created but saving the phone number failed: ${phoneError.message}` },
        { status: 502 }
      );
    }
  }

  // records_patient_upsert_own's RLS only covers `patient_id = auth.uid()`
  // (the patient saving their own profile) or public.is_admin() — neither
  // covers reception/technician staff creating a record on behalf of a
  // brand-new user who can't yet authenticate to do it themselves. Service
  // role is the correct, simplest choice here, not a workaround.
  // patient_code is omitted so the DB default sequence
  // (backend/database/012_patient_records_extended.sql) fills it in.
  const { error: recordError } = await adminClient.from("patient_medical_records").insert({
    patient_id: newProfileId,
    dob,
    history: "",
    contraindications: {
      metal_implants: false,
      pacemaker: false,
      claustrophobia: false,
      contrast_allergy: false,
      pregnancy: false,
      other: null,
    },
    emergency_contact: { name: "", relationship: "", phone: "" },
    sex: body.sex ?? null,
    preferred_name: body.preferredName ?? null,
    address: body.address ?? null,
    suburb: body.suburb ?? null,
    state: body.state ?? null,
    postcode: body.postcode ?? null,
    medicare_number: body.medicareNumber ?? null,
    medicare_expiry: body.medicareExpiry ?? null,
  });

  if (recordError) {
    return NextResponse.json(
      { error: `Patient account created but the medical record could not be saved: ${recordError.message}` },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true, patientId: newProfileId, possibleDuplicates: [] });
}
