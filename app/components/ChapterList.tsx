"use client";

import Link from "next/link";

export interface Chapter {
  id: number;
  series_id: number;
  number: number;
  title: string;
  page_count: number;
  downloaded_at: string;
  progress?: { page: number; completed: number } | null;
}

export default function ChapterList({ seriesId, chapters }: { seriesId: number; chapters: Chapter[] }) {
  if (chapters.length === 0) {
    return (
      <div className="empty-state" style={{ padding: "60px 24px" }}>
        <div className="empty-icon">⬡</div>
        <p className="empty-title">No chapters yet</p>
        <p className="empty-desc">Once the downloader finishes, chapters will appear here.</p>
      </div>
    );
  }

  return (
    <div className="chapter-list">
      {chapters.map((c) => {
        const read = c.progress?.completed === 1;
        const pagedTo = c.progress?.page ?? 0;
        return (
          <Link
            key={c.id}
            href={`/library/${seriesId}/read/${c.id}?page=${pagedTo}`}
            className={`chapter-row${read ? " read" : ""}`}
          >
            <span className="chapter-row-num">#{c.number}</span>
            <span className="chapter-row-title">{c.title || `Chapter ${c.number}`}</span>
            <span className="chapter-row-meta">
              {c.page_count > 0 ? `${c.page_count} pages` : "—"}
              {pagedTo > 0 && !read ? ` • p${pagedTo + 1}` : ""}
              {read ? " • read" : ""}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
