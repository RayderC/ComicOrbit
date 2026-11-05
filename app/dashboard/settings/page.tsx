"use client";

import { useEffect, useState } from "react";

export default function SettingsPage() {
  const [vapidSubject, setVapidSubject] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/site-config")
      .then((r) => r.json())
      .then((cfg: Record<string, string>) => {
        setVapidSubject(cfg.VAPID_SUBJECT || "");
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
        VAPID_SUBJECT: vapidSubject,
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
          <p className="dash-subtitle">Push notification identity.</p>
        </div>
      </div>

      <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: "24px", maxWidth: "560px" }}>
        {error && <p className="form-error">{error}</p>}
        {saved && <p style={{ color: "var(--success)", fontSize: "13px" }}>Saved.</p>}

        <div className="form-group">
          <label className="form-label" htmlFor="vapid-subject">Push notification identity (VAPID subject)</label>
          <input
            id="vapid-subject"
            className="form-input"
            type="text"
            value={vapidSubject}
            onChange={(e) => setVapidSubject(e.target.value)}
            placeholder="mailto:you@example.com"
          />
          <span className="form-hint">
            Apple&apos;s push service rejects fake addresses — use a real <code>mailto:</code> or
            an <code>https://</code> URL. Leave blank to use the built-in default.
          </span>
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
