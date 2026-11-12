import { redirect } from "next/navigation";
import { getPageSession } from "@/lib/authServer";
import db from "@/lib/db";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function StatsPage() {
  const session = await getPageSession();
  if (!session.user) redirect("/login");
  const userId = session.user.id;

  const totalChapters = (db.prepare(
    "SELECT COUNT(*) as c FROM read_progress WHERE user_id = ? AND completed = 1"
  ).get(userId) as { c: number }).c;

  const totalPages = (db.prepare(`
    SELECT COALESCE(SUM(c.page_count), 0) as p
    FROM read_progress rp JOIN chapters c ON c.id = rp.chapter_id
    WHERE rp.user_id = ? AND rp.completed = 1
  `).get(userId) as { p: number }).p;

  const seriesStarted = (db.prepare(
    "SELECT COUNT(DISTINCT series_id) as c FROM read_progress WHERE user_id = ?"
  ).get(userId) as { c: number }).c;

  const thisWeek = (db.prepare(
    "SELECT COUNT(*) as c FROM read_progress WHERE user_id = ? AND completed = 1 AND updated_at > datetime('now', '-7 days')"
  ).get(userId) as { c: number }).c;

  const thisMonth = (db.prepare(
    "SELECT COUNT(*) as c FROM read_progress WHERE user_id = ? AND completed = 1 AND updated_at > datetime('now', '-30 days')"
  ).get(userId) as { c: number }).c;

  const topSeries = db.prepare(`
    SELECT s.id, s.title, s.cover_path, s.updated_at as cover_updated_at,
           COUNT(*) as chapters_read
    FROM read_progress rp
    JOIN chapters c ON c.id = rp.chapter_id
    JOIN series s ON s.id = rp.series_id
    WHERE rp.user_id = ? AND rp.completed = 1
    GROUP BY rp.series_id
    ORDER BY chapters_read DESC
    LIMIT 8
  `).all(userId) as { id: number; title: string; cover_path: string; cover_updated_at: string; chapters_read: number }[];

  const recentActivity = db.prepare(`
    SELECT s.id as series_id, s.title, c.number as chapter_number, rp.updated_at
    FROM read_progress rp
    JOIN chapters c ON c.id = rp.chapter_id
    JOIN series s ON s.id = rp.series_id
    WHERE rp.user_id = ? AND rp.completed = 1
    ORDER BY rp.updated_at DESC
    LIMIT 15
  `).all(userId) as { series_id: number; title: string; chapter_number: number; updated_at: string }[];

  function fmt(dt: string) {
    const d = new Date(dt + "Z");
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  return (
    <div>
      <div className="page">
        <div className="dash-header">
          <div>
            <h1 className="dash-title">Stats</h1>
            <p className="dash-subtitle">What you&apos;ve read.</p>
          </div>
        </div>

        {/* Overview cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "16px", marginBottom: "40px" }}>
          {[
            { label: "Chapters Read", value: totalChapters.toLocaleString(), icon: "◉" },
            { label: "Pages Read", value: totalPages.toLocaleString(), icon: "◈" },
            { label: "Series Started", value: seriesStarted.toLocaleString(), icon: "⬡" },
            { label: "This Week", value: thisWeek.toLocaleString(), icon: "↗" },
            { label: "This Month", value: thisMonth.toLocaleString(), icon: "◎" },
          ].map((s) => (
            <div key={s.label} className="card" style={{ padding: "20px 24px", textAlign: "center" }}>
              <div style={{ fontSize: "24px", color: "var(--accent-cyan)", marginBottom: "8px" }}>{s.icon}</div>
              <div style={{ fontSize: "28px", fontWeight: 800, fontFamily: "var(--font-mono)", color: "var(--text)", lineHeight: 1 }}>
                {s.value}
              </div>
              <div style={{ fontSize: "11px", color: "var(--text-subtle)", marginTop: "6px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "32px", alignItems: "start" }}>

          {/* Top series */}
          {topSeries.length > 0 && (
            <div>
              <h2 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "16px", color: "var(--text)" }}>
                Most Read
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {topSeries.map((s, i) => (
                  <Link key={s.id} href={`/library/${s.id}`} style={{ display: "flex", alignItems: "center", gap: "12px", textDecoration: "none" }}>
                    <span style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--text-subtle)", width: "20px", textAlign: "right", flexShrink: 0 }}>
                      #{i + 1}
                    </span>
                    {s.cover_path ? (
                      <img
                        src={`/api/cover/${s.id}${s.cover_updated_at ? `?v=${encodeURIComponent(s.cover_updated_at)}` : ""}`}
                        alt={s.title}
                        style={{ width: "36px", height: "52px", objectFit: "cover", borderRadius: "4px", flexShrink: 0 }}
                      />
                    ) : (
                      <div style={{ width: "36px", height: "52px", background: "var(--surface)", borderRadius: "4px", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--primary-light)", flexShrink: 0 }}>◈</div>
                    )}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</div>
                      <div style={{ fontSize: "11px", color: "var(--accent-cyan)", fontFamily: "var(--font-mono)" }}>{s.chapters_read} chapters</div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Recent activity */}
          {recentActivity.length > 0 && (
            <div>
              <h2 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "16px", color: "var(--text)" }}>
                Recent Activity
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {recentActivity.map((r, i) => (
                  <Link key={i} href={`/library/${r.series_id}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", textDecoration: "none", padding: "8px 12px", background: "var(--surface)", borderRadius: "6px", border: "1px solid var(--border)" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</div>
                      <div style={{ fontSize: "10px", color: "var(--text-subtle)", fontFamily: "var(--font-mono)" }}>Ch. {r.chapter_number}</div>
                    </div>
                    <span style={{ fontSize: "10px", color: "var(--text-subtle)", fontFamily: "var(--font-mono)", flexShrink: 0, marginLeft: "8px" }}>{fmt(r.updated_at)}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        {totalChapters === 0 && (
          <div className="empty-state" style={{ paddingTop: "60px" }}>
            <div className="empty-icon">◈</div>
            <p className="empty-title">No reading history yet</p>
            <p className="empty-desc">Start reading and your stats will appear here.</p>
            <Link href="/library" className="btn btn-primary" style={{ marginTop: "16px" }}>Browse library</Link>
          </div>
        )}
      </div>
    </div>
  );
}
