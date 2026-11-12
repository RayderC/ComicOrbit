"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import SeriesCard, { type Series } from "@/app/components/SeriesCard";

export default function FavoritesPage() {
  const router = useRouter();
  const [favorites, setFavorites] = useState<Series[]>([]);
  const [completedIds, setCompletedIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/favorites")
      .then((r) => {
        if (r.status === 401) { router.push("/login"); return null; }
        return r.json();
      })
      .then((data) => {
        if (data) setFavorites(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));

    fetch("/api/read/completed")
      .then((r) => (r.ok ? r.json() : []))
      .then((ids: number[]) => setCompletedIds(new Set(ids)))
      .catch(() => {});
  }, [router]);

  function handleMarkAllRead(id: number, completed: boolean) {
    setCompletedIds((prev) => {
      const next = new Set(prev);
      if (completed) next.add(id); else next.delete(id);
      return next;
    });
  }

  return (
    <div>
      <div className="page-wide">
        <div className="dash-header">
          <div>
            <h1 className="dash-title">Favorites</h1>
            <p className="dash-subtitle">Series you starred.</p>
          </div>
        </div>

        {loading ? (
          <div className="loading-state">
            <span className="loading-dot" /><span className="loading-dot" /><span className="loading-dot" />
          </div>
        ) : favorites.length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>No favorites yet. Hit the star on any series to add it here.</p>
        ) : (
          <div className="series-grid">
            {favorites.map((s) => (
              <SeriesCard
                key={s.id}
                series={s}
                isFavorite
                isComplete={completedIds.has(s.id)}
                onMarkAllRead={handleMarkAllRead}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
