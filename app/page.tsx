export const dynamic = "force-dynamic";

import Link from "next/link";
import Navigation from "./components/Navigation";
import FooterAuth from "./components/FooterAuth";
import SeriesCard, { type Series } from "./components/SeriesCard";
import db, { getSiteConfig } from "@/lib/db";
import { siteConfig as defaults } from "@/lib/siteConfig";

function getRecent(): Series[] {
  try {
    return db.prepare(`
      SELECT id, slug, title, type, cover_path, status, description
      FROM series ORDER BY updated_at DESC LIMIT 12
    `).all() as Series[];
  } catch {
    return [];
  }
}

function getCounts() {
  try {
    const total = (db.prepare("SELECT COUNT(*) c FROM series").get() as { c: number }).c;
    const manga = (db.prepare("SELECT COUNT(*) c FROM series WHERE type='manga'").get() as { c: number }).c;
    const comic = (db.prepare("SELECT COUNT(*) c FROM series WHERE type='comic'").get() as { c: number }).c;
    const chapters = (db.prepare("SELECT COUNT(*) c FROM chapters").get() as { c: number }).c;
    return { total, manga, comic, chapters };
  } catch {
    return { total: 0, manga: 0, comic: 0, chapters: 0 };
  }
}

export default function Home() {
  const recent = getRecent();
  const counts = getCounts();
  const raw = (() => { try { return getSiteConfig(); } catch { return {} as Record<string, string>; } })();
  const name = raw.SITE_NAME || defaults.name;
  const tagline = raw.tagline || defaults.tagline;

  return (
    <div className="home-bg">
      <Navigation />

      <section className="hero">
        <div className="hero-content">
          <div className="hero-badge">
            <span className="hero-badge-dot" />
            Self-hosted library
          </div>

          <h1 className="hero-title">
            <span className="gradient-text">{name}</span>
            <span style={{ display: "block" }}>read what you love,</span>
            <span style={{ display: "block" }}>downloaded on your terms.</span>
          </h1>

          <p className="hero-desc">{tagline}</p>

          <div className="hero-actions">
            <Link href="/library" className="btn btn-primary btn-lg">Open Library</Link>
            <Link href="/login" className="btn btn-secondary btn-lg">Sign In</Link>
          </div>
        </div>

        <a href="#recent" className="scroll-indicator" aria-label="Scroll down">
          <span className="scroll-indicator-text">Recent</span>
          <span className="scroll-indicator-arrow">↓</span>
        </a>
      </section>

      <hr className="section-divider" />

      <section className="section">
        <p className="section-eyebrow">Stats</p>
        <div className="stats-row">
          <div className="stat-card"><div className="stat-value">{counts.total}</div><div className="stat-label">Series</div></div>
          <div className="stat-card"><div className="stat-value">{counts.manga}</div><div className="stat-label">Manga</div></div>
          <div className="stat-card"><div className="stat-value">{counts.comic}</div><div className="stat-label">Comics</div></div>
          <div className="stat-card"><div className="stat-value">{counts.chapters}</div><div className="stat-label">Chapters</div></div>
        </div>
      </section>

      <hr className="section-divider" />

      <section id="recent" className="section">
        <div className="section-header-row">
          <div>
            <p className="section-eyebrow">Library</p>
            <h2 className="section-title" style={{ marginBottom: 0 }}>Recently Updated</h2>
          </div>
          <Link href="/library" className="view-all-link" style={{ marginTop: 0 }}>Browse all →</Link>
        </div>

        {recent.length > 0 ? (
          <div className="series-grid">
            {recent.map((s) => <SeriesCard key={s.id} series={s} />)}
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-icon">◈</div>
            <p className="empty-title">Library is empty</p>
            <p className="empty-desc">Sign in as admin and add a series from the dashboard to get started.</p>
          </div>
        )}
      </section>

      <footer className="site-footer">
        <p style={{ fontSize: "13px", color: "var(--text-subtle)" }}>
          {name} — self-hosted comic & manga library.
        </p>
        <FooterAuth />
      </footer>
    </div>
  );
}
