"use client";

// Backups and the update notice (dashboard), and sign-ins (profile).
import { useCallback, useEffect, useRef, useState } from "react";

type Backup = { name: string; size: number; createdAt: string };
type Update = { available: boolean; builtAt: string | null; pushedAt: string | null; checkedAt: string | null };
type SignIn = { at: string; ip: string | null; device: string; ok: boolean };

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.message || `Request failed (${r.status})`);
  return j as T;
}

const size = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "unknown");
const kindOf = (n: string) => (n.endsWith("-nightly.backup") ? "Nightly" : n.endsWith("-before-restore.backup") ? "Before a restore" : "Made by hand");

export function BackupsCard() {
  const [list, setList] = useState<Backup[]>([]);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const reload = useCallback(() => call<{ backups: Backup[] }>("/api/admin/backups").then(d => setList(d.backups)).catch(() => {}), []);
  useEffect(() => { reload(); }, [reload]);

  async function run(label: string, fn: () => Promise<string>) {
    setBusy(label); setMsg(null);
    try { setMsg({ text: await fn() }); await reload(); }
    catch (e) { setMsg({ text: (e as Error).message, error: true }); }
    finally { setBusy(""); }
  }
  const sure = () => confirm("Replace ComicOrbit's accounts, library and reading progress with this backup?\n\nA copy of what's here now is saved first, so you can undo it from this list.");
  const restoreFrom = (url: string, body?: File) => {
    if (!sure()) return;
    run("restore", async () => {
      const j = await call<{ ok: boolean }>(url, { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body });
      setTimeout(() => location.reload(), 1500);
      return j.ok ? "Restored. Reloading…" : "Done.";
    });
  };

  return (
    <div className="card ops-card" id="backups">
      <h2 className="ops-title">Backups</h2>
      <p className="ops-hint">
        ComicOrbit saves a copy of its database every night and keeps the last 7. It has every account, series, chapter list,
        reading position and favorite, but not the manga files themselves, so back up your Manga folder your own way.
        The copies sit next to your data, so also download one now and then and keep it somewhere else.
      </p>
      <div className="ops-actions">
        <a className="btn btn-primary btn-sm" href="/api/admin/backups/download">Download backup</a>
        <button type="button" className="btn btn-secondary btn-sm" disabled={!!busy}
          onClick={() => run("make", async () => { await call("/api/admin/backups", { method: "POST" }); return "Saved a copy."; })}>
          {busy === "make" ? "Saving…" : "Save a copy now"}
        </button>
        <button type="button" className="btn btn-secondary btn-sm" disabled={!!busy} onClick={() => fileRef.current?.click()}>
          {busy === "restore" ? "Restoring…" : "Restore from a file"}
        </button>
        <input ref={fileRef} type="file" hidden aria-label="Backup file" accept=".tar,.db,.backup"
          onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) restoreFrom("/api/admin/backups/restore", f); }} />
      </div>
      {msg && <p className={msg.error ? "form-error" : "ops-hint"} role="status">{msg.text}</p>}
      {list.length > 0 && (
        <details className="ops-list">
          <summary>{list.length} saved {list.length === 1 ? "copy" : "copies"} · newest {when(list[0].createdAt)}</summary>
          {list.map(b => (
            <div key={b.name} className="ops-row backup-row" data-backup={b.name}>
              <div><b>{when(b.createdAt)}</b> <span className="ops-muted">{kindOf(b.name)} · {size(b.size)}</span></div>
              <div className="ops-actions">
                <a className="btn btn-ghost btn-sm" href={`/api/admin/backups/download?name=${encodeURIComponent(b.name)}`}>Download</a>
                <button type="button" className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => restoreFrom(`/api/admin/backups/restore?name=${encodeURIComponent(b.name)}`)}>Restore this</button>
              </div>
            </div>
          ))}
        </details>
      )}
    </div>
  );
}

export function UpdateNotice() {
  const [u, setU] = useState<Update | null>(null);
  const [checking, setChecking] = useState(false);
  useEffect(() => { call<Update>("/api/admin/update").then(setU).catch(() => {}); }, []);
  if (!u) return null;
  if (!u.available) {
    return (
      <p className="update-quiet">
        {u.builtAt ? <>This version was built {day(u.builtAt)}. </> : <>Running from source, so update checks are off. </>}
        {u.builtAt && (
          <button type="button" className="btn btn-ghost btn-sm" disabled={checking}
            onClick={async () => { setChecking(true); try { setU(await call<Update>("/api/admin/update?force=1")); } finally { setChecking(false); } }}>
            {checking ? "Checking…" : "Check for updates"}
          </button>
        )}
        {u.builtAt && u.checkedAt && !checking && <span> Up to date as of {day(u.checkedAt)}.</span>}
      </p>
    );
  }
  return (
    <div className="card ops-card update-card" role="status">
      <h2 className="ops-title">Update available</h2>
      <p className="ops-hint">A newer version was published {day(u.pushedAt)}. This one is from {day(u.builtAt)}. To update, run this where your compose file is:</p>
      <pre className="update-cmd">docker compose pull &amp;&amp; docker compose up -d</pre>
    </div>
  );
}

export function SignInsCard() {
  const [list, setList] = useState<SignIn[] | null>(null);
  const [msg, setMsg] = useState("");
  const reload = useCallback(() => call<SignIn[]>("/api/sign-ins").then(setList).catch(() => {}), []);
  useEffect(() => { reload(); }, [reload]);
  const failed = (list ?? []).filter(s => !s.ok).length;
  return (
    <div className="card ops-card" id="sign-ins" style={{ padding: "28px", marginBottom: "24px" }}>
      <h2 style={{ fontSize: "15px", fontWeight: 700, marginBottom: "6px" }}>Sign-ins</h2>
      <p className="ops-hint">
        Recent sign-ins to your account{failed > 0 ? <>, including <b>{failed} wrong {failed === 1 ? "password" : "passwords"}</b></> : null}.
        If one wasn&apos;t you, sign out everywhere and change your password.
      </p>
      {list && list.length > 0 && (
        <details className="ops-list">
          <summary>Last {list.length} · {when(list[0].at)}, {list[0].device}</summary>
          {list.map((s, i) => (
            <div key={i} className={`ops-row signin-row ${s.ok ? "" : "signin-failed"}`}>
              <span><b>{when(s.at)}</b></span><span className="ops-muted">{s.device} · {s.ip ?? "this network"}</span>
              {!s.ok && <span className="ops-bad">Wrong password</span>}
            </div>
          ))}
        </details>
      )}
      <div className="ops-actions">
        <button type="button" className="btn btn-secondary btn-sm" onClick={async () => {
          setMsg("");
          try { await call("/api/sign-ins", { method: "POST" }); setMsg("Signed out everywhere else. This device stays signed in."); reload(); }
          catch (e) { setMsg((e as Error).message); }
        }}>Sign out everywhere else</button>
        {msg && <span className="ops-hint" role="status">{msg}</span>}
      </div>
    </div>
  );
}
