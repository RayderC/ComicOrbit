"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export interface Chapter {
  id: number;
  series_id: number;
  number: number;
  title: string;
  page_count: number;
  downloaded_at: string;
}

interface ProgressEntry { page: number; completed: number; }

const PER_PAGE = 50;

function buildPageRange(current: number, total: number): (number | "ellipsis-a" | "ellipsis-b")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "ellipsis-a" | "ellipsis-b")[] = [1];
  if (current > 3) pages.push("ellipsis-a");
  const lo = Math.max(2, current - 1);
  const hi = Math.min(total - 1, current + 1);
  for (let p = lo; p <= hi; p++) pages.push(p);
  if (current < total - 2) pages.push("ellipsis-b");
  pages.push(total);
  return pages;
}

export default function ChapterList({
  seriesId,
  chapters,
  isAdmin = false,
}: {
  seriesId: number;
  chapters: Chapter[];
  isAdmin?: boolean;
}) {
  const [progress, setProgress] = useState<Record<number, ProgressEntry>>({});
  const [localChapters, setLocalChapters] = useState(chapters);
  const [currentPage, setCurrentPage] = useState(1);
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const totalPages = Math.max(1, Math.ceil(localChapters.length / PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const start = (safePage - 1) * PER_PAGE;
  const visibleChapters = localChapters.slice(start, start + PER_PAGE);

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

  // Close menu when clicking outside
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenId(null);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function toggleRead(c: Chapter, e: React.MouseEvent) {
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

  async function deleteChapter(chapterId: number) {
    if (!confirm("Delete this chapter and its file? This cannot be undone.")) return;
    setMenuOpenId(null);
    const r = await fetch(`/api/chapters/${chapterId}`, { method: "DELETE" });
    if (r.ok) {
      setLocalChapters((prev) => prev.filter((c) => c.id !== chapterId));
    }
  }

  if (localChapters.length === 0) {
    return (
      <div className="empty-state" style={{ padding: "60px 24px" }}>
        <div className="empty-icon">⬡</div>
        <p className="empty-title">No chapters yet</p>
        <p className="empty-desc">Once the downloader finishes, chapters will appear here.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="chapter-list">
        {visibleChapters.map((c) => {
          const prog = progress[c.id];
          const read = prog?.completed === 1;
          const pagedTo = prog?.page ?? 0;
          const menuOpen = menuOpenId === c.id;

          return (
            <div key={c.id} className={`chapter-row${read ? " read" : ""}`}>
              <Link
                href={`/library/${seriesId}/read/${c.id}?page=${pagedTo}`}
                className="chapter-row-link"
              >
                <span className="chapter-row-num">#{c.number}</span>
                <span className="chapter-row-title">{c.title || `Chapter ${c.number}`}</span>
              </Link>

              <div className="chapter-row-actions">
                {c.page_count > 0 && (
                  <span className="chapter-row-pages">{c.page_count}p</span>
                )}
                {pagedTo > 0 && !read && (
                  <span className="chapter-row-resume">p{pagedTo + 1}</span>
                )}
                <button
                  className={`chapter-read-toggle${read ? " read" : ""}`}
                  onClick={(e) => toggleRead(c, e)}
                  title={read ? "Click to mark as unread" : "Click to mark as read"}
                >
                  {read ? "✓ Read" : "Mark read"}
                </button>
                {isAdmin && (
                  <div
                    className="chapter-menu-wrap"
                    ref={menuOpen ? menuRef : undefined}
                  >
                    <button
                      className="chapter-menu-btn"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setMenuOpenId(menuOpen ? null : c.id);
                      }}
                      title="Chapter options"
                    >
                      ⋯
                    </button>
                    {menuOpen && (
                      <div className="chapter-menu-dropdown">
                        <button
                          className="chapter-menu-item danger"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            deleteChapter(c.id);
                          }}
                        >
                          Delete chapter
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {totalPages > 1 && (
        <div className="chapter-pagination">
          <button
            className="chapter-page-btn"
            disabled={safePage === 1}
            onClick={() => setCurrentPage(safePage - 1)}
          >
            ‹
          </button>
          {buildPageRange(safePage, totalPages).map((p, i) =>
            typeof p === "string" ? (
              <span key={p + i} className="chapter-page-ellipsis">…</span>
            ) : (
              <button
                key={p}
                className={`chapter-page-btn${safePage === p ? " active" : ""}`}
                onClick={() => setCurrentPage(p)}
              >
                {p}
              </button>
            )
          )}
          <button
            className="chapter-page-btn"
            disabled={safePage === totalPages}
            onClick={() => setCurrentPage(safePage + 1)}
          >
            ›
          </button>
        </div>
      )}
    </div>
  );
}
