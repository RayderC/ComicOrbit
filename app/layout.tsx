import "./globals.css";
import type { Metadata } from "next";
import CircuitBackground from "./components/CircuitBackground";
import { getSiteConfig } from "@/lib/db";
import { siteConfig as defaults } from "@/lib/siteConfig";

export async function generateMetadata(): Promise<Metadata> {
  let raw: Record<string, string> = {};
  try { raw = getSiteConfig(); } catch { /* DB not ready during first build */ }

  const name = raw.SITE_NAME || defaults.name;
  const tagline = raw.tagline || defaults.tagline;
  const description = raw.description || defaults.description;

  return {
    title: `${name} — ${tagline}`,
    description,
    appleWebApp: {
      capable: true,
      statusBarStyle: "black-translucent",
      title: name,
    },
    other: {
      "mobile-web-app-capable": "yes",
    },
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <CircuitBackground />
        {children}
      </body>
    </html>
  );
}
