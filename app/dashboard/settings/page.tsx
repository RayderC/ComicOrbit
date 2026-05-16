"use client";

import { useEffect, useState } from "react";

export default function SettingsPage() {
  const [defaultMangaSource, setDefaultMangaSource] = useState("mangafreak");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/site-config")
      .then((r) => r.json())
      .then((cfg: Record<string, string>) => {
        setDefaultMangaSource(cfg.default_manga_source || "mangafreak");
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
      body: JSON.stringify({ default_manga_source: defaultMangaSource }),
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
          <p className="dash-subtitle">Downloader defaults.</p>
        </div>
      </div>

      <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: "24px", maxWidth: "480px" }}>
        {error && <p className="form-error">{error}</p>}
        {saved && <p style={{ color: "var(--success)", fontSize: "13px" }}>Saved.</p>}

        <div className="form-group">
          <label className="form-label">Default manga source</label>
          <select
            className="form-select"
            value={defaultMangaSource}
            onChange={(e) => setDefaultMangaSource(e.target.value)}
          >
            <option value="mangafreak">MangaFreak (scraped)</option>
            <option value="mangadex">MangaDex (API)</option>
          </select>
          <span className="form-hint">Which source to search first when adding new manga.</span>
        </div>

        <div>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </>
  );
}
