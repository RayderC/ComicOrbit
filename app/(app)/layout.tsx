"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Icon from "@/app/components/Icon";
import { MeContext, type Me } from "@/app/components/MeContext";
import { siteConfig as defaults } from "@/lib/siteConfig";

const NAV = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/library", label: "Library", icon: "book" },
  { href: "/favorites", label: "Favorites", icon: "star" },
  { href: "/stats", label: "Stats", icon: "chart" },
  { href: "/settings", label: "Settings", icon: "settings" },
];

const ADMIN_NAV = [
  { href: "/series", label: "Series", icon: "list" },
  { href: "/add", label: "Add series", icon: "plus" },
  { href: "/downloads", label: "Downloads", icon: "download" },
  { href: "/admin", label: "Admin", icon: "admin" },
];

const TABS = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/library", label: "Library", icon: "book" },
  { href: "/favorites", label: "Favorites", icon: "star" },
  { href: "/stats", label: "Stats", icon: "chart" },
];

function isActive(path: string, href: string) {
  return href === "/" ? path === "/" : path === href || path.startsWith(href + "/");
}

/** The same shell as NitroLog and AstroFit: a sidebar on big screens, a tab bar and a More menu on phones. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [siteName, setSiteName] = useState(defaults.name);
  // The reader is full screen, without the menus.
  const reading = /^\/library\/[^/]+\/read\//.test(path);

  useEffect(() => {
    fetch("/api/user").then(r => (r.ok ? r.json() : null)).then(u => {
      if (!u?.id) { window.location.replace("/login"); return; }
      setMe({ id: u.id, username: u.username, isAdmin: !!u.isAdmin });
    }).catch(() => window.location.replace("/login"));
    fetch("/api/site-config").then(r => (r.ok ? r.json() : null)).then(c => { if (c?.SITE_NAME) setSiteName(c.SITE_NAME); }).catch(() => {});
  }, []);

  useEffect(() => { setOpen(false); }, [path]);

  async function logout() {
    await fetch("/api/logout", { method: "POST" }).catch(() => {});
    // Full navigation so the router drops its cached signed-in pages.
    window.location.replace("/login");
  }

  if (reading) return <MeContext.Provider value={me}>{children}</MeContext.Provider>;
  if (!me) return <div className="loading" style={{ minHeight: "100vh" }}>Loading…</div>;

  const navItem = (n: { href: string; label: string; icon: string }) => (
    <Link key={n.href} href={n.href} className={`sidebar-item ${isActive(path, n.href) ? "active" : ""}`}>
      <Icon name={n.icon} />
      {n.label}
    </Link>
  );

  return (
    <MeContext.Provider value={me}>
      <div className="dashboard-root app-shell">

        {open && <div className="dash-backdrop" onClick={() => setOpen(false)} />}

        <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
          <div className="sidebar-logo-wrap">
            <Link href="/" className="sidebar-logo">{siteName}</Link>
            <button className="sidebar-close" onClick={() => setOpen(false)} aria-label="Close">✕</button>
          </div>
          <nav className="sidebar-nav">
            {NAV.map(navItem)}
            {me.isAdmin && <p className="sidebar-section-label">Manage</p>}
            {me.isAdmin && ADMIN_NAV.map(navItem)}
          </nav>
          <div className="sidebar-footer">
            <div className="sidebar-user">{me.username}</div>
            <button className="sidebar-item" onClick={logout}><Icon name="logout" />Sign out</button>
          </div>
        </aside>

        <main className="dashboard-main has-tabbar">{children}</main>

        <nav className="tabbar" aria-label="Main">
          {TABS.map(t => (
            <Link key={t.href} href={t.href} className={`tabbar-item ${isActive(path, t.href) ? "active" : ""}`} aria-current={isActive(path, t.href) ? "page" : undefined}>
              <Icon name={t.icon} size={20} />
              <span>{t.label}</span>
            </Link>
          ))}
          <button className="tabbar-item" onClick={() => setOpen(true)}>
            <Icon name="menu" size={20} />
            <span>More</span>
          </button>
        </nav>
      </div>
    </MeContext.Provider>
  );
}
