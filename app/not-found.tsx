import Link from "next/link";
import Navigation from "./components/Navigation";

export default function NotFound() {
  return (
    <div style={{ minHeight: "100vh" }}>
      <Navigation />
      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "calc(100vh - 64px)",
        padding: "40px 24px",
        textAlign: "center",
      }}>
        <p className="section-eyebrow" style={{ marginBottom: "16px" }}>404</p>
        <h1 style={{
          fontSize: "clamp(48px, 10vw, 96px)",
          fontWeight: 800,
          letterSpacing: "-0.04em",
          lineHeight: 1,
          marginBottom: "16px",
          background: "linear-gradient(135deg, #22d3ee 0%, #c084fc 50%, #f472b6 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
        }}>
          Not in orbit
        </h1>
        <p style={{ fontSize: "16px", color: "var(--text-muted)", maxWidth: "400px", lineHeight: 1.6, marginBottom: "36px" }}>
          This page doesn&apos;t exist or was moved. Head back to your library.
        </p>
        <Link href="/" className="btn btn-primary">← Back to Home</Link>
      </div>
    </div>
  );
}
