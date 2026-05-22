"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export interface ProgressState {
  queueId: number;
  seriesId: number;
  status: "queued" | "downloading" | "paused" | "error" | "done";
  progress_pct: number;
  current_chapter: string;
  error_message: string;
}

export interface QueueItem {
  id: number;
  series_id: number;
  status: string;
  error_message: string;
  progress_pct: number;
  current_chapter: string;
  added_at: string;
  updated_at: string;
  title: string;
  type?: string;
  slug: string;
  source: string;
}

export default function DownloadProgress() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [live, setLive] = useState<Record<number, ProgressState>>({});
  const [loading, setLoading] = useState(true);
  const [requeueMsg, setRequeueMsg] = useState("");

  async function load() {
    const r = await fetch("/api/downloads");
    if (r.ok) setItems(await r.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
    const es = new EventSource("/api/downloads/progress");
    es.onmessage = (e) => {
      try {
        const snap = JSON.parse(e.data) as ProgressState[];
        const m: Record<number, ProgressState> = {};
        for (const s of snap) m[s.queueId] = s;
        setLive(m);
      } catch { /* ignore */ }
    };
    es.onerror = () => { /* will reconnect automatically */ };
    return () => es.close();
  }, []);

  // Refresh the persistent list whenever a "done" or "error" arrives, so rows
  // get their final state and removed cancelled ones disappear.
  useEffect(() => {
    if (Object.values(live).some((s) => s.status === "done" || s.status === "error")) {
      load();
    }
  }, [live]);

  async function handleCancel(id: number) {
    if (!confirm("Cancel this download?")) return;
    await fetch(`/api/downloads/${id}`, { method: "DELETE" });
    load();
  }

  async function handleRequeueMissing() {
    setRequeueMsg("Scanning…");
    const r = await fetch("/api/downloads/requeue-missing", { method: "POST" });
    if (!r.ok) {
      setRequeueMsg("Error — check console");
      return;
    }
    const { series, chapters } = await r.json() as { series: number; chapters: number };
    if (series === 0) {
      setRequeueMsg("All files present — nothing to re-queue.");
    } else {
      setRequeueMsg(`Re-queued ${series} series (${chapters} missing chapters cleared).`);
      load();
    }
    setTimeout(() => setRequeueMsg(""), 6000);
  }

  async function handleRetry(id: number) {
    await fetch(`/api/downloads/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "retry" }),
    });
    load();
  }

  if (loading) {
    return (
      <div className="loading-state">
        <span className="loading-dot" /><span className="loading-dot" /><span className="loading-dot" />
      </div>
    );
  }

  const requeueBar = (
    <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
      <button className="btn btn-secondary btn-sm" onClick={handleRequeueMissing}>
        Re-queue missing files
      </button>
      {requeueMsg && <span style={{ fontSize: "0.85rem", opacity: 0.75 }}>{requeueMsg}</span>}
    </div>
  );

  if (items.length === 0) {
    return (
      <>
        {requeueBar}
        <div className="empty-state">
          <div className="empty-icon">↓</div>
          <p className="empty-title">Nothing downloading</p>
          <p className="empty-desc">Add a series from the search page to get started.</p>
        </div>
      </>
    );
  }

  return (
    <>
      {requeueBar}
      <div className="table-wrap">
      {items.map((q) => {
        const livestate = live[q.id];
        const status = livestate?.status || q.status;
        const pct = livestate?.progress_pct ?? q.progress_pct ?? 0;
        const chapter = livestate?.current_chapter || q.current_chapter || "";
        const err = livestate?.error_message || q.error_message || "";
        return (
          <div key={q.id} className="progress-row">
            <div>
              <div className="progress-row-title">{q.title}</div>
              <div className="progress-row-sub">
                <span className={`type-badge type-${q.type}`}>{q.type}</span>{" "}
                {q.source}{chapter ? ` • ${chapter}` : ""}
              </div>
              <div className="progress-bar" style={{ marginTop: "8px" }}>
                <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
              </div>
              {err && <p className="form-error" style={{ marginTop: "8px" }}>{err}</p>}
            </div>
            <span className={`progress-status ${status}`}>{status}</span>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {(status === "error" || status === "paused" || status === "done") && (
                <button className="btn btn-secondary btn-sm" onClick={() => handleRetry(q.id)}>Retry</button>
              )}
              {status === "error" && (
                <Link
                  className="btn btn-ghost btn-sm"
                  href={`/dashboard/users?notifyTitle=${encodeURIComponent(`Download failed: ${q.title}`)}&notifyBody=${encodeURIComponent(err || "Download failed — see dashboard for details")}`}
                  title="Pre-fill the admin notify form with this failure"
                >
                  Notify users
                </Link>
              )}
              <button className="btn btn-danger btn-sm" onClick={() => handleCancel(q.id)}>Remove</button>
            </div>
          </div>
        );
      })}
    </div>
    </>
  );
}
