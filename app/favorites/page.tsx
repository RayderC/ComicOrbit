"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Navigation from "../components/Navigation";
import SeriesCard, { type Series } from "../components/SeriesCard";

interface Collection {
  id: number;
  name: string;
  items: { id: number; slug: string; title: string; type: "manga" | "comic"; cover_path: string }[];
}

export default function FavoritesPage() {
  const router = useRouter();
  const [favorites, setFavorites] = useState<Series[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);

  function reload() {
    Promise.all([
      fetch("/api/favorites").then((r) => (r.status === 401 ? null : r.json())),
      fetch("/api/collections").then((r) => (r.status === 401 ? [] : r.json())),
    ]).then(([f, c]) => {
      if (f === null) { router.push("/login"); return; }
      setFavorites(f);
      setCollections(c);
      setLoading(false);
    }).catch(() => setLoading(false));
  }

  useEffect(reload, [router]);

  async function newCollection() {
    const name = prompt("Collection name?");
    if (!name) return;
    await fetch("/api/collections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    reload();
  }

  async function deleteCollection(id: number, name: string) {
    if (!confirm(`Delete collection "${name}"?`)) return;
    await fetch(`/api/collections/${id}`, { method: "DELETE" });
    reload();
  }

  return (
    <div style={{ minHeight: "100vh" }}>
      <Navigation />

      <div className="projects-page-inner">
        <div className="projects-page-header">
          <p className="section-eyebrow">Yours</p>
          <h1 className="projects-page-title">Favorites & Collections</h1>
        </div>

        {loading ? (
          <div className="loading-state">
            <span className="loading-dot" /><span className="loading-dot" /><span className="loading-dot" />
          </div>
        ) : (
          <>
            <section>
              <div className="section-header-row">
                <h2 className="section-title" style={{ fontSize: "20px", marginBottom: 0 }}>★ Favorites</h2>
              </div>
              {favorites.length === 0 ? (
                <p style={{ color: "var(--text-muted)" }}>No favorites yet. Hit the star on any series to add it here.</p>
              ) : (
                <div className="series-grid">
                  {favorites.map((s) => <SeriesCard key={s.id} series={s} isFavorite />)}
                </div>
              )}
            </section>

            <hr className="section-divider" style={{ margin: "48px 0" }} />

            <section>
              <div className="section-header-row">
                <h2 className="section-title" style={{ fontSize: "20px", marginBottom: 0 }}>Collections</h2>
                <button className="btn btn-secondary" onClick={newCollection}>+ New collection</button>
              </div>

              {collections.length === 0 && (
                <p style={{ color: "var(--text-muted)" }}>No collections yet.</p>
              )}

              {collections.map((c) => (
                <div key={c.id} style={{ marginBottom: "32px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "10px" }}>
                    <h3 className="section-title" style={{ fontSize: "18px", marginBottom: 0 }}>
                      {c.name}
                      <span style={{ color: "var(--text-subtle)", fontSize: "13px", fontFamily: "var(--font-mono)", marginLeft: "12px" }}>
                        {`// ${c.items.length}`}
                      </span>
                    </h3>
                    <button className="btn btn-ghost btn-sm" onClick={() => deleteCollection(c.id, c.name)}>Delete</button>
                  </div>
                  {c.items.length === 0 ? (
                    <p style={{ color: "var(--text-subtle)", fontSize: "13px" }}>Empty — add series from their detail page.</p>
                  ) : (
                    <div className="series-grid">
                      {c.items.map((it) => (
                        <SeriesCard
                          key={it.id}
                          series={{ ...it, description: "" }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
