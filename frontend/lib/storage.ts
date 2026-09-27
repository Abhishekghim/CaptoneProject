"use client";

import { createClient } from "./supabase/client";

export type StorageBucket = "referrals" | "dicom" | "receipts";

/**
 * Uploads a real file to a real Supabase Storage bucket (buckets + RLS
 * already provisioned in backend/database/schema.sql — "referrals" allows the
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
 * Uploads every file of a DICOM series into one folder of the `dicom`
 * bucket. Returns the folder path with a trailing slash — the form
 * mri_scans.dicom_image_url uses for a multi-file study (a single-file study
 * stores the file path itself).
 */
export async function uploadDicomSeries(
  files: File[],
  ownerId: string,
  label: string,
  onProgress?: (done: number, total: number) => void
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  if (files.length === 1) return uploadToBucket("dicom", files[0], ownerId);
  const supabase = createClient();
  const folder = `${ownerId}/${Date.now()}-${label.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const width = String(files.length).length;
  for (let i = 0; i < files.length; i++) {
    const safeName = files[i].name.replace(/[^a-zA-Z0-9._-]/g, "_") || "image";
    const { error } = await supabase.storage
      .from("dicom")
      .upload(`${folder}/${String(i + 1).padStart(width, "0")}-${safeName}`, files[i], {
        upsert: false,
        contentType: "application/dicom",
      });
    if (error) return { ok: false, error: `${files[i].name}: ${error.message}` };
    onProgress?.(i + 1, files.length);
  }
  return { ok: true, path: `dicom/${folder}/` };
}

const LIST_PAGE = 1000;

/**
 * Signed URLs for every object of a stored study: the single file itself,
 * or each file in the folder when `fullPath` ends with "/".
 */
export async function listStoredDicom(fullPath: string, expiresInSeconds = 900): Promise<{ name: string; url: string }[]> {
  const [bucket, ...rest] = fullPath.split("/");
  const key = rest.join("/");
  if (!bucket || !key) throw new Error("Invalid stored image path.");
  const supabase = createClient();

  if (!key.endsWith("/")) {
    const url = await getSignedUrl(fullPath, expiresInSeconds);
    if (!url) throw new Error("You don't have access to this scan's images, or they no longer exist.");
    return [{ name: key.split("/").pop() ?? key, url }];
  }

  const prefix = key.slice(0, -1);
  const names: string[] = [];
  for (let offset = 0; ; offset += LIST_PAGE) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(prefix, { limit: LIST_PAGE, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error(error.message);
    for (const o of data ?? []) if (o.id) names.push(o.name);
    if (!data || data.length < LIST_PAGE) break;
  }
  if (names.length === 0) throw new Error("No image files were found for this scan.");

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrls(names.map((n) => `${prefix}/${n}`), expiresInSeconds);
  if (error || !data) throw new Error(error?.message ?? "Could not create download links.");
  return data.flatMap((d, i) => (d.signedUrl ? [{ name: names[i], url: d.signedUrl }] : []));
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
