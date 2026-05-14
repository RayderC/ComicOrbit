"use client";

import { useEffect, useState } from "react";

type AdminUser = {
  id: number;
  username: string;
  is_admin: number;
  created_at: string;
};

export default function UsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [creating, setCreating] = useState(false);

  function load() {
    setLoading(true);
    fetch("/api/users")
      .then((r) => r.json())
      .then((data) => { setUsers(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setCreating(true);
    const form = e.currentTarget as HTMLFormElement & {
      username: { value: string };
      password: { value: string };
      isAdmin: { checked: boolean };
    };
    const res = await fetch("/api/register", {
      method: "POST",
      body: JSON.stringify({
        username: form.username.value.trim().toLowerCase(),
        password: form.password.value,
        isAdmin: form.isAdmin.checked,
      }),
      headers: { "Content-Type": "application/json" },
    });
    setCreating(false);
    if (res.ok) {
      setSuccess(`Created account for ${form.username.value.trim().toLowerCase()}`);
      form.reset();
      load();
    } else {
      setError((await res.json()).message || "Failed to create user");
    }
  }

  async function handleDelete(id: number, username: string) {
    if (!confirm(`Delete account "${username}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
    if (res.ok) load();
    else setError((await res.json()).message || "Failed to delete user");
  }

  return (
    <>
      <div className="dash-header">
        <div>
          <h1 className="dash-title">Users</h1>
          <p className="dash-subtitle">Only administrators can create new accounts.</p>
        </div>
      </div>

      <div className="stat-card" style={{ padding: "24px", marginBottom: "24px" }}>
        <h2 style={{ fontSize: "18px", marginBottom: "16px" }}>Create new account</h2>
        <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: "14px", maxWidth: "480px" }}>
          {error && <p className="form-error">{error}</p>}
          {success && <p style={{ color: "var(--success)", fontSize: "13px" }}>{success}</p>}

          <div className="form-group">
            <label className="form-label" htmlFor="username">Username</label>
            <input type="text" id="username" name="username" className="form-input" placeholder="username" required />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="password">Password</label>
            <input type="password" id="password" name="password" className="form-input" placeholder="At least 8 characters" minLength={8} required />
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "var(--text-muted)" }}>
            <input type="checkbox" id="isAdmin" name="isAdmin" />
            Grant administrator privileges
          </label>

          <button type="submit" className="btn btn-primary btn-sm" disabled={creating} style={{ alignSelf: "flex-start" }}>
            {creating ? "Creating…" : "Create Account"}
          </button>
        </form>
      </div>

      {loading ? (
        <p style={{ color: "var(--text-muted)", padding: "40px 0" }}>Loading…</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Role</th>
                <th>Created</th>
                <th style={{ width: "120px" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td style={{ color: "var(--text)", fontWeight: 600 }}>{u.username}</td>
                  <td>
                    {u.is_admin === 1
                      ? <span className="badge badge-green">Admin</span>
                      : <span style={{ color: "var(--text-subtle)", fontSize: "13px" }}>User</span>}
                  </td>
                  <td style={{ color: "var(--text-muted)", fontSize: "13px" }}>
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                  <td>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(u.id, u.username)}>
                      Delete
                    </button>
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
