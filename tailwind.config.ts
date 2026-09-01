import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: "#0f172a",
          800: "#1e293b",
          700: "#334155",
        },
        medical: {
          DEFAULT: "#0284c7",
          light: "#e0f2fe",
          dark: "#075985",
        },
        // Icy teal — secondary accent for icons/glows, keeps the palette from
        // reading as a single flat blue.
        teal: {
          DEFAULT: "#0d9488",
          light: "#ccfbf1",
          dark: "#0f766e",
        },
        // Warm accent — used sparingly (decorative glows, the safety panel)
        // so the palette doesn't feel clinically cold.
        warm: {
          DEFAULT: "#f2a65a",
          light: "#fdf1e4",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "ui-monospace", "monospace"],
      },
      boxShadow: {
        card: "0 1px 3px rgba(15, 23, 42, 0.08), 0 1px 2px rgba(15, 23, 42, 0.04)",
        elevated: "0 12px 32px -8px rgba(15, 23, 42, 0.16), 0 4px 10px -4px rgba(15, 23, 42, 0.08)",
        glow: "0 1px 2px rgba(2, 132, 199, 0.06), 0 12px 28px -6px rgba(2, 132, 199, 0.35)",
      },
    },
  },
  plugins: [],
};
export default config;
