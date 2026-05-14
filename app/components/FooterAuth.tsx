"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function FooterAuth() {
  const router = useRouter();
  const [loggedIn, setLoggedIn] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    fetch("/api/user")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { setLoggedIn(!!data); setReady(true); })
      .catch(() => setReady(true));
  }, []);

  async function handleLogout() {
    await fetch("/api/logout", { method: "POST" });
    router.refresh();
    setLoggedIn(false);
  }

  if (!ready) return null;

  if (loggedIn) {
    return (
      <button
        onClick={handleLogout}
        className="footer-login-link"
        style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}
      >
        Logout
      </button>
    );
  }

  return <Link href="/login" className="footer-login-link">Login</Link>;
}
