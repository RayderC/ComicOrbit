"use client";

import { useEffect, useState } from "react";

export default function SettingsPage() {
  const [site, setSite] = useState("ComicOrbit");
  const [manga, setManga] = useState("/Manga");
  const [comics, setComics] = useState("/Comics");
  const [tagline, setTagline] = useState("");
  const [description, setDescription] = useState("");
  const [defaultMangaSource, setDefaultMangaSource] = useState("mangadex");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/site-config")
      .then((r) => r.json())
      .then((cfg: Record<string, string>) => {
        setSite(cfg.SITE_NAME || "ComicOrbit");
        setManga(cfg.MANGA_DIRECTORY || "/Manga");
        setComics(cfg.COMICS_DIRECTORY || "/Comics");
        setTagline(cfg.tagline || "");
        setDescription(cfg.description || "");
        setDefaultMangaSource(cfg.default_manga_source || "mangadex");
      })
      .finally(() => setLoaded(true));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    setSaved(false);
    const r = await fetch("/api/site-config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        SITE_NAME: site,
        MANGA_DIRECTORY: manga,
        COMICS_DIRECTORY: comics,
        tagline,
        description,
        default_manga_source: defaultMangaSource,
      }),
    });
    setSaving(false);
    if (r.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } else {
      setError((await r.json()).message || "Failed to save");
    }
  }

  if (!loaded) return <p style={{ color: "var(--text-muted)" }}>Loading…</p>;

  return (
    <>
      <div className="dash-header">
        <div>
          <h1 className="dash-title">Settings</h1>
          <p className="dash-subtitle">Library paths, site name, and downloader defaults.</p>
        </div>
      </div>

      <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: "24px", maxWidth: "780px" }}>
        {error && <p className="form-error">{error}</p>}
        {saved && <p style={{ color: "var(--success)", fontSize: "13px" }}>Saved successfully.</p>}

        <div>
          <p className="sidebar-section-label" style={{ marginBottom: "16px" }}>Identity</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            <div className="form-group">
              <label className="form-label">Site Name</label>
              <input className="form-input" value={site} onChange={(e) => setSite(e.target.value)} />
              <span className="form-hint">Shown in the navigation and page titles.</span>
            </div>
            <div className="form-group">
              <label className="form-label">Tagline</label>
              <input className="form-input" value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="Your self-hosted comic & manga library" />
            </div>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Site Description</label>
          <textarea className="form-textarea" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          <span className="form-hint">Used in the HTML meta description.</span>
        </div>

        <div>
          <p className="sidebar-section-label" style={{ marginBottom: "16px" }}>Library paths</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            <div className="form-group">
              <label className="form-label">Manga directory</label>
              <input className="form-input" value={manga} onChange={(e) => setManga(e.target.value)} placeholder="/Manga" />
              <span className="form-hint">Absolute path inside the container.</span>
            </div>
            <div className="form-group">
              <label className="form-label">Comics directory</label>
              <input className="form-input" value={comics} onChange={(e) => setComics(e.target.value)} placeholder="/Comics" />
            </div>
          </div>
        </div>

        <div>
          <p className="sidebar-section-label" style={{ marginBottom: "16px" }}>Downloader</p>
          <div className="form-group" style={{ maxWidth: "320px" }}>
            <label className="form-label">Default manga source</label>
            <select className="form-select" value={defaultMangaSource} onChange={(e) => setDefaultMangaSource(e.target.value)}>
              <option value="mangadex">MangaDex (API, recommended)</option>
              <option value="mangafreak">MangaFreak (scraped fallback)</option>
            </select>
          </div>
        </div>

        <div style={{ display: "flex", gap: "12px", paddingTop: "8px" }}>
          <button type="submit" className="btn btn-primary btn-lg" disabled={saving}>
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </form>
    </>
  );
}
