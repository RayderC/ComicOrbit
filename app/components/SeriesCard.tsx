"use client";

import Link from "next/link";
import { useState } from "react";
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
}

export default function SeriesCard({
  series,
  isFavorite = false,
  onToggleFavorite,
}: {
  series: Series;
  isFavorite?: boolean;
  onToggleFavorite?: (id: number, next: boolean) => void;
}) {
  const [fav, setFav] = useState(isFavorite);
  const [busy, setBusy] = useState(false);

  async function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
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
    setBusy(false);
  }

  return (
    <Link href={`/library/${series.id}`} className="series-card">
      <div className="series-card-media">
        {series.cover_path ? (
          <img
            src={`/api/cover/${series.id}`}
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
      </div>

      <div className="series-card-body">
        <h3 className="series-card-title">{series.title}</h3>
        {series.status && series.status !== "unknown" && (
          <div className="series-card-meta">
            <span style={{ textTransform: "uppercase", letterSpacing: "0.06em" }}>{series.status}</span>
          </div>
        )}
      </div>
    </Link>
  );
}
