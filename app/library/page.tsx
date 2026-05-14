"use client";

import { useEffect, useMemo, useState } from "react";
import Navigation from "../components/Navigation";
import SeriesCard, { type Series } from "../components/SeriesCard";

interface SeriesWithTags extends Series { tags?: string[]; }

export default function LibraryPage() {
  const [series, setSeries] = useState<SeriesWithTags[]>([]);
  const [favIds, setFavIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [tag, setTag] = useState("");
  const [type, setType] = useState<"" | "manga" | "comic">("");
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    fetch("/api/series")
      .then((r) => r.json())
      .then((data: SeriesWithTags[]) => { setSeries(data); setLoading(false); })
      .catch(() => setLoading(false));

    fetch("/api/favorites")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: { id: number }[]) => setFavIds(new Set(data.map((d) => d.id))))
      .catch(() => {});
  }, []);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    series.forEach((s) => (s.tags || []).forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [series]);

  const visible = useMemo(() => series.filter((s) => {
    if (type && s.type !== type) return false;
    if (status && s.status !== status) return false;
    if (tag && !(s.tags || []).includes(tag)) return false;
    if (q) {
      const t = q.toLowerCase();
      if (!s.title.toLowerCase().includes(t) && !(s.description || "").toLowerCase().includes(t)) return false;
    }
    return true;
  }), [series, type, status, tag, q]);

  function tagCount(t: string) {
    return series.filter((s) => (s.tags || []).includes(t)).length;
  }

  return (
    <div style={{ minHeight: "100vh" }}>
      <Navigation />

      <div className="projects-page-inner">
        <div className="projects-page-header">
          <p className="section-eyebrow">Library</p>
          <h1 className="projects-page-title">All Series</h1>
          <p className="projects-page-desc">
            {loading ? "Loading…" : `${series.length} series in your collection.`}
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginBottom: "28px" }}>
          <div className="filter-row">
            <button className={`filter-chip${!type ? " filter-chip--active" : ""}`} onClick={() => setType("")}>
              All <span className="filter-chip-count">{series.length}</span>
            </button>
            <button className={`filter-chip${type === "manga" ? " filter-chip--active" : ""}`} onClick={() => setType("manga")}>
              Manga <span className="filter-chip-count">{series.filter((s) => s.type === "manga").length}</span>
            </button>
            <button className={`filter-chip${type === "comic" ? " filter-chip--active" : ""}`} onClick={() => setType("comic")}>
              Comics <span className="filter-chip-count">{series.filter((s) => s.type === "comic").length}</span>
            </button>

            <span style={{ width: "16px" }} />

            <button className={`filter-chip${!status ? " filter-chip--active" : ""}`} onClick={() => setStatus("")}>Any status</button>
            <button className={`filter-chip${status === "ongoing" ? " filter-chip--active" : ""}`} onClick={() => setStatus("ongoing")}>Ongoing</button>
            <button className={`filter-chip${status === "completed" ? " filter-chip--active" : ""}`} onClick={() => setStatus("completed")}>Completed</button>
            <button className={`filter-chip${status === "hiatus" ? " filter-chip--active" : ""}`} onClick={() => setStatus("hiatus")}>Hiatus</button>
          </div>

          <input
            className="form-input"
            type="search"
            placeholder="Search titles or descriptions…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ maxWidth: "480px" }}
          />

          {allTags.length > 0 && (
            <div className="filter-row">
              <button className={`filter-chip${!tag ? " filter-chip--active" : ""}`} onClick={() => setTag("")}>
                All tags
              </button>
              {allTags.slice(0, 30).map((t) => (
                <button
                  key={t}
                  className={`filter-chip${tag === t ? " filter-chip--active" : ""}`}
                  onClick={() => setTag(tag === t ? "" : t)}
                >
                  {t} <span className="filter-chip-count">{tagCount(t)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {loading ? (
          <div className="loading-state">
            <span className="loading-dot" /><span className="loading-dot" /><span className="loading-dot" />
          </div>
        ) : visible.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">◈</div>
            <p className="empty-title">No matches</p>
            <p className="empty-desc">Try clearing some filters.</p>
            {(tag || type || status || q) && (
              <button className="btn btn-secondary btn-sm" onClick={() => { setTag(""); setType(""); setStatus(""); setQ(""); }}>
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          <div className="series-grid">
            {visible.map((s) => (
              <SeriesCard key={s.id} series={s} isFavorite={favIds.has(s.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
