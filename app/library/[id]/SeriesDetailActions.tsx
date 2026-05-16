"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function SeriesDetailActions({
  seriesId,
  firstChapterId,
  sourceUrl,
}: {
  seriesId: number;
  firstChapterId: number | null;
  sourceUrl: string;
}) {
  const [fav, setFav] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [continueLink, setContinueLink] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/favorites")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: { id: number }[]) => { setFav(data.some((d) => d.id === seriesId)); setLoaded(true); })
      .catch(() => setLoaded(true));

    fetch(`/api/read/progress?series_id=${seriesId}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: { chapter_id: number; page: number; completed: number; updated_at: string }[]) => {
        const unfinished = rows
          .filter((r) => r.completed === 0)
          .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
        if (unfinished) {
          setContinueLink(`/library/${seriesId}/read/${unfinished.chapter_id}?page=${unfinished.page}`);
        }
      })
      .catch(() => {});
  }, [seriesId]);

  async function toggleFav() {
    const next = !fav;
    setFav(next);
    await fetch("/api/favorites", {
      method: next ? "POST" : "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ series_id: seriesId }),
    });
  }

  return (
    <div className="series-detail-actions">
      {continueLink && (
        <Link href={continueLink} className="btn btn-primary">▶ Continue reading</Link>
      )}
      {!continueLink && firstChapterId && (
        <Link href={`/library/${seriesId}/read/${firstChapterId}`} className="btn btn-primary">▶ Start reading</Link>
      )}

      {loaded && (
        <button className={`favorite-btn${fav ? " active" : ""}`} onClick={toggleFav}>
          {fav ? "★ Favorited" : "☆ Favorite"}
        </button>
      )}

      {sourceUrl && (
        <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm">
          Source ↗
        </a>
      )}
    </div>
  );
}
