"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { siteConfig as defaults } from "../../lib/siteConfig";
import TabBar, { type Tab } from "./TabBar";

export default function Navigation() {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [username, setUsername] = useState("");
  const [siteName, setSiteName] = useState(defaults.name);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    fetch("/api/user")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setIsLoggedIn(true);
          setUsername(data.username || "");
          if (data.isAdmin) setIsAdmin(true);
        }
      })
      .catch(() => {});

    fetch("/api/site-config")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data?.SITE_NAME) setSiteName(data.SITE_NAME); })
      .catch(() => {});
  }, []);

  // Close drawer on route change
  useEffect(() => { setDrawerOpen(false); }, [pathname]);

  async function handleLogout() {
    await fetch("/api/logout", { method: "POST" });
    router.push("/login");
  }

  const navLinks = [
    { href: "/", label: "Home", active: pathname === "/" },
    { href: "/library", label: "Library", active: pathname.startsWith("/library") },
    ...(isLoggedIn ? [
      { href: "/favorites", label: "Favorites", active: pathname.startsWith("/favorites") },
      { href: "/stats", label: "Stats", active: pathname.startsWith("/stats") },
    ] : []),
    ...(isAdmin ? [{ href: "/dashboard", label: "Dashboard", active: pathname.startsWith("/dashboard") }] : []),
  ];

  const tabs: Tab[] = [
    { label: "Home", icon: "home", href: "/", active: pathname === "/" },
    { label: "Library", icon: "book", href: "/library", active: pathname.startsWith("/library") },
    ...(isLoggedIn ? [
      { label: "Favorites", icon: "star", href: "/favorites", active: pathname.startsWith("/favorites") },
      { label: "Stats", icon: "chart", href: "/stats", active: pathname.startsWith("/stats") },
      { label: "More", icon: "menu", active: drawerOpen || pathname.startsWith("/profile"), onClick: () => setDrawerOpen(true) },
    ] : []),
  ];

  return (
    <>
      <nav className="nav">
        <div className="nav-inner">
          <Link href="/" className="nav-logo">{siteName}</Link>

          {/* Desktop links */}
          <div className="nav-links">
            {navLinks.map((l) => (
              <Link key={l.href} href={l.href} className={`nav-link${l.active ? " active" : ""}`}>{l.label}</Link>
            ))}
          </div>

          {/* Desktop user actions */}
          <div className="nav-actions">
            {isLoggedIn && (
              <>
                <Link
                  href="/profile"
                  className={`nav-profile-btn${pathname.startsWith("/profile") ? " active" : ""}`}
                  title="Profile & settings"
                >
                  <span className="nav-profile-icon">◉</span>
                  {username}
                </Link>
                <button onClick={handleLogout} className="btn btn-ghost btn-sm" style={{ fontSize: "12px" }}>
                  Log out
                </button>
              </>
            )}
          </div>
        </div>
      </nav>

      <TabBar tabs={tabs} />

      {/* Mobile drawer backdrop */}
      {drawerOpen && (
        <div className="nav-mobile-backdrop" onClick={() => setDrawerOpen(false)} />
      )}

      {/* Mobile drawer */}
      <div className={`nav-mobile-drawer${drawerOpen ? " open" : ""}`}>
        <div className="nav-mobile-drawer-header">
          <Link href="/" className="nav-logo">{siteName}</Link>
        </div>

        <nav className="nav-mobile-links">
          {navLinks.map((l) => (
            <Link key={l.href} href={l.href} className={`nav-mobile-link${l.active ? " active" : ""}`}>
              {l.label}
            </Link>
          ))}
        </nav>

        {isLoggedIn && (
          <div className="nav-mobile-user">
            <Link href="/profile" className={`nav-mobile-link${pathname.startsWith("/profile") ? " active" : ""}`}>
              <span className="nav-profile-icon">◉</span> {username} — Profile
            </Link>
            <button onClick={handleLogout} className="btn btn-ghost btn-sm" style={{ width: "100%", marginTop: "8px" }}>
              Log out
            </button>
          </div>
        )}
      </div>
    </>
  );
}
