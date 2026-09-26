// Test-only stub for the "server-only" package. The real package is a
// no-op on the server (it only throws when bundled into a client/browser
// build via its package.json "browser" field alias) — under Vitest we
// never run through Next's webpack browser-condition resolution, so we
// alias the bare specifier straight to this empty module instead of
// depending on how Vite happens to resolve that package's conditional
// exports. See vitest.config.ts.
export {};
