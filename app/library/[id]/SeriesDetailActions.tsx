"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type ReadingMode = "ltr" | "rtl" | "webtoon";

const MODE_LABELS: Record<ReadingMode, string> = {
  ltr: "Left → Right",
  rtl: "Right → Left",
  webtoon: "Webtoon (scroll)",
};

export default function SeriesDetailActions({
  seriesId,
  firstChapterId,
  sourceUrl,
  initialReadingMode,
  isAdmin = false,
}: {
  seriesId: number;
  firstChapterId: number | null;
  sourceUrl: string;
  initialReadingMode: ReadingMode;
  isAdmin?: boolean;
}) {
  const [fav, setFav] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [continueLink, setContinueLink] = useState<string | null>(null);
  const [readingMode, setReadingMode] = useState<ReadingMode>(initialReadingMode);
  const [savingMode, setSavingMode] = useState(false);

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

  async function handleModeChange(mode: ReadingMode) {
    setReadingMode(mode);
    setSavingMode(true);
    try {
      await fetch(`/api/series/${seriesId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ readingMode: mode }),
      });
    } catch { /* ignore */ }
    setSavingMode(false);
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

      {isAdmin && (
        <div className="reading-mode-row">
          <span className="reading-mode-label">Reading mode</span>
          <div className="reading-mode-pills">
            {(["ltr", "rtl", "webtoon"] as ReadingMode[]).map((m) => (
              <button
                key={m}
                className={`reading-mode-pill${readingMode === m ? " active" : ""}`}
                onClick={() => handleModeChange(m)}
                disabled={savingMode}
              >
                {MODE_LABELS[m]}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
