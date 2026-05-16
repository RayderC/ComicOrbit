import { notFound } from "next/navigation";
import Link from "next/link";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { sessionOptions, User } from "@/lib/session";
import Navigation from "../../components/Navigation";
import { StatusBadge, TypeBadge } from "../../components/StatusBadge";
import ChapterList, { type Chapter } from "../../components/ChapterList";
import SeriesDetailActions from "./SeriesDetailActions";
import db from "@/lib/db";

export const dynamic = "force-dynamic";

interface SeriesRow {
  id: number;
  slug: string;
  title: string;
  type: "manga" | "comic";
  description: string;
  cover_path: string;
  status: string;
  source: string;
  source_url: string;
  reading_mode: string;
}

export default async function SeriesDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const seriesId = Number(id);
  if (!Number.isFinite(seriesId)) notFound();

  const session = await getIronSession<{ user?: User }>(await cookies(), sessionOptions);
  const isAdmin = session.user?.isAdmin === true;

  const series = db.prepare(`
    SELECT id, slug, title, type, description, cover_path, status, source, source_url, reading_mode
    FROM series WHERE id = ?
  `).get(seriesId) as SeriesRow | undefined;
  if (!series) notFound();

  const tags = (db.prepare("SELECT tag FROM series_tags WHERE series_id = ?").all(seriesId) as { tag: string }[]).map((t) => t.tag);
  const chapters = db.prepare(`
    SELECT id, series_id, number, title, file_path, page_count, downloaded_at
    FROM chapters WHERE series_id = ?
    ORDER BY number ASC
  `).all(seriesId) as Chapter[];

  return (
    <div>
      <Navigation />

      <div className="project-detail-page">
        <Link href="/library" className="back-link">← Back to library</Link>

        <div className="series-detail-hero">
          <div className="series-detail-cover">
            {series.cover_path ? (
              <img src={`/api/cover/${series.id}`} alt={series.title} />
            ) : (
              <div className="series-card-media-placeholder">◈</div>
            )}
          </div>

          <div>
            <div style={{ marginBottom: "10px" }}>
              <TypeBadge type={series.type} />
            </div>
            <h1 className="project-detail-title">{series.title}</h1>

            <div className="series-detail-meta-row">
              <StatusBadge status={series.status || "unknown"} />
              {tags.slice(0, 6).map((t) => <span key={t} className="tag">{t}</span>)}
            </div>

            {series.description && (
              <div className="series-detail-description">{series.description}</div>
            )}

            <SeriesDetailActions
              seriesId={series.id}
              firstChapterId={chapters[0]?.id ?? null}
              sourceUrl={series.source_url}
              initialReadingMode={(["ltr", "rtl", "webtoon"].includes(series.reading_mode)
                ? series.reading_mode : "ltr") as "ltr" | "rtl" | "webtoon"}
              isAdmin={isAdmin}
            />
          </div>
        </div>

        <h2 className="section-title" style={{ fontSize: "20px", marginBottom: "12px" }}>
          Chapters <span style={{ color: "var(--text-subtle)", fontSize: "14px", fontFamily: "var(--font-mono)" }}>{`// ${chapters.length}`}</span>
        </h2>
        <ChapterList seriesId={series.id} chapters={chapters} isAdmin={isAdmin} />
      </div>
    </div>
  );
}
