export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { sessionOptions, User } from "@/lib/session";
import db from "@/lib/db";
import Link from "next/link";
import Navigation from "./components/Navigation";

interface ContinueItem {
  series_id: number;
  series_title: string;
  cover_path: string;
  type: string;
  chapter_id: number;
  chapter_number: number;
  page: number;
  page_count: number;
}

interface RecentChapter {
  chapter_id: number;
  chapter_number: number;
  series_id: number;
  series_title: string;
  cover_path: string;
}

interface FavoriteSeries {
  id: number;
  title: string;
  type: string;
  cover_path: string;
  status: string;
}

function ShelfCard({
  href,
  seriesId,
  hasCover,
  title,
  subtitle,
  progressPct,
}: {
  href: string;
  seriesId: number;
  hasCover: boolean;
  title: string;
  subtitle?: string;
  progressPct?: number;
}) {
  return (
    <Link href={href} className="shelf-card">
      <div className="shelf-card-cover">
        {hasCover ? (
          <img src={`/api/cover/${seriesId}`} alt={title} loading="lazy" />
        ) : (
          <div className="shelf-card-placeholder">◈</div>
        )}
        {progressPct !== undefined && (
          <div className="shelf-card-progress">
            <div className="shelf-card-progress-fill" style={{ width: `${progressPct}%` }} />
          </div>
        )}
        <div className="shelf-card-overlay">
          <div className="shelf-card-overlay-title">{title}</div>
          {subtitle && <div className="shelf-card-overlay-sub">{subtitle}</div>}
        </div>
      </div>
      <div className="shelf-card-info">
        <div className="shelf-card-title">{title}</div>
        {subtitle && <div className="shelf-card-sub">{subtitle}</div>}
      </div>
    </Link>
  );
}

function Shelf({
  title,
  viewAllHref,
  viewAllLabel = "Browse all →",
  children,
}: {
  title: string;
  viewAllHref: string;
  viewAllLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="shelf">
      <div className="shelf-header">
        <h2 className="shelf-section-title">{title}</h2>
        <Link href={viewAllHref} className="shelf-view-all">{viewAllLabel}</Link>
      </div>
      <div className="shelf-track">{children}</div>
    </section>
  );
}

export default async function Home() {
  const session = await getIronSession<{ user?: User }>(await cookies(), sessionOptions);
  if (!session.user) redirect("/login");

  const userId = session.user.id;

  let continueReading: ContinueItem[] = [];
  try {
    const raw = db.prepare(`
      SELECT s.id as series_id, s.title as series_title, s.cover_path, s.type,
             c.id as chapter_id, c.number as chapter_number,
             p.page, c.page_count
      FROM read_progress p
      JOIN chapters c ON c.id = p.chapter_id
      JOIN series s ON s.id = p.series_id
      WHERE p.user_id = ? AND p.completed = 0
      ORDER BY p.updated_at DESC LIMIT 60
    `).all(userId) as ContinueItem[];
    const seen = new Set<number>();
    continueReading = raw.filter((item) => {
      if (seen.has(item.series_id)) return false;
      seen.add(item.series_id);
      return true;
    }).slice(0, 20);
  } catch { /* ignore */ }

  let recentChapters: RecentChapter[] = [];
  try {
    recentChapters = db.prepare(`
      SELECT c.id as chapter_id, c.number as chapter_number, c.series_id,
             s.title as series_title, s.cover_path
      FROM chapters c
      JOIN series s ON s.id = c.series_id
      ORDER BY c.downloaded_at DESC LIMIT 20
    `).all() as RecentChapter[];
  } catch { /* ignore */ }

  let favorites: FavoriteSeries[] = [];
  try {
    favorites = db.prepare(`
      SELECT s.id, s.title, s.type, s.cover_path, s.status
      FROM favorites f
      JOIN series s ON s.id = f.series_id
      WHERE f.user_id = ?
      ORDER BY f.created_at DESC LIMIT 20
    `).all(userId) as FavoriteSeries[];
  } catch { /* ignore */ }

  const isEmpty = continueReading.length === 0 && recentChapters.length === 0;

  return (
    <div style={{ minHeight: "100vh" }}>
      <Navigation />

      <main className="home-content">
        {continueReading.length > 0 && (
          <Shelf title="Continue Reading" viewAllHref="/library">
            {continueReading.map((item) => (
              <ShelfCard
                key={item.series_id}
                href={`/library/${item.series_id}/read/${item.chapter_id}?page=${item.page}`}
                seriesId={item.series_id}
                hasCover={!!item.cover_path}
                title={item.series_title}
                subtitle={`Ch. ${item.chapter_number} · p. ${item.page + 1} / ${item.page_count}`}
                progressPct={
                  item.page_count > 1
                    ? Math.round((item.page / (item.page_count - 1)) * 100)
                    : 100
                }
              />
            ))}
          </Shelf>
        )}

        {recentChapters.length > 0 && (
          <Shelf title="Recently Added" viewAllHref="/library">
            {recentChapters.map((ch) => (
              <ShelfCard
                key={ch.chapter_id}
                href={`/library/${ch.series_id}/read/${ch.chapter_id}`}
                seriesId={ch.series_id}
                hasCover={!!ch.cover_path}
                title={ch.series_title}
                subtitle={`Ch. ${ch.chapter_number}`}
              />
            ))}
          </Shelf>
        )}

        {favorites.length > 0 && (
          <Shelf title="My Favorites" viewAllHref="/favorites" viewAllLabel="See all →">
            {favorites.map((s) => (
              <ShelfCard
                key={s.id}
                href={`/library/${s.id}`}
                seriesId={s.id}
                hasCover={!!s.cover_path}
                title={s.title}
                subtitle={s.type}
              />
            ))}
          </Shelf>
        )}

        {isEmpty && (
          <div className="empty-state" style={{ paddingTop: "120px" }}>
            <div className="empty-icon">◈</div>
            <p className="empty-title">Your library is empty</p>
            <p className="empty-desc">
              Add some manga from the dashboard to get started.
            </p>
            {session.user.isAdmin && (
              <Link href="/dashboard/add" className="btn btn-primary" style={{ marginTop: "16px" }}>
                + Add Manga
              </Link>
            )}
          </div>
        )}
      </main>

      <footer className="site-footer">
        <p style={{ fontSize: "13px", color: "var(--text-subtle)" }}>
          ComicOrbit — self-hosted comic &amp; manga library.
        </p>
      </footer>
    </div>
  );
}
