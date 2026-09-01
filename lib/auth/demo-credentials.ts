// Plain data, safe to import from both client and server code. Single
// source of truth for the premade demo logins shown on /login and seeded
// into lib/auth/local-accounts.ts.
export const DEMO_CREDENTIALS = [
  { email: "patient@demo.com", password: "demo1234", role: "patient" as const, profileId: "u-patient" },
  { email: "technician@demo.com", password: "demo1234", role: "technician" as const, profileId: "u-tech" },
  { email: "radiologist@demo.com", password: "demo1234", role: "radiologist" as const, profileId: "u-rad" },
  { email: "admin@demo.com", password: "demo1234", role: "admin" as const, profileId: "u-admin" },
  { email: "doctor@demo.com", password: "demo1234", role: "referring_doctor" as const, profileId: "u-doctor" },
];
