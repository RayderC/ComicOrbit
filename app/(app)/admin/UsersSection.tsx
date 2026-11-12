"use client";

import { useState } from "react";
import Icon from "@/app/components/Icon";
import Modal from "@/app/components/Modal";
import { useMe } from "@/app/components/MeContext";

export type AdminUser = {
  id: number;
  username: string;
  email: string;
  is_admin: number;
  created_at: string;
  /** 1 when the account has AniList connected. */
  anilist: number;
};

async function send(url: string, method: string, body?: unknown) {
  const r = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.message || `Failed (${r.status})`);
}

const joined = (iso: string) => new Date(iso.includes("T") ? iso : `${iso.replace(" ", "T")}Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

/** Accounts as cards, with Edit, Sign out and Delete, like the admin page in the other apps. */
export default function UsersSection({ users, reload, creating, setCreating }: {
  users: AdminUser[] | null; reload: () => void; creating: boolean; setCreating: (v: boolean) => void;
}) {
  const me = useMe();
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [err, setErr] = useState("");

  async function act(fn: () => Promise<unknown>) {
    setErr("");
    try { await fn(); reload(); }
    catch (e) { setErr((e as Error).message); }
  }

  return (
    <>
      {err && <p className="form-error" style={{ marginBottom: 12 }}>{err}</p>}
      {!users ? <div className="loading">Loading…</div> : (
        <div className="row-list">
          {users.map(u => {
            const self = u.id === me.id;
            return (
              <div key={u.id} className="row-card" data-user={u.username}>
                <div className="row-top">
                  <span className="row-title">{u.username}{self && <span className="row-sub"> (you)</span>}</span>
                  <span className="flex gap-2">
                    {u.is_admin === 1 && <span className="badge badge-purple">Admin</span>}
                    {u.anilist === 1 && <span className="badge badge-cyan">AniList</span>}
                  </span>
                </div>
                <div className="row-stats">
                  {u.email && <span>{u.email}</span>}
                  <span>Joined {joined(u.created_at)}</span>
                </div>
                <div className="flex gap-2" style={{ marginTop: 10, flexWrap: "wrap" }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => setEditing(u)}><Icon name="edit" size={14} /> Edit</button>
                  {!self && <button className="btn btn-secondary btn-sm" onClick={() => {
                    if (confirm(`Sign ${u.username} out of every device?`)) act(() => send("/api/admin/sign-out", "POST", { userId: u.id }));
                  }}>Sign out</button>}
                  {!self && <button className="btn btn-danger btn-sm" onClick={() => {
                    if (confirm(`Delete ${u.username}? Their reading progress and favorites go too. This can't be undone.`)) act(() => send(`/api/users/${u.id}`, "DELETE"));
                  }}>Delete</button>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {creating && <CreateUser onClose={() => setCreating(false)} onDone={() => { setCreating(false); reload(); }} />}
      {editing && <EditUser user={editing} self={editing.id === me.id} onClose={() => setEditing(null)} onDone={() => { setEditing(null); reload(); }} />}
    </>
  );
}

function CreateUser({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [err, setErr] = useState("");
  async function save() {
    setErr("");
    try { await send("/api/register", "POST", { username: username.trim().toLowerCase(), password, isAdmin }); onDone(); }
    catch (e) { setErr((e as Error).message); }
  }
  return (
    <Modal title="New user" onClose={onClose} footer={<button className="btn btn-primary" onClick={save} disabled={!username.trim() || password.length < 8}>Create</button>}>
      <div className="form-stack">
        {err && <p className="form-error">{err}</p>}
        <div className="form-group"><label className="form-label" htmlFor="nu-name">Username</label><input data-bwignore="true" data-1p-ignore="true" data-lpignore="true" id="nu-name" className="form-input" autoCapitalize="none" autoComplete="off" value={username} onChange={e => setUsername(e.target.value)} autoFocus /></div>
        <div className="form-group"><label className="form-label" htmlFor="nu-pw">Password (8+ characters)</label><input data-bwignore="true" data-1p-ignore="true" data-lpignore="true" id="nu-pw" type="password" className="form-input" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} /></div>
        <label className="check-row"><input type="checkbox" checked={isAdmin} onChange={e => setIsAdmin(e.target.checked)} /> Admin</label>
      </div>
    </Modal>
  );
}

/** Everything about an account in one place: name, password, email, admin, and AniList. */
function EditUser({ user, self, onClose, onDone }: { user: AdminUser; self: boolean; onClose: () => void; onDone: () => void }) {
  const [username, setUsername] = useState(user.username);
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState(user.email ?? "");
  const [isAdmin, setIsAdmin] = useState(user.is_admin === 1);
  const [disconnect, setDisconnect] = useState(false);
  const [err, setErr] = useState("");
  async function save() {
    setErr("");
    const body: Record<string, unknown> = { isAdmin };
    if (username.trim() && username.trim() !== user.username) body.username = username.trim();
    if (password) body.password = password;
    if (email.trim() !== (user.email ?? "")) body.email = email.trim();
    if (disconnect) body.disconnectAnilist = true;
    try { await send(`/api/users/${user.id}`, "PATCH", body); onDone(); }
    catch (e) { setErr((e as Error).message); }
  }
  return (
    <Modal title={`Edit ${user.username}`} onClose={onClose}
      footer={<button className="btn btn-primary" onClick={save} disabled={username.trim().length < 2 || (password.length > 0 && password.length < 8)}>Save</button>}>
      <div className="form-stack">
        {err && <p className="form-error">{err}</p>}
        <div className="form-group"><label className="form-label" htmlFor="eu-name">Username</label>
          <input data-bwignore="true" data-1p-ignore="true" data-lpignore="true" id="eu-name" className="form-input" autoCapitalize="none" autoComplete="off" value={username} onChange={e => setUsername(e.target.value)} /></div>
        <div className="form-group"><label className="form-label" htmlFor="eu-pw">New password</label>
          <input data-bwignore="true" data-1p-ignore="true" data-lpignore="true" id="eu-pw" type="password" className="form-input" autoComplete="new-password" placeholder="Leave empty to keep the current one" value={password} onChange={e => setPassword(e.target.value)} />
          <span className="form-hint">8 or more characters.</span></div>
        <div className="form-group"><label className="form-label" htmlFor="eu-email">Email</label>
          <input data-bwignore="true" data-1p-ignore="true" data-lpignore="true" autoComplete="off" id="eu-email" type="email" className="form-input" placeholder="None" value={email} onChange={e => setEmail(e.target.value)} /></div>
        {!self && <label className="check-row"><input type="checkbox" checked={isAdmin} onChange={e => setIsAdmin(e.target.checked)} /> Admin</label>}
        {user.anilist === 1 && <label className="check-row"><input type="checkbox" checked={disconnect} onChange={e => setDisconnect(e.target.checked)} /> Disconnect AniList</label>}
      </div>
    </Modal>
  );
}
