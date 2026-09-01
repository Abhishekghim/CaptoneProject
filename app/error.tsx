"use client";

import React from "react";
import { AlertTriangle } from "lucide-react";

// Deliberately at the app root, not inside app/(app)/ — error.tsx only
// catches errors thrown by segments nested below it, and the Supabase
// config check that can throw lives in app/(app)/layout.tsx itself.
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const isConfigError = error.message.includes("Supabase is not configured");

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="card max-w-md p-6 text-center">
        <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-full bg-rose-100 text-rose-700">
          <AlertTriangle size={20} aria-hidden />
        </div>

        {isConfigError ? (
          <>
            <h1 className="text-lg font-bold text-navy">Supabase isn&apos;t configured yet</h1>
            <p className="mt-2 text-sm text-slate-600">
              Copy <span className="font-mono">.env.local.example</span> to{" "}
              <span className="font-mono">.env.local</span>, fill in your Supabase project&apos;s{" "}
              <span className="font-mono">NEXT_PUBLIC_SUPABASE_URL</span> and{" "}
              <span className="font-mono">NEXT_PUBLIC_SUPABASE_ANON_KEY</span>, run{" "}
              <span className="font-mono">database/schema.sql</span> against that project, then restart the dev
              server.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-lg font-bold text-navy">Something went wrong</h1>
            <p className="mt-2 text-sm text-slate-600">{error.message}</p>
            <button type="button" className="btn-primary mt-4 px-4 py-2 text-sm" onClick={() => reset()}>
              Try again
            </button>
          </>
        )}
      </div>
    </div>
  );
}
