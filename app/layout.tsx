import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Certain — Verified voice input",
  description: "Application-valid, verified typed input from voice.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
