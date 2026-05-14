"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface Collection { id: number; name: string; items: { id: number }[]; }

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
  const [collections, setCollections] = useState<Collection[]>([]);
  const [picker, setPicker] = useState(false);
  const [continueLink, setContinueLink] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/favorites")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: { id: number }[]) => { setFav(data.some((d) => d.id === seriesId)); setLoaded(true); })
      .catch(() => setLoaded(true));

    fetch("/api/collections")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Collection[]) => setCollections(data))
      .catch(() => {});

    fetch(`/api/read/progress?series_id=${seriesId}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: { chapter_id: number; page: number; completed: number; updated_at: string }[]) => {
        const unfinished = rows.filter((r) => r.completed === 0).sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
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

  async function addToCollection(cId: number) {
    await fetch(`/api/collections/${cId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ series_id: seriesId }),
    });
    setPicker(false);
  }

  async function newCollection() {
    const name = prompt("Collection name?");
    if (!name) return;
    const r = await fetch("/api/collections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (r.ok) {
      const { id } = await r.json();
      await addToCollection(id);
      fetch("/api/collections").then((rr) => rr.json()).then(setCollections).catch(() => {});
    }
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

      <div style={{ position: "relative" }}>
        <button className="btn btn-secondary" onClick={() => setPicker((v) => !v)}>+ Collection</button>
        {picker && (
          <div style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            background: "var(--surface)",
            border: "1px solid var(--border-bright)",
            borderRadius: "var(--radius-sm)",
            padding: "8px",
            zIndex: 50,
            minWidth: "200px",
            boxShadow: "var(--shadow)",
          }}>
            {collections.length === 0 && (
              <p style={{ fontSize: "12px", color: "var(--text-muted)", padding: "8px" }}>No collections yet.</p>
            )}
            {collections.map((c) => (
              <button
                key={c.id}
                onClick={() => addToCollection(c.id)}
                className="sidebar-item"
                style={{ width: "100%" }}
              >{c.name}</button>
            ))}
            <button onClick={newCollection} className="sidebar-item" style={{ color: "var(--primary-light)", width: "100%" }}>
              + Create new…
            </button>
          </div>
        )}
      </div>

      {sourceUrl && (
        <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm">
          Source ↗
        </a>
      )}
    </div>
  );
}
