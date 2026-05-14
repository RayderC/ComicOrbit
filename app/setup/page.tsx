"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function Setup() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/setup")
      .then((r) => r.json())
      .then((data) => {
        if (!data?.needsSetup) router.replace("/login");
        else setChecking(false);
      })
      .catch(() => setChecking(false));
  }, [router]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const form = e.target as HTMLFormElement & {
      username: { value: string };
      password: { value: string };
      confirm: { value: string };
    };
    if (form.password.value !== form.confirm.value) {
      setError("Passwords do not match");
      setLoading(false);
      return;
    }
    const res = await fetch("/api/setup", {
      method: "POST",
      body: JSON.stringify({
        username: form.username.value.trim().toLowerCase(),
        password: form.password.value,
      }),
      headers: { "Content-Type": "application/json" },
    });
    setLoading(false);
    if (res.ok) router.push("/dashboard");
    else setError((await res.json()).message || "Setup failed");
  }

  if (checking) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <p style={{ color: "var(--text-muted)", textAlign: "center" }}>Checking setup status…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <Link href="/" className="auth-logo">ComicOrbit</Link>
        <h1 className="auth-title">First-time setup</h1>
        <p className="auth-subtitle">Create the administrator account for this instance.</p>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          {error && <p className="form-error">{error}</p>}

          <div className="form-group">
            <label className="form-label" htmlFor="username">Admin username</label>
            <input type="text" id="username" name="username" className="form-input" placeholder="admin" autoComplete="username" required />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="password">Password</label>
            <input type="password" id="password" name="password" className="form-input" placeholder="At least 8 characters" minLength={8} autoComplete="new-password" required />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="confirm">Confirm password</label>
            <input type="password" id="confirm" name="confirm" className="form-input" placeholder="Repeat password" minLength={8} autoComplete="new-password" required />
          </div>

          <button type="submit" className="btn btn-primary" disabled={loading} style={{ marginTop: "4px" }}>
            {loading ? "Creating admin…" : "Create Admin Account"}
          </button>
        </form>
      </div>
    </div>
  );
}
