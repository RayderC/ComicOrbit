"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { TypeBadge } from "./StatusBadge";

export interface Series {
  id: number;
  slug: string;
  title: string;
  type: "manga" | "comic";
  cover_path?: string;
  status?: string;
  description?: string;
  tags?: string[];
  chapter_count?: number;
  updated_at?: string;
}

export default function SeriesCard({
  series,
  isFavorite = false,
  isComplete = false,
  onToggleFavorite,
  onMarkAllRead,
}: {
  series: Series;
  isFavorite?: boolean;
  isComplete?: boolean;
  onToggleFavorite?: (id: number, next: boolean) => void;
  onMarkAllRead?: (id: number, completed: boolean) => void;
}) {
  const [fav, setFav] = useState(isFavorite);
  const [favBusy, setFavBusy] = useState(false);
  const [markBusy, setMarkBusy] = useState(false);
  const [localComplete, setLocalComplete] = useState(isComplete);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Sync with parent when favorites/completed state loads asynchronously
  useEffect(() => { setFav(isFavorite); }, [isFavorite]);
  useEffect(() => { setLocalComplete(isComplete); }, [isComplete]);

  useEffect(() => {
    if (!menuOpen) return;
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setMenuPos(null);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  async function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (favBusy) return;
    setFavBusy(true);
    const next = !fav;
    setFav(next);
    if (onToggleFavorite) {
      onToggleFavorite(series.id, next);
    } else {
      await fetch("/api/favorites", {
        method: next ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ series_id: series.id }),
      });
    }
    setFavBusy(false);
  }

  async function handleMarkAllRead(e: React.MouseEvent, next: boolean) {
    e.preventDefault();
    e.stopPropagation();
    if (markBusy) return;
    setMarkBusy(true);
    setMenuOpen(false);
    setMenuPos(null);
    setLocalComplete(next);
    await fetch(`/api/series/${series.id}/mark-read`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: next }),
    }).catch(() => {});
    if (onMarkAllRead) onMarkAllRead(series.id, next);
    setMarkBusy(false);
  }

  function openMenu(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (menuOpen) { setMenuOpen(false); setMenuPos(null); return; }
    const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
    setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    setMenuOpen(true);
  }

  // Cache-bust by appending updated_at so uploaded covers show immediately
  const coverSrc = `/api/cover/${series.id}${series.updated_at ? `?v=${encodeURIComponent(series.updated_at)}` : ""}`;

  return (
    <>
      <Link href={`/library/${series.id}`} className="series-card">
        <div className="series-card-media">
          {series.cover_path ? (
            <img
              src={coverSrc}
              alt={series.title}
              loading="lazy"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
            />
          ) : null}
          <div className="series-card-media-placeholder">◈</div>

          <div className="series-card-type">
            <TypeBadge type={series.type} />
          </div>
          <button
            className={`series-card-favorite${fav ? " active" : ""}`}
            onClick={toggle}
            aria-label={fav ? "Remove from favorites" : "Add to favorites"}
          >
            {fav ? "★" : "☆"}
          </button>

          {localComplete && (
            <div className="series-card-complete-badge" title="All chapters read">✓</div>
          )}
        </div>

        <div className="series-card-body">
          <div className="series-card-body-row">
            <h3 className="series-card-title">{series.title}</h3>
            <button
              className="series-card-menu-btn"
              onClick={openMenu}
              aria-label="Series options"
            >
              ⋯
            </button>
          </div>
          <div className="series-card-meta">
            {series.status && series.status !== "unknown" && (
              <span style={{ textTransform: "uppercase", letterSpacing: "0.06em" }}>{series.status}</span>
            )}
            {series.chapter_count !== undefined && series.chapter_count > 0 && (
              <span className="series-card-ch-count">{series.chapter_count} ch</span>
            )}
          </div>
        </div>
      </Link>

      {/* Fixed-position dropdown — outside the Link to avoid navigation on click */}
      {menuOpen && menuPos && (
        <div
          ref={menuRef}
          className="series-card-menu-dropdown"
          style={{ position: "fixed", top: menuPos.top, right: menuPos.right, left: "auto" }}
        >
          {localComplete ? (
            <button
              className="series-card-menu-item"
              onClick={(e) => handleMarkAllRead(e, false)}
              disabled={markBusy}
            >
              Mark all unread
            </button>
          ) : (
            <button
              className="series-card-menu-item"
              onClick={(e) => handleMarkAllRead(e, true)}
              disabled={markBusy}
            >
              Mark all read
            </button>
          )}
        </div>
      )}
    </>
  );
}
