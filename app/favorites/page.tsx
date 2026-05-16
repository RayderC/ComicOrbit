"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Navigation from "../components/Navigation";
import SeriesCard, { type Series } from "../components/SeriesCard";

export default function FavoritesPage() {
  const router = useRouter();
  const [favorites, setFavorites] = useState<Series[]>([]);
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
  }, [router]);

  return (
    <div style={{ minHeight: "100vh" }}>
      <Navigation />

      <div className="projects-page-inner">
        <div className="projects-page-header">
          <p className="section-eyebrow">Yours</p>
          <h1 className="projects-page-title">Favorites</h1>
        </div>

        {loading ? (
          <div className="loading-state">
            <span className="loading-dot" /><span className="loading-dot" /><span className="loading-dot" />
          </div>
        ) : favorites.length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>No favorites yet. Hit the star on any series to add it here.</p>
        ) : (
          <div className="series-grid">
            {favorites.map((s) => <SeriesCard key={s.id} series={s} isFavorite />)}
          </div>
        )}
      </div>
    </div>
  );
}
