"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AdminsOnly } from "@/app/components/AdminsOnly";
import { useMe } from "@/app/components/MeContext";

interface SearchHit {
  source: string;
  type: string;
  title: string;
  url: string;
  cover?: string;
  description?: string;
  status?: string;
  tags?: string[];
  chapters_hint?: string;
}

export default function AddSeriesPage() {
  const me = useMe();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchHit[]>([]);
  const [adding, setAdding] = useState<string | null>(null);
  const [err, setErr] = useState("");

  async function doSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearching(true);
    setResults([]);
    setErr("");
    try {
      const u = new URL("/api/search", window.location.origin);
      u.searchParams.set("q", q);
      const r = await fetch(u);
      if (!r.ok) throw new Error("search failed");
      const data = await r.json();
      setResults(data.results || []);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSearching(false);
    }
  }

  async function addToLibrary(hit: SearchHit) {
    setAdding(hit.url);
    setErr("");
    try {
      const r = await fetch("/api/series", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: hit.title,
          source: hit.source,
          source_url: hit.url,
          description: hit.description || "",
          cover: hit.cover || "",
        }),
      });
      if (!r.ok) throw new Error((await r.json()).message || "failed");
      router.push("/downloads");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setAdding(null);
    }
  }

  if (!me.isAdmin) return <AdminsOnly />;

  return (
    <div className="page">
      <div className="dash-header">
        <div>
          <h1 className="dash-title">Add series</h1>
          <p className="dash-subtitle">Search MangaFreak, then queue downloads.</p>
        </div>
      </div>

      <form onSubmit={doSearch} style={{ display: "flex", gap: "10px", marginBottom: "24px", maxWidth: "780px" }}>
        <input
          className="form-input"
          type="search"
          placeholder="Title to search…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          required
        />
        <button type="submit" className="btn btn-primary" disabled={searching || !q.trim()}>
          {searching ? "Searching…" : "Search"}
        </button>
      </form>

      {err && <p className="form-error" style={{ marginBottom: "16px" }}>{err}</p>}

      {results.length === 0 && !searching && (
        <div className="empty-state">
          <div className="empty-icon">⌕</div>
          <p className="empty-title">Start a search</p>
          <p className="empty-desc">Type a title above to discover manga from supported sources.</p>
        </div>
      )}

      {results.map((hit) => (
        <div key={`${hit.source}::${hit.url}`} className="search-result">
          <div className="search-result-cover">
            {hit.cover ? (
              <img
                src={`/api/proxy-img?url=${encodeURIComponent(hit.cover)}`}
                alt={hit.title}
                loading="lazy"
              />
            ) : null}
          </div>
          <div className="search-result-body">
            <div className="search-result-title">{hit.title}</div>
            <div className="search-result-meta">
              <span style={{ color: "var(--text-subtle)", fontFamily: "var(--font-mono)" }}>{`// ${hit.source}`}</span>
              {hit.status && hit.status !== "unknown" && <span className={`status-badge status-${hit.status}`}>{hit.status}</span>}
              {hit.tags?.slice(0, 4).map((t) => <span key={t} className="tag">{t}</span>)}
            </div>
            {hit.description && (
              <p className="search-result-desc">{hit.description}</p>
            )}
            {hit.chapters_hint && (
              <p className="search-result-desc" style={{ fontFamily: "var(--font-mono)" }}>{hit.chapters_hint}</p>
            )}
          </div>
          <div>
            <button
              className="btn btn-primary btn-sm"
              disabled={adding === hit.url}
              onClick={() => addToLibrary(hit)}
            >
              {adding === hit.url ? "Adding…" : "+ Queue"}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
