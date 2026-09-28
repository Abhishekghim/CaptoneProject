import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { uuid_ossp } from "@electric-sql/pglite/contrib/uuid_ossp";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const DB_DIR = path.resolve(__dirname, "../../backend/database");

// Just enough of Supabase's auth/storage schemas for schema.sql and the
// migrations to load. auth.uid() reads the same JWT claim setting PostgREST
// sets per request, so tests can act as any user.
const SUPABASE_STUBS = `
  do $$ begin
    create role anon nologin;
  exception when duplicate_object then null; end $$;
  do $$ begin
    create role authenticated nologin;
  exception when duplicate_object then null; end $$;
  do $$ begin
    create role service_role nologin bypassrls;
  exception when duplicate_object then null; end $$;

  create schema if not exists auth;
  create table if not exists auth.users (
    id uuid primary key,
    email text,
    phone text,
    raw_user_meta_data jsonb default '{}'::jsonb
  );
  create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;

  create schema if not exists storage;
  create table if not exists storage.buckets (id text primary key, name text, public boolean default false);
  create table if not exists storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text,
    name text,
    owner uuid
  );
  alter table storage.objects enable row level security;
  create or replace function storage.foldername(name text) returns text[] language sql immutable as $$
    select string_to_array(name, '/')
  $$;

  grant usage on schema public, auth, storage to anon, authenticated, service_role;
`;

const GRANTS = `
  grant all on all tables in schema public to anon, authenticated, service_role;
  grant all on all sequences in schema public to anon, authenticated, service_role;
  grant execute on all functions in schema public to authenticated, service_role;
  grant execute on all functions in schema auth to anon, authenticated, service_role;
`;

export function migrationFiles(): string[] {
  const numbered = readdirSync(DB_DIR)
    .filter((f) => /^\d{3}_.*\.sql$/.test(f))
    // 003 only updates the live test accounts; it is seed data, not schema.
    .filter((f) => !f.startsWith("003_"))
    .sort();
  return ["schema.sql", ...numbered];
}

export async function createTestDb(): Promise<PGlite> {
  const db = await PGlite.create({ extensions: { uuid_ossp, pgcrypto } });
  await db.exec(SUPABASE_STUBS);
  for (const file of migrationFiles()) {
    const sql = readFileSync(path.join(DB_DIR, file), "utf8");
    // Same instruction as the migration headers: a new enum value has to be
    // committed on its own before the rest of the file can use it.
    const enumAdditions = file === "schema.sql" ? [] : sql.match(/^alter type \S+ add value[^;]*;/gim) ?? [];
    for (const stmt of enumAdditions) {
      await db.exec(stmt);
    }
    try {
      await db.exec(sql);
    } catch (err) {
      throw new Error(`${file} failed to apply: ${(err as Error).message}`);
    }
  }
  await db.exec(GRANTS);
  return db;
}

export type Role = "patient" | "technician" | "radiologist" | "admin" | "super_admin" | "reception" | "referring_doctor";

export async function createUser(
  db: PGlite,
  opts: { role: Role; email: string; fullName?: string; dob?: string; phone?: string }
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into auth.users (id, email, raw_user_meta_data)
     values (gen_random_uuid(), $1, jsonb_build_object('full_name', $2::text, 'role', $3::text))
     returning id`,
    [opts.email, opts.fullName ?? opts.email.split("@")[0], opts.role]
  );
  const id = rows[0].id;
  if (opts.phone) {
    await db.query(`update public.profiles set phone = $2 where id = $1`, [id, opts.phone]);
  }
  if (opts.dob) {
    await db.query(`insert into public.patient_medical_records (patient_id, dob) values ($1, $2)`, [id, opts.dob]);
  }
  return id;
}

/** Runs `fn` as the given user through the `authenticated` role, like a PostgREST request. */
export async function asUser<T>(db: PGlite, userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId]);
    await tx.exec("set local role authenticated");
    return fn(tx);
  });
}

export type Tx = Parameters<Parameters<PGlite["transaction"]>[0]>[0];
