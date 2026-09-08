"use client";

import { createClient } from "./supabase/client";

export type StorageBucket = "referrals" | "dicom";

/**
 * Uploads a real file to a real Supabase Storage bucket (buckets + RLS
 * already provisioned in database/schema.sql — "referrals" allows the
 * owner or staff to write, "dicom" allows staff to write). Returns the
 * bucket-relative path on success; the caller stores that path (prefixed
 * with the bucket name for display) in place of the old fake filename
 * string.
 *
 * This only replaces the *file bytes* side of image/document storage —
 * appointment/scan metadata still lives in the in-memory demo store, so a
 * page refresh still resets which appointment a given upload is attached
 * to, even though the uploaded bytes themselves are now genuinely
 * persisted in Supabase.
 */
export async function uploadToBucket(
  bucket: StorageBucket,
  file: File,
  ownerId: string
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  const supabase = createClient();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${ownerId}/${Date.now()}-${safeName}`;

  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    upsert: false,
    contentType: file.type || "application/octet-stream",
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, path: `${bucket}/${path}` };
}

/**
 * Signed URL for a private object, valid briefly — used to actually view
 * or download a real uploaded file (as opposed to just displaying its
 * stored path as text).
 */
export async function getSignedUrl(fullPath: string, expiresInSeconds = 300): Promise<string | null> {
  const [bucket, ...rest] = fullPath.split("/");
  if (!bucket || rest.length === 0) return null;
  const supabase = createClient();
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(rest.join("/"), expiresInSeconds);
  if (error || !data) return null;
  return data.signedUrl;
}
