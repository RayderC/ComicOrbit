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
  // Fixed-position coordinates for the dropdown (avoids z-index/overflow clipping)
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const menuDropdownRef = useRef<HTMLDivElement>(null);

  // Multi-select state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

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

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (menuDropdownRef.current && !menuDropdownRef.current.contains(e.target as Node)) {
        setMenuOpenId(null);
        setMenuPos(null);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  // Close dropdown on scroll (fixed position needs this)
  useEffect(() => {
    if (!menuOpenId) return;
    function onScroll() { setMenuOpenId(null); setMenuPos(null); }
    window.addEventListener("scroll", onScroll, true);
    return () => window.removeEventListener("scroll", onScroll, true);
  }, [menuOpenId]);

  function toggleSelectionMode() {
    setSelectionMode((v) => !v);
    setSelectedIds(new Set());
    setMenuOpenId(null);
    setMenuPos(null);
  }

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(localChapters.map((c) => c.id)));
  }

  function deselectAll() {
    setSelectedIds(new Set());
  }

  async function bulkMark(completed: boolean) {
    if (selectedIds.size === 0 || bulkBusy) return;
    setBulkBusy(true);
    const ids = Array.from(selectedIds);
    setProgress((prev) => {
      const next = { ...prev };
      for (const id of ids) {
        const chapter = localChapters.find((c) => c.id === id);
        const newPage = completed ? Math.max(0, (chapter?.page_count ?? 1) - 1) : 0;
        next[id] = { page: newPage, completed: completed ? 1 : 0 };
      }
      return next;
    });
    await Promise.all(
      ids.map((id) => {
        const chapter = localChapters.find((c) => c.id === id);
        const page = completed ? Math.max(0, (chapter?.page_count ?? 1) - 1) : 0;
        return fetch("/api/read/progress", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chapter_id: id, page, completed }),
        }).catch(() => {});
      })
    );
    setBulkBusy(false);
    setSelectedIds(new Set());
  }

  async function bulkDelete() {
    if (selectedIds.size === 0 || bulkBusy) return;
    if (!confirm(`Delete ${selectedIds.size} chapter(s) and their files? This cannot be undone.`)) return;
    setBulkBusy(true);
    const ids = Array.from(selectedIds);
    await Promise.all(
      ids.map((id) => fetch(`/api/chapters/${id}`, { method: "DELETE" }).catch(() => {}))
    );
    setLocalChapters((prev) => prev.filter((c) => !ids.includes(c.id)));
    setBulkBusy(false);
    setSelectedIds(new Set());
  }

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
    setMenuPos(null);
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
      <div className="chapter-list-header">
        <button
          className={`chapter-select-btn${selectionMode ? " active" : ""}`}
          onClick={toggleSelectionMode}
        >
          {selectionMode ? "Cancel" : "Select"}
        </button>
      </div>

      {selectionMode && (
        <div className="chapter-bulk-toolbar">
          <span className="chapter-bulk-count">
            {selectedIds.size} selected
          </span>
          <div className="chapter-bulk-spacer" />
          <button className="btn btn-ghost btn-sm" onClick={selectAll} disabled={bulkBusy}>
            Select all ({localChapters.length})
          </button>
          <button className="btn btn-ghost btn-sm" onClick={deselectAll} disabled={bulkBusy || selectedIds.size === 0}>
            Deselect all
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => bulkMark(true)}
            disabled={bulkBusy || selectedIds.size === 0}
          >
            Mark read
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => bulkMark(false)}
            disabled={bulkBusy || selectedIds.size === 0}
          >
            Mark unread
          </button>
          {isAdmin && (
            <button
              className="btn btn-danger btn-sm"
              onClick={bulkDelete}
              disabled={bulkBusy || selectedIds.size === 0}
            >
              Delete ({selectedIds.size})
            </button>
          )}
        </div>
      )}

      <div className="chapter-list">
        {visibleChapters.map((c) => {
          const prog = progress[c.id];
          const read = prog?.completed === 1;
          const pagedTo = prog?.page ?? 0;
          const menuOpen = menuOpenId === c.id;
          const selected = selectedIds.has(c.id);

          return (
            <div
              key={c.id}
              className={`chapter-row${read ? " read" : ""}${selected ? " selected" : ""}`}
            >
              {selectionMode && (
                <button
                  className={`chapter-row-checkbox${selected ? " checked" : ""}`}
                  onClick={(e) => { e.preventDefault(); toggleSelect(c.id); }}
                  aria-label={selected ? "Deselect" : "Select"}
                >
                  {selected ? "✓" : ""}
                </button>
              )}

              <Link
                href={selectionMode ? "#" : `/library/${seriesId}/read/${c.id}?page=${pagedTo}`}
                className="chapter-row-link"
                onClick={selectionMode ? (e) => { e.preventDefault(); toggleSelect(c.id); } : undefined}
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
                {!selectionMode && (
                  <button
                    className={`chapter-read-toggle${read ? " read" : ""}`}
                    onClick={(e) => toggleRead(c, e)}
                    title={read ? "Click to mark as unread" : "Click to mark as read"}
                  >
                    {read ? "✓ Read" : "Mark read"}
                  </button>
                )}
                {isAdmin && !selectionMode && (
                  <button
                    className="chapter-menu-btn"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (menuOpen) {
                        setMenuOpenId(null);
                        setMenuPos(null);
                      } else {
                        const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                        setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
                        setMenuOpenId(c.id);
                      }
                    }}
                    title="Chapter options"
                  >
                    ⋯
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Fixed-position dropdown rendered outside the list so it's never clipped */}
      {menuOpenId !== null && menuPos && (
        <div
          ref={menuDropdownRef}
          className="chapter-menu-dropdown"
          style={{ position: "fixed", top: menuPos.top, right: menuPos.right, left: "auto" }}
        >
          <button
            className="chapter-menu-item danger"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              deleteChapter(menuOpenId);
            }}
          >
            Delete chapter
          </button>
        </div>
      )}

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
