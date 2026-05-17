import "./globals.css";
import type { Metadata, Viewport } from "next";
import CircuitBackground from "./components/CircuitBackground";
import { getSiteConfig } from "@/lib/db";
import { siteConfig as defaults } from "@/lib/siteConfig";

export const viewport: Viewport = {
  themeColor: "#0d0d12",
  width: "device-width",
  initialScale: 1,
};

export async function generateMetadata(): Promise<Metadata> {
  let raw: Record<string, string> = {};
  try { raw = getSiteConfig(); } catch { /* DB not ready during first build */ }

  const name = raw.SITE_NAME || defaults.name;
  const description = raw.description || defaults.description;

  return {
    title: name,
    description,
    manifest: "/manifest.json",
    appleWebApp: {
      capable: true,
      statusBarStyle: "black-translucent",
      title: name,
    },
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Android Chrome Add to Home Screen */}
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body>
        <CircuitBackground />
        {children}
      </body>
    </html>
  );
}
