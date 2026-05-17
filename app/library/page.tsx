"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Navigation from "../components/Navigation";
import SeriesCard, { type Series } from "../components/SeriesCard";

interface SeriesWithTags extends Series { tags?: string[]; }

export default function LibraryPage() {
  const [series, setSeries] = useState<SeriesWithTags[]>([]);
  const [favIds, setFavIds] = useState<Set<number>>(new Set());
  const [completedIds, setCompletedIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [tag, setTag] = useState("");
  const [type, setType] = useState<"" | "manga" | "comic">("");
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/series")
      .then((r) => r.json())
      .then((data: SeriesWithTags[]) => { setSeries(data); setLoading(false); })
      .catch(() => setLoading(false));

    fetch("/api/favorites")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: { id: number }[]) => setFavIds(new Set(data.map((d) => d.id))))
      .catch(() => {});

    fetch("/api/read/completed")
      .then((r) => (r.ok ? r.json() : []))
      .then((ids: number[]) => setCompletedIds(new Set(ids)))
      .catch(() => {});
  }, []);

  // Close filter panel when clicking outside
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (filterPanelRef.current && !filterPanelRef.current.contains(e.target as Node)) {
        setFiltersOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
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

  const activeFilterCount = [status, tag].filter(Boolean).length;

  function clearFilters() {
    setTag(""); setType(""); setStatus(""); setQ("");
  }

  function handleMarkAllRead(id: number, completed: boolean) {
    setCompletedIds((prev) => {
      const next = new Set(prev);
      if (completed) next.add(id); else next.delete(id);
      return next;
    });
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

        <div className="library-controls">
          {/* Type tabs — always visible */}
          <div className="library-type-tabs">
            <button className={`filter-chip${!type ? " filter-chip--active" : ""}`} onClick={() => setType("")}>
              All <span className="filter-chip-count">{series.length}</span>
            </button>
            <button className={`filter-chip${type === "manga" ? " filter-chip--active" : ""}`} onClick={() => setType("manga")}>
              Manga <span className="filter-chip-count">{series.filter((s) => s.type === "manga").length}</span>
            </button>
            <button className={`filter-chip${type === "comic" ? " filter-chip--active" : ""}`} onClick={() => setType("comic")}>
              Comics <span className="filter-chip-count">{series.filter((s) => s.type === "comic").length}</span>
            </button>
          </div>

          {/* Search + Filters button row */}
          <div className="library-search-row">
            <input
              className="form-input"
              type="search"
              placeholder="Search titles…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ flex: 1, minWidth: 0 }}
            />

            <div className="filter-panel-wrap" ref={filterPanelRef}>
              <button
                className={`library-filter-btn${filtersOpen || activeFilterCount > 0 ? " active" : ""}`}
                onClick={() => setFiltersOpen((v) => !v)}
              >
                Filters
                {activeFilterCount > 0 && (
                  <span className="library-filter-badge">{activeFilterCount}</span>
                )}
                <span style={{ fontSize: "10px" }}>{filtersOpen ? "▲" : "▼"}</span>
              </button>

              {filtersOpen && (
                <div className="library-filter-panel">
                  <div className="library-filter-section">
                    <p className="library-filter-section-label">Status</p>
                    <div className="filter-row" style={{ marginBottom: 0 }}>
                      {(["", "ongoing", "completed", "hiatus"] as const).map((s) => (
                        <button
                          key={s || "any"}
                          className={`filter-chip${status === s ? " filter-chip--active" : ""}`}
                          onClick={() => { setStatus(s); }}
                        >
                          {s === "" ? "Any" : s.charAt(0).toUpperCase() + s.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {allTags.length > 0 && (
                    <div className="library-filter-section">
                      <p className="library-filter-section-label">Tags</p>
                      <div className="filter-row" style={{ marginBottom: 0 }}>
                        <button
                          className={`filter-chip${!tag ? " filter-chip--active" : ""}`}
                          onClick={() => setTag("")}
                        >
                          All tags
                        </button>
                        {allTags.slice(0, 40).map((t) => (
                          <button
                            key={t}
                            className={`filter-chip${tag === t ? " filter-chip--active" : ""}`}
                            onClick={() => setTag(tag === t ? "" : t)}
                          >
                            {t} <span className="filter-chip-count">{tagCount(t)}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {activeFilterCount > 0 && (
                    <div style={{ paddingTop: "8px", borderTop: "1px solid var(--border)" }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => { clearFilters(); setFiltersOpen(false); }}>
                        Clear all filters
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
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
              <button className="btn btn-secondary btn-sm" onClick={clearFilters}>
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          <div className="series-grid">
            {visible.map((s) => (
              <SeriesCard
                key={s.id}
                series={s}
                isFavorite={favIds.has(s.id)}
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
