"use client";

import { useEffect, useState } from "react";

type NotifyUser = { id: number; username: string; has_push: number };
type LogRow = { id: number; user_id: number | null; username: string | null; endpoint_host: string; status_code: number | null; error: string; title: string; created_at: string };

const statusClass = (code: number | null, error: string) =>
  code != null && code >= 200 && code < 300 ? "push-ok" : code === 410 || code === 404 ? "push-gone" : error ? "push-bad" : "";

/**
 * Push notifications in one card: send one to people, the identity Apple needs, and the last 50 tries.
 * A failed download's "Notify users" fills in the message from the address.
 */
export default function PushSection({ prefill }: { prefill: { title: string; body: string } | null }) {
  const [users, setUsers] = useState<NotifyUser[]>([]);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [title, setTitle] = useState(prefill?.title ?? "");
  const [body, setBody] = useState(prefill?.body ?? "");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ text: string; ok: boolean } | null>(null);
  const [subject, setSubject] = useState("");
  const [subjectMsg, setSubjectMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [log, setLog] = useState<LogRow[] | null>(null);

  const loadLog = () => fetch("/api/admin/notifications").then(r => (r.ok ? r.json() : [])).then(setLog).catch(() => setLog([]));
  useEffect(() => {
    fetch("/api/admin/notify").then(r => (r.ok ? r.json() : [])).then(d => setUsers(Array.isArray(d) ? d : [])).catch(() => {});
    fetch("/api/site-config").then(r => r.json()).then((c: Record<string, string>) => setSubject(c.VAPID_SUBJECT || "")).catch(() => {});
    loadLog();
  }, []);
  useEffect(() => {
    if (prefill) setTimeout(() => document.getElementById("push")?.scrollIntoView({ behavior: "smooth", block: "start" }), 300);
  }, [prefill]);

  const toggle = (id: number) => setPicked(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  async function sendIt(e: React.FormEvent) {
    e.preventDefault();
    setSending(true); setResult(null);
    try {
      const r = await fetch("/api/admin/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userIds: [...picked], title, body }) });
      const d = await r.json();
      setResult(r.ok
        ? { text: `Sent to ${d.sent} device${d.sent === 1 ? "" : "s"}.${d.noSub > 0 ? ` ${d.noSub} ${d.noSub === 1 ? "person hasn't" : "people haven't"} turned notifications on.` : ""}`, ok: true }
        : { text: d.message || "Couldn't send it.", ok: false });
      loadLog();
    } catch { setResult({ text: "Couldn't reach the server.", ok: false }); }
    setSending(false);
  }

  async function saveSubject(e: React.FormEvent) {
    e.preventDefault();
    setSubjectMsg(null);
    const r = await fetch("/api/site-config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ VAPID_SUBJECT: subject }) });
    setSubjectMsg(r.ok ? { text: "Saved.", ok: true } : { text: (await r.json().catch(() => ({}))).message || "Couldn't save it.", ok: false });
  }

  return (
    <div className="card admin-card" id="push">
      <h2 className="section-title">Push notifications</h2>
      <p className="settings-hint">People turn these on in their own Settings. New chapters notify them on their own; this sends a message now.</p>

      <form onSubmit={sendIt} className="form-stack" style={{ marginTop: 12 }}>
        <div>
          <div className="flex gap-2 items-center" style={{ marginBottom: 8, flexWrap: "wrap" }}>
            <span className="form-label" style={{ margin: 0 }}>Send to</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPicked(new Set(users.filter(u => u.has_push).map(u => u.id)))}>Everyone with it on</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPicked(new Set())}>Clear</button>
          </div>
          <div className="chip-wrap">
            {users.map(u => (
              <button key={u.id} type="button" className={`filter-chip${picked.has(u.id) ? " filter-chip--active" : ""}${u.has_push ? "" : " chip-off"}`} aria-pressed={picked.has(u.id)} onClick={() => toggle(u.id)}
                title={u.has_push ? undefined : "Hasn't turned notifications on, so this won't reach them"}>
                {u.username}
              </button>
            ))}
          </div>
        </div>
        <div className="form-group"><label className="form-label" htmlFor="push-title">Title</label>
          <input data-bwignore="true" data-1p-ignore="true" data-lpignore="true" autoComplete="off" id="push-title" className="form-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="ComicOrbit" maxLength={100} /></div>
        <div className="form-group"><label className="form-label" htmlFor="push-body">Message</label>
          <input data-bwignore="true" data-1p-ignore="true" data-lpignore="true" autoComplete="off" id="push-body" className="form-input" value={body} onChange={e => setBody(e.target.value)} placeholder="A test from the admin page" maxLength={200} /></div>
        {result && <p className={result.ok ? "settings-hint" : "form-error"} role="status">{result.text}</p>}
        <div><button className="btn btn-primary btn-sm" disabled={sending || picked.size === 0}>{sending ? "Sending…" : `Send to ${picked.size} ${picked.size === 1 ? "person" : "people"}`}</button></div>
      </form>

      <form onSubmit={saveSubject} className="form-stack" style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
        <div className="form-group">
          <label className="form-label" htmlFor="vapid-subject">Contact for the push services</label>
          <input data-bwignore="true" data-1p-ignore="true" data-lpignore="true" autoComplete="off" id="vapid-subject" className="form-input" value={subject} onChange={e => setSubject(e.target.value)} placeholder="mailto:you@example.com" />
          <span className="form-hint">Apple turns down made-up addresses, so use a real <code>mailto:</code> or an <code>https://</code> address. Leave it empty for the built-in one.</span>
        </div>
        {subjectMsg && <p className={subjectMsg.ok ? "settings-hint" : "form-error"} role="status">{subjectMsg.text}</p>}
        <div><button className="btn btn-secondary btn-sm">Save</button></div>
      </form>

      <details className="push-log" style={{ marginTop: 16 }}>
        <summary>Recent sends{log ? ` (${log.length})` : ""}</summary>
        <p className="settings-hint" style={{ margin: "6px 0 10px" }}>
          201 or 202 means it was delivered. 404 or 410 means that device turned notifications off. Anything else, or an error, usually means the contact above is wrong.
        </p>
        {!log ? <div className="loading">Loading…</div> : log.length === 0 ? <p className="settings-hint">Nothing sent yet.</p> : (
          <div className="row-list">
            {log.map(r => (
              <div key={r.id} className="row-card push-row">
                <div className="row-top">
                  <span className="row-title">{r.username || `#${r.user_id ?? "?"}`}</span>
                  <span className={`push-code ${statusClass(r.status_code, r.error)}`}>{r.status_code ?? "—"}</span>
                </div>
                <div className="row-stats"><span>{r.created_at}</span><span>{r.endpoint_host}</span></div>
                {r.title && <div className="row-body">{r.title}</div>}
                {r.error && <div className="row-body push-bad">{r.error}</div>}
              </div>
            ))}
          </div>
        )}
      </details>
    </div>
  );
}
