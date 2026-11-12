"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type ReadingMode = "ltr" | "rtl" | "webtoon";

interface SeriesRow {
  id: number; slug: string; title: string;
  status: string; source: string; source_url: string;
  reading_mode: ReadingMode;
  original_cover_path: string;
  created_at: string; updated_at: string;
}

const MODE_LABELS: Record<ReadingMode, string> = { ltr: "Left to right", rtl: "Right to left", webtoon: "Webtoon" };

/** Every series on the server, like "All vehicles" in NitroLog: reading direction, cover, check again, remove. */
export default function SeriesSection() {
  const [rows, setRows] = useState<SeriesRow[] | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ id: number; text: string } | null>(null);
  const [pendingCover, setPendingCover] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function load() {
    fetch("/api/series").then(r => r.json()).then((d: SeriesRow[]) => setRows(Array.isArray(d) ? d : [])).catch(() => setRows([]));
  }
  useEffect(load, []);

  async function run(id: number, fn: () => Promise<string | void>) {
    setBusy(id); setMsg(null);
    try { const t = await fn(); if (t) setMsg({ id, text: t }); }
    finally { setBusy(null); }
  }

  const requeue = (id: number) => run(id, async () => {
    const r = await fetch("/api/downloads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ series_id: id }) });
    return r.ok ? "Queued. It checks for new chapters in Downloads." : "Couldn't queue it.";
  });

  const del = (s: SeriesRow, withFiles: boolean) => {
    if (!confirm(`Remove "${s.title}"${withFiles ? " and delete its files from the disk" : " from the library (its files stay on the disk)"}? This can't be undone.`)) return;
    run(s.id, async () => { await fetch(`/api/series/${s.id}${withFiles ? "?files=true" : ""}`, { method: "DELETE" }); load(); });
  };

  function handleCoverFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    const id = pendingCover;
    if (!file || !id) return;
    const reader = new FileReader();
    reader.onload = () => run(id, async () => {
      const res = await fetch(`/api/series/${id}/cover`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dataUrl: reader.result }) }).catch(() => null);
      setPendingCover(null);
      load();
      return res?.ok ? "New cover saved." : "Cover upload failed. Check that the series folder is reachable.";
    });
    reader.readAsDataURL(file);
  }

  const revertCover = (id: number) => {
    if (!confirm("Go back to the original cover?")) return;
    run(id, async () => { await fetch(`/api/series/${id}/cover`, { method: "DELETE" }).catch(() => null); load(); return "Back to the original cover."; });
  };

  async function changeMode(id: number, mode: ReadingMode) {
    setRows(prev => prev?.map(s => (s.id === id ? { ...s, reading_mode: mode } : s)) ?? prev);
    await fetch(`/api/series/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ readingMode: mode }) }).catch(() => {});
  }

  return (
    <>
      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleCoverFile} />
      {!rows ? <div className="loading">Loading…</div> : rows.length === 0 ? (
        <p className="settings-hint">No series yet. <Link href="/add" className="text-link">Add one</Link>.</p>
      ) : (
        <div className="row-list">
          {rows.map(s => (
            <div key={s.id} className="row-card" data-series={s.title}>
              <div className="row-top">
                <Link href={`/library/${s.id}`} className="row-title">{s.title}</Link>
                {s.status !== "unknown" && <span className={`status-badge status-${s.status}`}>{s.status}</span>}
              </div>
              <div className="row-stats">
                <span>{s.source}</span>
                <span>Updated {new Date(s.updated_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span>
              </div>
              <div className="flex gap-2 items-center" style={{ marginTop: 10, flexWrap: "wrap" }}>
                <label className="form-label" htmlFor={`mode-${s.id}`} style={{ margin: 0 }}>Reads</label>
                <select id={`mode-${s.id}`} className="form-input admin-select" value={s.reading_mode || "ltr"} onChange={e => changeMode(s.id, e.target.value as ReadingMode)}>
                  {(Object.keys(MODE_LABELS) as ReadingMode[]).map(m => <option key={m} value={m}>{MODE_LABELS[m]}</option>)}
                </select>
              </div>
              <div className="flex gap-2" style={{ marginTop: 10, flexWrap: "wrap" }}>
                <button className="btn btn-secondary btn-sm" disabled={busy === s.id} onClick={() => requeue(s.id)}>Check for new chapters</button>
                <button className="btn btn-secondary btn-sm" disabled={busy === s.id} onClick={() => { setPendingCover(s.id); fileInputRef.current?.click(); }}>New cover</button>
                {s.original_cover_path && <button className="btn btn-ghost btn-sm" disabled={busy === s.id} onClick={() => revertCover(s.id)}>Original cover</button>}
                <button className="btn btn-danger btn-sm" disabled={busy === s.id} onClick={() => del(s, false)}>Remove</button>
                <button className="btn btn-danger btn-sm" disabled={busy === s.id} onClick={() => del(s, true)}>Delete with files</button>
              </div>
              {msg?.id === s.id && <p className="settings-hint" role="status" style={{ marginTop: 8 }}>{msg.text}</p>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
