import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Capital Radiology — MRI Portal",
  description:
    "Online MRI management system: booking, scanning, radiology reporting, billing, equipment and audit — Project 24.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
