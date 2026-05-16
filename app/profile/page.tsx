"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Navigation from "../components/Navigation";

export default function ProfilePage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => {
        if (r.status === 401) { router.push("/login"); return null; }
        return r.ok ? r.json() : null;
      })
      .then((data) => {
        if (data) {
          setUsername(data.username || "");
          setEmail(data.email || "");
          setNewEmail(data.email || "");
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [router]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword && newPassword !== confirmPassword) {
      setMsg({ text: "Passwords do not match", ok: false });
      return;
    }
    if (newPassword && newPassword.length < 5) {
      setMsg({ text: "Password must be at least 5 characters", ok: false });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      const body: Record<string, string> = {};
      if (newEmail !== email) body.email = newEmail;
      if (newPassword) body.password = newPassword;
      if (Object.keys(body).length === 0) {
        setMsg({ text: "No changes to save", ok: false });
        setSaving(false);
        return;
      }
      const r = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (r.ok) {
        setMsg({ text: "Profile updated successfully", ok: true });
        setEmail(newEmail);
        setNewPassword("");
        setConfirmPassword("");
      } else {
        setMsg({ text: data.message || "Update failed", ok: false });
      }
    } catch {
      setMsg({ text: "Network error", ok: false });
    }
    setSaving(false);
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100vh" }}>
        <Navigation />
        <div className="projects-page-inner">
          <p style={{ color: "var(--text-muted)" }}>Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh" }}>
      <Navigation />
      <div className="projects-page-inner" style={{ maxWidth: "520px" }}>
        <div className="projects-page-header">
          <p className="section-eyebrow">Account</p>
          <h1 className="projects-page-title">Profile</h1>
        </div>

        <div className="card" style={{ padding: "28px" }}>
          <div style={{ marginBottom: "24px" }}>
            <div className="form-label" style={{ marginBottom: "4px", color: "var(--text-subtle)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Username
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "15px", color: "var(--text)" }}>
              {username}
            </div>
          </div>

          <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            <div>
              <label className="form-label" htmlFor="email">Email address</label>
              <input
                id="email"
                type="email"
                className="form-input"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="your@email.com"
                style={{ marginTop: "6px" }}
              />
            </div>

            <div style={{ borderTop: "1px solid var(--border)", paddingTop: "18px" }}>
              <p style={{ fontSize: "12px", color: "var(--text-subtle)", marginBottom: "14px" }}>
                Leave password fields blank to keep your current password.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div>
                  <label className="form-label" htmlFor="newpw">New password</label>
                  <input
                    id="newpw"
                    type="password"
                    className="form-input"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="New password (min 5 chars)"
                    style={{ marginTop: "6px" }}
                  />
                </div>
                <div>
                  <label className="form-label" htmlFor="confirmpw">Confirm password</label>
                  <input
                    id="confirmpw"
                    type="password"
                    className="form-input"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    style={{ marginTop: "6px" }}
                  />
                </div>
              </div>
            </div>

            {msg && (
              <p style={{ fontSize: "13px", color: msg.ok ? "var(--success)" : "var(--danger)" }}>
                {msg.text}
              </p>
            )}

            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
