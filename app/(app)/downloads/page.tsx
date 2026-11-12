"use client";

import { useState } from "react";
import DownloadProgress from "@/app/components/DownloadProgress";
import { AdminsOnly } from "@/app/components/AdminsOnly";
import Icon from "@/app/components/Icon";
import { useMe } from "@/app/components/MeContext";

export default function DownloadsPage() {
  const me = useMe();
  const [scanning, setScanning] = useState(false);
  const [msg, setMsg] = useState("");
  if (!me.isAdmin) return <AdminsOnly />;

  async function scan() {
    setScanning(true); setMsg("");
    const r = await fetch("/api/scan", { method: "POST" }).catch(() => null);
    setMsg(r?.ok ? "Checking every series. New chapters show up here as they download." : "Couldn't start the check.");
    setScanning(false);
  }

  return (
    <div className="page">
      <div className="dash-header">
        <div>
          <h1 className="dash-title">Downloads</h1>
          <p className="dash-subtitle">What&apos;s downloading now and what&apos;s waiting.</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={scan} disabled={scanning}>
          <Icon name="refresh" size={14} /> {scanning ? "Checking…" : "Check for new chapters"}
        </button>
      </div>
      {msg && <p className="settings-hint" role="status" style={{ marginBottom: 16 }}>{msg}</p>}
      <DownloadProgress />
    </div>
  );
}
