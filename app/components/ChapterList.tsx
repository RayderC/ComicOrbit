"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export interface Chapter {
  id: number;
  series_id: number;
  number: number;
  title: string;
  page_count: number;
  downloaded_at: string;
}

interface ProgressEntry { page: number; completed: number; }

export default function ChapterList({ seriesId, chapters }: { seriesId: number; chapters: Chapter[] }) {
  const [progress, setProgress] = useState<Record<number, ProgressEntry>>({});

  useEffect(() => {
    fetch(`/api/read/progress?series_id=${seriesId}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: { chapter_id: number; page: number; completed: number }[]) => {
        const map: Record<number, ProgressEntry> = {};
        for (const row of rows) map[row.chapter_id] = { page: row.page, completed: row.completed };
        setProgress(map);
      })
      .catch(() => {});
  }, [seriesId]);

  async function toggleRead(c: Chapter, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const current = progress[c.id];
    const markRead = current?.completed !== 1;
    const newPage = markRead ? Math.max(0, c.page_count - 1) : 0;
    setProgress((prev) => ({ ...prev, [c.id]: { page: newPage, completed: markRead ? 1 : 0 } }));
    fetch("/api/read/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chapter_id: c.id, page: newPage, completed: markRead }),
    }).catch(() => {});
  }

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
        const prog = progress[c.id];
        const read = prog?.completed === 1;
        const pagedTo = prog?.page ?? 0;
        return (
          <Link
            key={c.id}
            href={`/library/${seriesId}/read/${c.id}?page=${pagedTo}`}
            className={`chapter-row${read ? " read" : ""}`}
          >
            <span className="chapter-row-num">
              #{c.number}
              {c.page_count > 0 && (
                <span className="chapter-row-pages">{c.page_count}p</span>
              )}
            </span>
            <span className="chapter-row-title">{c.title || `Chapter ${c.number}`}</span>
            <span className="chapter-row-meta">
              {pagedTo > 0 && !read && (
                <span className="chapter-row-resume">p{pagedTo + 1}</span>
              )}
              <button
                className={`chapter-read-toggle${read ? " read" : ""}`}
                onClick={(e) => toggleRead(c, e)}
                title={read ? "Mark as unread" : "Mark as read"}
              >
                {read ? "✓" : "○"}
              </button>
            </span>
          </Link>
        );
      })}
    </div>
  );
}
