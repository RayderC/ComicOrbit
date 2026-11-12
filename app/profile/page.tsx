"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Navigation from "../components/Navigation";
import { SignInsCard } from "../components/OpsCards";

export default function ProfilePage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // AniList
  const [anilistToken, setAnilistToken] = useState("");
  const [newAnilistToken, setNewAnilistToken] = useState("");
  const [anilistSaving, setAnilistSaving] = useState(false);
  const [anilistMsg, setAnilistMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [anilistHelpOpen, setAnilistHelpOpen] = useState(false);
  const [anilistClientId, setAnilistClientId] = useState("");

  // Push notifications
  const [vapidKey, setVapidKey] = useState("");
  const [notifSubscribed, setNotifSubscribed] = useState(false);
  const [notifSupported, setNotifSupported] = useState(false);
  const [notifBusy, setNotifBusy] = useState(false);
  const [notifError, setNotifError] = useState("");
  const [notifTestResult, setNotifTestResult] = useState<{ text: string; ok: boolean } | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

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
          setAnilistToken(data.anilist_token || "");
          setNewAnilistToken(data.anilist_token || "");
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));

    setNotifSupported("serviceWorker" in navigator && "PushManager" in window);
    const ua = navigator.userAgent;
    const iosDevice = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    setIsIOS(iosDevice);
    setIsStandalone(
      window.matchMedia("(display-mode: standalone)").matches ||
      !!(navigator as { standalone?: boolean }).standalone
    );
    fetch("/api/push/subscribe")
      .then((r) => r.ok ? r.json() : null)
      .then(async (d) => {
        if (!d) return;
        setVapidKey(d.publicKey);
        setNotifSubscribed(d.subscribed);
        // Cache the VAPID key so the service worker can resubscribe on
        // pushsubscriptionchange without a roundtrip to the server.
        if ("serviceWorker" in navigator && "caches" in window) {
          try {
            const cache = await caches.open("comicorbit-v2");
            await cache.put("/__vapid_key", new Response(d.publicKey, { headers: { "Content-Type": "text/plain" } }));
          } catch { /* non-fatal */ }
        }
        // If the local browser subscription's endpoint drifted from what the
        // server has, re-bind it. iOS silently rotates endpoints.
        if (d.subscribed && "serviceWorker" in navigator) {
          try {
            const reg = await navigator.serviceWorker.ready;
            const sub = await reg.pushManager.getSubscription();
            if (sub) {
              const json = sub.toJSON();
              await fetch("/api/push/subscribe", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
              });
            } else {
              setNotifSubscribed(false);
            }
          } catch { /* non-fatal */ }
        }
      })
      .catch(() => {});
  }, [router]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword && newPassword !== confirmPassword) { setMsg({ text: "Passwords do not match", ok: false }); return; }
    if (newPassword && newPassword.length < 8) { setMsg({ text: "Password must be at least 8 characters", ok: false }); return; }
    if (newPassword && !currentPassword) { setMsg({ text: "Enter your current password to set a new one", ok: false }); return; }
    setSaving(true); setMsg(null);
    try {
      const body: Record<string, string> = {};
      if (newEmail !== email) body.email = newEmail;
      if (newPassword) { body.password = newPassword; body.currentPassword = currentPassword; }
      if (Object.keys(body).length === 0) { setMsg({ text: "No changes to save", ok: false }); setSaving(false); return; }
      const r = await fetch("/api/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await r.json();
      if (r.ok) { setMsg({ text: "Profile updated", ok: true }); setEmail(newEmail); setCurrentPassword(""); setNewPassword(""); setConfirmPassword(""); }
      else { setMsg({ text: data.message || "Update failed", ok: false }); }
    } catch { setMsg({ text: "Network error", ok: false }); }
    setSaving(false);
  }

  async function handleAnilistSave(e: React.FormEvent) {
    e.preventDefault();
    setAnilistSaving(true); setAnilistMsg(null);
    try {
      const r = await fetch("/api/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ anilistToken: newAnilistToken }) });
      const data = await r.json();
      if (r.ok) { setAnilistToken(newAnilistToken); setAnilistMsg({ text: newAnilistToken ? "Token saved — progress will sync to AniList" : "Token removed", ok: true }); }
      else { setAnilistMsg({ text: data.message || "Failed", ok: false }); }
    } catch { setAnilistMsg({ text: "Network error", ok: false }); }
    setAnilistSaving(false);
  }

  async function toggleNotifications() {
    if (!notifSupported || !vapidKey || notifBusy) return;
    setNotifBusy(true);
    setNotifError("");
    setNotifTestResult(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      if (notifSubscribed) {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await sub.unsubscribe();
          await fetch("/api/push/subscribe", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        }
        setNotifSubscribed(false);
      } else {
        const perm = await Notification.requestPermission();
        if (perm === "denied") { setNotifError("Notifications are blocked in your browser. Allow them in browser settings and try again."); setNotifBusy(false); return; }
        if (perm !== "granted") { setNotifBusy(false); return; }
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidKey) });
        const json = sub.toJSON();
        const r = await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }) });
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          setNotifError(d.message || "Failed to save subscription — try again.");
          setNotifBusy(false);
          return;
        }
        setNotifSubscribed(true);
      }
    } catch (e) {
      const msg = (e as Error).message || "Unknown error";
      if (msg.includes("pushManager") || msg.includes("secure") || msg.includes("https")) {
        setNotifError("Push notifications require HTTPS. Access this site over https:// to use notifications.");
      } else {
        setNotifError(`Failed: ${msg}`);
      }
    }
    setNotifBusy(false);
  }

  async function sendTestNotification() {
    setNotifTestResult(null);
    try {
      const r = await fetch("/api/push/test", { method: "POST" });
      const d = await r.json().catch(() => ({}));
      setNotifTestResult({ text: r.ok ? "Test notification sent — check your device." : (d.message || "Failed"), ok: r.ok });
    } catch {
      setNotifTestResult({ text: "Network error", ok: false });
    }
  }

  if (loading) return (
    <div style={{ minHeight: "100vh" }}><Navigation /><div className="projects-page-inner"><p style={{ color: "var(--text-muted)" }}>Loading…</p></div></div>
  );

  return (
    <div style={{ minHeight: "100vh" }}>
      <Navigation />
      <div className="projects-page-inner" style={{ maxWidth: "520px" }}>
        <div className="projects-page-header">
          <p className="section-eyebrow">Account</p>
          <h1 className="projects-page-title">Profile</h1>
        </div>

        {/* Account details */}
        <div className="card" style={{ padding: "28px", marginBottom: "24px" }}>
          <div style={{ marginBottom: "24px" }}>
            <div style={{ fontSize: "11px", color: "var(--text-subtle)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "4px" }}>Username</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "15px", color: "var(--text)" }}>{username}</div>
          </div>
          <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            <div>
              <label className="form-label" htmlFor="email">Email address</label>
              <input id="email" type="email" className="form-input" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="your@email.com" style={{ marginTop: "6px" }} />
            </div>
            <div style={{ borderTop: "1px solid var(--border)", paddingTop: "18px" }}>
              <p style={{ fontSize: "12px", color: "var(--text-subtle)", marginBottom: "14px" }}>Leave password fields blank to keep your current password.</p>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div><label className="form-label" htmlFor="cpw">Current password</label><input id="cpw" type="password" className="form-input" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Required to change password" style={{ marginTop: "6px" }} /></div>
                <div><label className="form-label" htmlFor="npw">New password</label><input id="npw" type="password" className="form-input" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Min 8 characters" style={{ marginTop: "6px" }} /></div>
                <div><label className="form-label" htmlFor="cpw2">Confirm password</label><input id="cpw2" type="password" className="form-input" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm new password" style={{ marginTop: "6px" }} /></div>
              </div>
            </div>
            {msg && <p style={{ fontSize: "13px", color: msg.ok ? "var(--success)" : "var(--danger)" }}>{msg.text}</p>}
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Saving…" : "Save changes"}</button>
          </form>
        </div>

        {/* AniList sync */}
        <SignInsCard />

        <div className="card" style={{ padding: "28px", marginBottom: "24px" }}>
          <h2 style={{ fontSize: "15px", fontWeight: 700, marginBottom: "6px" }}>AniList Sync</h2>
          <p style={{ fontSize: "12px", color: "var(--text-subtle)", marginBottom: "12px", lineHeight: 1.5 }}>
            Auto-sync chapter completions to your AniList account.
          </p>

          {/* How-to guide */}
          <button
            type="button"
            onClick={() => setAnilistHelpOpen((v) => !v)}
            style={{
              display: "flex", alignItems: "center", gap: "6px",
              fontSize: "12px", fontWeight: 600,
              color: anilistHelpOpen ? "var(--accent-cyan)" : "var(--primary-light)",
              background: "none", border: "none", cursor: "pointer", padding: "0",
              marginBottom: anilistHelpOpen ? "0" : "16px",
              transition: "color 0.15s",
            }}
          >
            <span style={{ fontSize: "10px", transition: "transform 0.2s", display: "inline-block", transform: anilistHelpOpen ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
            How do I get a token?
          </button>

          {anilistHelpOpen && (
            <div style={{
              margin: "12px 0 16px",
              padding: "16px",
              background: "rgba(168,85,247,0.06)",
              border: "1px solid rgba(168,85,247,0.2)",
              borderRadius: "8px",
              fontSize: "12px",
              lineHeight: 1.7,
              color: "var(--text-subtle)",
            }}>
              <ol style={{ margin: 0, paddingLeft: "18px", display: "flex", flexDirection: "column", gap: "10px" }}>
                <li>
                  Go to{" "}
                  <a href="https://anilist.co/settings/developer" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent-cyan)" }}>
                    anilist.co/settings/developer
                  </a>{" "}
                  and click <strong style={{ color: "var(--text)" }}>Create new client</strong>.
                </li>
                <li>
                  Set the <strong style={{ color: "var(--text)" }}>Redirect URL</strong> to exactly:
                  <code style={{
                    display: "block", marginTop: "6px",
                    padding: "6px 10px",
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid var(--border)",
                    borderRadius: "5px",
                    fontFamily: "var(--font-mono)",
                    fontSize: "11px",
                    wordBreak: "break-all",
                    color: "var(--text)",
                    userSelect: "all",
                  }}>
                    https://anilist.co/api/v2/oauth/pin
                  </code>
                </li>
                <li>
                  Save the client. Copy the <strong style={{ color: "var(--text)" }}>Client ID</strong>{" "}
                  (the number shown under the app name — <em>not</em> the secret).
                </li>
                <li>
                  Paste your Client ID below to generate your personal auth link:
                  <div style={{ display: "flex", gap: "8px", marginTop: "8px", alignItems: "center" }}>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Client ID (e.g. 12345)"
                      value={anilistClientId}
                      onChange={(e) => setAnilistClientId(e.target.value.replace(/\D/g, ""))}
                      style={{ fontFamily: "var(--font-mono)", fontSize: "12px", flex: 1 }}
                    />
                    {anilistClientId && (
                      <a
                        href={`https://anilist.co/api/v2/oauth/authorize?client_id=${anilistClientId}&response_type=token`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-primary"
                        style={{ whiteSpace: "nowrap", fontSize: "12px", textDecoration: "none" }}
                      >
                        Open auth link ↗
                      </a>
                    )}
                  </div>
                </li>
                <li>
                  AniList will show you a long token — copy the whole thing and paste it into the field below.
                </li>
              </ol>
            </div>
          )}

          <form onSubmit={handleAnilistSave} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div>
              <label className="form-label" htmlFor="anilist-token">Personal access token</label>
              <input id="anilist-token" type="password" className="form-input" value={newAnilistToken} onChange={(e) => setNewAnilistToken(e.target.value)} placeholder="Paste your AniList token…" style={{ marginTop: "6px", fontFamily: "var(--font-mono)", fontSize: "12px" }} />
            </div>
            {anilistToken && <p style={{ fontSize: "11px", color: "var(--accent-cyan)" }}>✓ Syncing to AniList</p>}
            {anilistMsg && <p style={{ fontSize: "13px", color: anilistMsg.ok ? "var(--success)" : "var(--danger)" }}>{anilistMsg.text}</p>}
            <div style={{ display: "flex", gap: "8px" }}>
              <button type="submit" className="btn btn-primary" disabled={anilistSaving}>{anilistSaving ? "Saving…" : "Save token"}</button>
              {anilistToken && <button type="button" className="btn btn-ghost" onClick={() => { setNewAnilistToken(""); handleAnilistSave({ preventDefault: () => {} } as React.FormEvent); }}>Disconnect</button>}
            </div>
          </form>
        </div>

        {/* OPDS — read your library from external clients */}
        <div className="card" style={{ padding: "28px", marginBottom: "24px" }}>
          <h2 style={{ fontSize: "15px", fontWeight: 700, marginBottom: "6px" }}>OPDS feed</h2>
          <p style={{ fontSize: "12px", color: "var(--text-subtle)", marginBottom: "12px", lineHeight: 1.5 }}>
            Browse and download your library from native comic readers (Panels, Chunky,
            Paperback on iOS; Moon+ Reader, KyBook on Android). Add a new OPDS catalog
            in the client and use your ComicOrbit username and password.
          </p>
          <code style={{ display: "block", fontSize: "12px", padding: "10px 12px", background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)", borderRadius: "6px", fontFamily: "var(--font-mono)", wordBreak: "break-all" }}>
            {typeof window !== "undefined" ? `${window.location.origin}/opds` : "/opds"}
          </code>
        </div>

        {/* Push notifications */}
        <div className="card" style={{ padding: "28px" }}>
          <h2 style={{ fontSize: "15px", fontWeight: 700, marginBottom: "6px" }}>Chapter Notifications</h2>
          <p style={{ fontSize: "12px", color: "var(--text-subtle)", marginBottom: "16px", lineHeight: 1.5 }}>
            Get a push notification on this device whenever a new chapter finishes downloading.
          </p>

          {/* iOS not installed as PWA */}
          {isIOS && !isStandalone && (
            <div style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.3)", borderRadius: "8px", padding: "12px 14px" }}>
              <p style={{ fontSize: "13px", color: "#fbbf24", fontWeight: 600, marginBottom: "4px" }}>Add to Home Screen required</p>
              <p style={{ fontSize: "12px", color: "var(--text-subtle)", lineHeight: 1.6 }}>
                iOS only supports push notifications for installed apps. Tap the <strong style={{ color: "var(--text)" }}>Share</strong> button in Safari, then choose <strong style={{ color: "var(--text)" }}>Add to Home Screen</strong>. Open the app from your Home Screen and come back here to enable notifications.
              </p>
            </div>
          )}

          {/* Supported and keys available */}
          {notifSupported && vapidKey && (
            <>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                <button className={`btn ${notifSubscribed ? "btn-ghost" : "btn-primary"}`} onClick={toggleNotifications} disabled={notifBusy}>
                  {notifBusy ? "Working…" : notifSubscribed ? "Disable notifications" : "Enable notifications"}
                </button>
                {notifSubscribed && (
                  <button className="btn btn-ghost btn-sm" onClick={sendTestNotification}>
                    Send test
                  </button>
                )}
              </div>
              {notifSubscribed && <p style={{ fontSize: "11px", color: "var(--accent-cyan)", marginTop: "10px" }}>✓ Notifications enabled on this device</p>}
              {notifError && <p style={{ fontSize: "12px", color: "var(--danger)", marginTop: "10px" }}>{notifError}</p>}
              {notifTestResult && <p style={{ fontSize: "12px", color: notifTestResult.ok ? "var(--success)" : "var(--danger)", marginTop: "10px" }}>{notifTestResult.text}</p>}
            </>
          )}

          {/* Not supported (non-iOS) */}
          {!notifSupported && !isIOS && (
            <p style={{ fontSize: "12px", color: "var(--text-subtle)" }}>
              Your browser does not support push notifications. Try Chrome or Edge.
            </p>
          )}

          {/* Keys missing */}
          {notifSupported && !vapidKey && (
            <p style={{ fontSize: "12px", color: "var(--danger)" }}>Push keys not available — check server logs.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const buf = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
  return buf.buffer;
}
