import type { Metadata } from "next";
import "./globals.css";
import { SessionProvider } from "@/lib/auth/SessionContext";

export const metadata: Metadata = {
  title: "Capital Radiology — MRI Portal",
  description:
    "Online MRI management system: booking, scanning, radiology reporting, billing, equipment and audit — Project 24.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
