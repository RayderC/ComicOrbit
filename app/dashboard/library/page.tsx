"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface SeriesRow {
  id: number; slug: string; title: string; type: "manga" | "comic";
  status: string; source: string; source_url: string;
  created_at: string; updated_at: string;
}

export default function AdminLibraryPage() {
  const [rows, setRows] = useState<SeriesRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);

  function load() {
    fetch("/api/series").then((r) => r.json()).then((d: SeriesRow[]) => { setRows(d); setLoading(false); });
  }
  useEffect(load, []);

  async function requeue(id: number) {
    setBusy(id);
    await fetch("/api/downloads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ series_id: id }),
    });
    setBusy(null);
  }

  async function del(id: number, title: string, withFiles: boolean) {
    if (!confirm(`Delete "${title}"${withFiles ? " and its files on disk" : ""}? This cannot be undone.`)) return;
    setBusy(id);
    await fetch(`/api/series/${id}${withFiles ? "?files=true" : ""}`, { method: "DELETE" });
    setBusy(null);
    load();
  }

  return (
    <>
      <div className="dash-header">
        <div>
          <h1 className="dash-title">Library</h1>
          <p className="dash-subtitle">Re-queue scans, manage metadata, remove series.</p>
        </div>
        <Link href="/dashboard/add" className="btn btn-primary">+ Add Series</Link>
      </div>

      {loading ? (
        <p style={{ color: "var(--text-muted)" }}>Loading…</p>
      ) : rows.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">◈</div>
          <p className="empty-title">Library is empty</p>
          <p className="empty-desc">Add a series to get started.</p>
          <Link href="/dashboard/add" className="btn btn-primary btn-sm">Add Series</Link>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Type</th>
                <th>Source</th>
                <th>Status</th>
                <th>Updated</th>
                <th style={{ width: "260px" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td>
                    <Link href={`/library/${s.id}`} style={{ color: "var(--text)", fontWeight: 600 }}>{s.title}</Link>
                  </td>
                  <td><span className={`type-badge type-${s.type}`}>{s.type}</span></td>
                  <td style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: "12px" }}>{s.source}</td>
                  <td>
                    {s.status !== "unknown"
                      ? <span className={`status-badge status-${s.status}`}>{s.status}</span>
                      : <span style={{ color: "var(--text-subtle)" }}>—</span>}
                  </td>
                  <td style={{ color: "var(--text-muted)", fontSize: "13px" }}>
                    {new Date(s.updated_at).toLocaleDateString()}
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => requeue(s.id)} disabled={busy === s.id}>
                        {busy === s.id ? "…" : "Re-queue"}
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={() => del(s.id, s.title, false)} disabled={busy === s.id}>
                        Remove
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={() => del(s.id, s.title, true)} disabled={busy === s.id}>
                        Delete + files
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
