"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
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
  { href: "/add", label: "Add series", icon: "plus" },
  { href: "/downloads", label: "Downloads", icon: "download" },
  { href: "/admin", label: "Admin", icon: "admin" },
];

const TABS = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/library", label: "Library", icon: "book" },
  { href: "__continue", label: "Continue", icon: "play" },
  { href: "/favorites", label: "Favorites", icon: "star" },
];

type Continue = { href: string | null; title?: string; chapter?: string };

function isActive(path: string, href: string) {
  return href === "/" ? path === "/" : path === href || path.startsWith(href + "/");
}

/** The same shell as NitroLog and AstroFit: a sidebar on big screens, a tab bar and a More menu on phones. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname() ?? "/";
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [siteName, setSiteName] = useState(defaults.name);
  const [cont, setCont] = useState<Continue>({ href: null });
  // The reader is full screen, without the menus.
  const reading = /^\/library\/[^/]+\/read\//.test(path);

  useEffect(() => {
    fetch("/api/user").then(r => (r.ok ? r.json() : null)).then(u => {
      if (!u?.id) { window.location.replace("/login"); return; }
      setMe({ id: u.id, username: u.username, isAdmin: !!u.isAdmin });
    }).catch(() => window.location.replace("/login"));
    fetch("/api/site-config").then(r => (r.ok ? r.json() : null)).then(c => { if (c?.SITE_NAME) setSiteName(c.SITE_NAME); }).catch(() => {});
  }, []);

  const loadContinue = useCallback(() => {
    fetch("/api/read/continue").then(r => (r.ok ? r.json() : null)).then(c => c && setCont(c)).catch(() => {});
  }, []);
  useEffect(() => { setOpen(false); if (!reading) loadContinue(); }, [path, reading, loadContinue]);

  async function logout() {
    await fetch("/api/logout", { method: "POST" }).catch(() => {});
    // Full navigation so the router drops its cached signed-in pages.
    window.location.replace("/login");
  }

  const goContinue = () => router.push(cont.href ?? "/library");

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
            <button className="sidebar-start" onClick={goContinue} title={cont.title ? `${cont.title}, chapter ${cont.chapter}` : undefined}>
              <Icon name={cont.href ? "play" : "book"} />
              {cont.href ? "Continue reading" : "Start reading"}
            </button>
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
          {TABS.map(t => t.href === "__continue" ? (
            <button key={t.href} className="tabbar-item tabbar-main" onClick={goContinue}>
              <Icon name={cont.href ? "play" : "book"} size={22} />
              <span>{cont.href ? "Continue" : "Read"}</span>
            </button>
          ) : (
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
