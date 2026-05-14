"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { siteConfig as defaults } from "../../lib/siteConfig";

export default function Navigation() {
  const pathname = usePathname() ?? "";
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [siteName, setSiteName] = useState(defaults.name);

  useEffect(() => {
    fetch("/api/user")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setIsLoggedIn(true);
        if (data?.isAdmin) setIsAdmin(true);
      })
      .catch(() => {});

    fetch("/api/site-config")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data?.SITE_NAME) setSiteName(data.SITE_NAME); })
      .catch(() => {});
  }, []);

  return (
    <nav className="nav">
      <div className="nav-inner">
        <Link href="/" className="nav-logo">{siteName}</Link>

        <div className="nav-links">
          <Link href="/" className={`nav-link${pathname === "/" ? " active" : ""}`}>Home</Link>
          <Link href="/library" className={`nav-link${pathname.startsWith("/library") ? " active" : ""}`}>Library</Link>
          {isLoggedIn && (
            <Link href="/favorites" className={`nav-link${pathname.startsWith("/favorites") ? " active" : ""}`}>Favorites</Link>
          )}
          {isAdmin && (
            <Link href="/dashboard" className={`nav-link${pathname.startsWith("/dashboard") ? " active" : ""}`}>Dashboard</Link>
          )}
        </div>

        <div className="nav-actions" />
      </div>
    </nav>
  );
}
