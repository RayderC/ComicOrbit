"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function Login() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/setup")
      .then((r) => r.json())
      .then((data) => { if (data?.needsSetup) router.replace("/setup"); })
      .catch(() => {});
  }, [router]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const form = e.target as HTMLFormElement & {
      username: { value: string };
      password: { value: string };
    };
    const res = await fetch("/api/login", {
      method: "POST",
      body: JSON.stringify({
        username: form.username.value.trim().toLowerCase(),
        password: form.password.value,
      }),
      headers: { "Content-Type": "application/json" },
    });
    setLoading(false);
    if (res.ok) {
      router.push("/");
    } else {
      setError((await res.json()).message || "Login failed");
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <Link href="/" className="auth-logo">ComicOrbit</Link>
        <h1 className="auth-title">Welcome back</h1>
        <p className="auth-subtitle">Sign in to access your library</p>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          {error && <p className="form-error">{error}</p>}

          <div className="form-group">
            <label className="form-label" htmlFor="username">Username</label>
            <input type="text" id="username" name="username" className="form-input" placeholder="admin" autoComplete="username" required />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="password">Password</label>
            <input type="password" id="password" name="password" className="form-input" placeholder="••••••••" autoComplete="current-password" required />
          </div>

          <button type="submit" className="btn btn-primary" disabled={loading} style={{ marginTop: "4px" }}>
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
