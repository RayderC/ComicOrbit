import type { NextConfig } from "next";
import path from "path";

const isDev = process.env.NODE_ENV !== "production";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Next.js requires unsafe-inline for its hydration scripts and styles.
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      // Cover images are proxied through /api/cover — img-src only needs 'self' and data:.
      "img-src 'self' data: blob:",
      // SSE progress stream + API calls are same-origin; ws/wss for Next.js HMR in dev.
      `connect-src 'self'${isDev ? " wss: ws:" : ""}`,
      "font-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  serverExternalPackages: ["better-sqlite3", "yauzl", "archiver"],
  // Fix Turbopack workspace root detection when next is not at the filesystem root.
  turbopack: {
    root: path.resolve(__dirname),
  },
  // The old admin dashboard's addresses, so bookmarks and installed shortcuts still land somewhere.
  async redirects() {
    return [
      { source: "/dashboard", destination: "/admin", permanent: false },
      { source: "/dashboard/add", destination: "/add", permanent: false },
      { source: "/dashboard/library", destination: "/series", permanent: false },
      { source: "/dashboard/downloads", destination: "/downloads", permanent: false },
      { source: "/dashboard/:rest(users|settings|notifications)", destination: "/admin", permanent: false },
      { source: "/profile", destination: "/settings", permanent: false },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
