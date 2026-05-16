"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface Counts {
  series: number;
  manga: number;
  comic: number;
  chapters: number;
  queued: number;
  downloading: number;
  users: number;
}

export default function DashboardOverview() {
  const [c, setC] = useState<Counts | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/series").then((r) => r.json()),
      fetch("/api/downloads").then((r) => r.json()),
      fetch("/api/users").then((r) => r.json()),
    ]).then(([series, downloads, users]) => {
      const arr = Array.isArray(series) ? series : [];
      const dl = Array.isArray(downloads) ? downloads : [];
      const us = Array.isArray(users) ? users : [];
      setC({
        series: arr.length,
        manga: arr.filter((s: { type: string }) => s.type === "manga").length,
        comic: arr.filter((s: { type: string }) => s.type === "comic").length,
        chapters: 0,
        queued: dl.filter((q: { status: string }) => q.status === "queued").length,
        downloading: dl.filter((q: { status: string }) => q.status === "downloading").length,
        users: us.length,
      });
    });
  }, []);

  async function handleScan() {
    setScanning(true);
    setScanMsg("");
    try {
      const r = await fetch("/api/scan", { method: "POST" });
      if (r.ok) setScanMsg("Scan started — new chapters will appear in Downloads.");
      else setScanMsg("Scan failed to start.");
    } catch {
      setScanMsg("Scan failed to start.");
    }
    setScanning(false);
    setTimeout(() => setScanMsg(""), 6000);
  }

  return (
    <>
      <div className="dash-header">
        <div>
          <h1 className="dash-title">Overview</h1>
          <p className="dash-subtitle">Quick stats and shortcuts for your library.</p>
        </div>
        <Link href="/dashboard/add" className="btn btn-primary">+ Add Series</Link>
      </div>

      {c ? (
        <>
          <div className="stats-row">
            <div className="stat-card"><div className="stat-value">{c.series}</div><div className="stat-label">Series</div></div>
            <div className="stat-card"><div className="stat-value">{c.manga}</div><div className="stat-label">Manga</div></div>
            <div className="stat-card"><div className="stat-value">{c.comic}</div><div className="stat-label">Comics</div></div>
            <div className="stat-card"><div className="stat-value">{c.users}</div><div className="stat-label">Users</div></div>
          </div>

          <div className="stats-row">
            <div className="stat-card"><div className="stat-value">{c.downloading}</div><div className="stat-label">Downloading</div></div>
            <div className="stat-card"><div className="stat-value">{c.queued}</div><div className="stat-label">Queued</div></div>
          </div>

          <div style={{ display: "flex", gap: "10px", marginTop: "32px", flexWrap: "wrap", alignItems: "center" }}>
            <Link href="/dashboard/add" className="btn btn-secondary">Add Series</Link>
            <Link href="/dashboard/downloads" className="btn btn-secondary">View Queue</Link>
            <Link href="/dashboard/library" className="btn btn-secondary">Manage Library</Link>
            <Link href="/dashboard/settings" className="btn btn-secondary">Settings</Link>
            <button onClick={handleScan} disabled={scanning} className="btn btn-secondary">
              {scanning ? "Scanning…" : "⟳ Scan for new chapters"}
            </button>
          </div>
          {scanMsg && (
            <p style={{ marginTop: "12px", fontSize: "13px", color: "var(--text-muted)" }}>{scanMsg}</p>
          )}
        </>
      ) : (
        <p style={{ color: "var(--text-muted)" }}>Loading…</p>
      )}
    </>
  );
}
