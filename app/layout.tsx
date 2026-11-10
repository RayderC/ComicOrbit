import "./globals.css";
import type { Metadata, Viewport } from "next";
import CircuitBackground from "./components/CircuitBackground";
import { getSiteConfig } from "@/lib/db";
import { siteConfig as defaults } from "@/lib/siteConfig";

export const viewport: Viewport = {
  themeColor: "#0d0d12",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
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
    icons: {
      icon: "/favicon.png",
      apple: "/icons/apple-touch-icon-180x180.png",
    },
    appleWebApp: {
      capable: true,
      statusBarStyle: "black",
      title: name,
    },
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon-180x180.png" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', () => {
                  navigator.serviceWorker.register('/sw.js').catch(() => {});
                });
              }
            `,
          }}
        />
      </head>
      <body>
        <CircuitBackground />
        {children}
      </body>
    </html>
  );
}
