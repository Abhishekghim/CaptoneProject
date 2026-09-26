import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Mirrors tsconfig.json's "@/*" -> "./*" path mapping so test imports resolve
// exactly the way they do in the app (e.g. `@/shared/types`, `@/frontend/...`).
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    css: false,
  },
  resolve: {
    alias: {
      // Real package only throws when bundled for the browser via its
      // package.json "browser" field; under Vitest that condition isn't
      // in play the way Next's webpack applies it, so alias it to a local
      // no-op stub instead. See test/stubs/server-only.ts.
      "server-only": path.resolve(__dirname, "./test/stubs/server-only.ts"),
      "@": path.resolve(__dirname, "."),
    },
  },
});
