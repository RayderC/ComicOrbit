"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type SpreadPref = "auto" | "on" | "off";

/** The first page of the pair a page belongs to: the cover alone, then 1–2, 3–4 and so on (zero-based). */
const spreadStart = (p: number) => (p <= 0 ? 0 : p % 2 === 1 ? p : p - 1);

interface Props {
  seriesId: number;
  seriesTitle: string;
  chapter: { id: number; number: number; title: string; page_count: number };
  initialPage: number;
  nextChapterId: number | null;
  prevChapterId: number | null;
  prevChapterPageCount: number | null;
  readingMode: "ltr" | "rtl" | "webtoon";
}

export default function ReaderViewer({
  seriesId, seriesTitle, chapter, initialPage, nextChapterId, prevChapterId, prevChapterPageCount, readingMode,
}: Props) {
  const router = useRouter();
  const [page, setPage] = useState(Math.max(0, Math.min(initialPage, chapter.page_count - 1)));
  const [topbarVisible, setTopbarVisible] = useState(true);
  const [pendingNav, setPendingNav] = useState<"next" | "prev" | null>(null);
  const pendingNavRef = useRef<"next" | "prev" | null>(null);
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const total = Math.max(1, chapter.page_count);
  const lastSaved = useRef(-1);
  const preloadRef = useRef<HTMLImageElement | null>(null);
  const pageEls = useRef<(HTMLImageElement | null)[]>([]);
  const webtoonViewportRef = useRef<HTMLDivElement>(null);

  // Two pages side by side, like a printed book. Auto turns it on when the screen is wider than tall
  // (a tablet or phone sideways). The cover stays on its own, then pages pair up as 2–3, 4–5 and so on.
  const [spreadPref, setSpreadPref] = useState<SpreadPref>("auto");
  const [wide, setWide] = useState(false);
  useEffect(() => {
    try { const v = localStorage.getItem("comicorbit.spread"); if (v === "on" || v === "off") setSpreadPref(v); } catch { /* private mode */ }
    const check = () => setWide(window.innerWidth > window.innerHeight && window.innerWidth >= 700);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  const cycleSpread = () => {
    const next: SpreadPref = spreadPref === "auto" ? "on" : spreadPref === "on" ? "off" : "auto";
    setSpreadPref(next);
    try { localStorage.setItem("comicorbit.spread", next); } catch { /* private mode */ }
  };
  const spreadOn = readingMode !== "webtoon" && total > 2 && (spreadPref === "on" || (spreadPref === "auto" && wide));
  const first = spreadOn ? spreadStart(page) : page;
  const shown = spreadOn && first > 0 && first + 1 < total ? [first, first + 1] : [first];
  const lastShown = shown[shown.length - 1];

  const setPending = useCallback((nav: "next" | "prev" | null) => {
    pendingNavRef.current = nav;
    setPendingNav(nav);
    if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
    pendingTimerRef.current = null;
    if (nav !== null) {
      pendingTimerRef.current = setTimeout(() => {
        pendingNavRef.current = null;
        setPendingNav(null);
      }, 2000);
    }
  }, []);

  const saveProgress = useCallback(async (p: number, completed: boolean) => {
    if (!completed && lastSaved.current === p) return;
    lastSaved.current = p;
    try {
      await fetch("/api/read/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chapter_id: chapter.id, page: p, completed }),
      });
    } catch { /* ignore */ }
  }, [chapter.id]);

  // Wait for the page to settle, so dragging the slider across 100 pages is one save, not 100.
  const latest = useRef({ page, total });
  latest.current = { page: lastShown, total };
  useEffect(() => {
    const t = setTimeout(() => saveProgress(lastShown, lastShown >= total - 1), 400);
    return () => clearTimeout(t);
  }, [lastShown, total, saveProgress]);
  useEffect(() => {
    // Leaving mid-wait still saves where you were.
    const flush = () => {
      const { page: p, total: t } = latest.current;
      if (lastSaved.current === p && p < t - 1) return;
      lastSaved.current = p;
      fetch("/api/read/progress", {
        method: "POST", keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chapter_id: chapter.id, page: p, completed: p >= t - 1 }),
      }).catch(() => {});
    };
    window.addEventListener("pagehide", flush);
    return () => { window.removeEventListener("pagehide", flush); flush(); };
  }, [chapter.id]);

  const goPrev = useCallback(() => {
    if (first > 0) {
      setPending(null);
      setPage(spreadOn ? spreadStart(first - 1) : first - 1);
    } else if (prevChapterId) {
      if (pendingNavRef.current === "prev") {
        setPending(null);
        const lastPage = prevChapterPageCount && prevChapterPageCount > 1 ? prevChapterPageCount - 1 : 0;
        const url = lastPage > 0
          ? `/library/${seriesId}/read/${prevChapterId}?page=${lastPage}`
          : `/library/${seriesId}/read/${prevChapterId}`;
        router.push(url);
      } else {
        setPending("prev");
      }
    }
  }, [first, spreadOn, prevChapterId, prevChapterPageCount, router, seriesId, setPending]);

  const goNext = useCallback(() => {
    if (lastShown < total - 1) {
      setPending(null);
      setPage(lastShown + 1);
    } else if (nextChapterId) {
      if (pendingNavRef.current === "next") {
        setPending(null);
        router.push(`/library/${seriesId}/read/${nextChapterId}`);
      } else {
        setPending("next");
      }
    } else {
      // Last page of last chapter — return to series on double-tap.
      if (pendingNavRef.current === "next") {
        setPending(null);
        router.push(`/library/${seriesId}`);
      } else {
        setPending("next");
      }
    }
  }, [lastShown, total, nextChapterId, router, seriesId, setPending]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { router.push(`/library/${seriesId}`); return; }
      if (readingMode === "rtl") {
        if (e.key === "ArrowLeft") { e.preventDefault(); goNext(); }
        else if (e.key === "ArrowRight") { e.preventDefault(); goPrev(); }
        else if (e.key === " ") { e.preventDefault(); goNext(); }
      } else {
        if (e.key === "ArrowLeft") goPrev();
        else if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); goNext(); }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goNext, goPrev, router, seriesId, readingMode]);

  // Preload the next page or two (paged modes only)
  useEffect(() => {
    if (readingMode === "webtoon") return;
    for (let i = 1; i <= shown.length; i++) {
      if (lastShown + i > total - 1) break;
      const img = new Image();
      img.src = `/api/read/${chapter.id}/page/${lastShown + i}`;
      preloadRef.current = img;
    }
  }, [lastShown, shown.length, total, chapter.id, readingMode]);

  // Near the end, start loading the next chapter so turning to it is instant.
  const nextLoaded = useRef<number | null>(null);
  useEffect(() => {
    if (!nextChapterId || nextLoaded.current === nextChapterId || lastShown < total - 3) return;
    nextLoaded.current = nextChapterId;
    router.prefetch(`/library/${seriesId}/read/${nextChapterId}`);
    for (const i of [0, 1, 2]) { const img = new Image(); img.src = `/api/read/${nextChapterId}/page/${i}`; }
  }, [lastShown, total, nextChapterId, router, seriesId]);

  // Webtoon IntersectionObserver — update page counter as images scroll into view
  useEffect(() => {
    if (readingMode !== "webtoon") return;
    const container = webtoonViewportRef.current;
    if (!container) return;

    const obs = new IntersectionObserver(
      (entries) => {
        // Pick the most-visible entry
        let best: { idx: number; ratio: number } | null = null;
        entries.forEach((entry) => {
          const idx = pageEls.current.indexOf(entry.target as HTMLImageElement);
          if (idx >= 0 && entry.intersectionRatio > (best?.ratio ?? 0)) {
            best = { idx, ratio: entry.intersectionRatio };
          }
        });
        if (best !== null) setPage((best as { idx: number }).idx);
      },
      { root: container, threshold: [0.1, 0.3, 0.5, 0.7] }
    );
    const refs = [...pageEls.current];
    refs.forEach((ref) => { if (ref) obs.observe(ref); });
    return () => obs.disconnect();
  }, [readingMode, total, chapter.id]);

  function handleViewportClick(e: React.MouseEvent<HTMLDivElement>) {
    if (readingMode === "webtoon") {
      setTopbarVisible((v) => !v);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    if (readingMode === "rtl") {
      if (pct < 0.3) goNext();
      else if (pct > 0.7) goPrev();
      else setTopbarVisible((v) => !v);
    } else {
      if (pct < 0.3) goPrev();
      else if (pct > 0.7) goNext();
      else setTopbarVisible((v) => !v);
    }
  }

  function handleSliderChange(val: number) {
    setPage(val);
    if (readingMode === "webtoon") {
      const el = pageEls.current[val];
      const container = webtoonViewportRef.current;
      if (el && container) {
        // Scroll the container (not the window) to the target image
        const containerRect = container.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        container.scrollTo({ top: elRect.top - containerRect.top + container.scrollTop, behavior: "smooth" });
      }
    }
  }

  const trackClass = `reader-progress-track${topbarVisible ? "" : " reader-progress-track-hidden"}`;
  const topbarClass = `reader-topbar${topbarVisible ? "" : " reader-topbar-hidden"}`;

  const chapterConfirmOverlay = pendingNav ? (
    <div style={{
      position: "fixed",
      bottom: "calc(90px + env(safe-area-inset-bottom))",
      left: "50%",
      transform: "translateX(-50%)",
      background: "rgba(10, 10, 18, 0.95)",
      border: "2px solid #22d3ee",
      color: "#fff",
      padding: "14px 28px",
      borderRadius: "10px",
      fontSize: "15px",
      fontWeight: "700",
      zIndex: 200,
      boxShadow: "0 0 24px rgba(34, 211, 238, 0.6)",
      pointerEvents: "none",
      textAlign: "center",
      letterSpacing: "0.03em",
      whiteSpace: "nowrap",
    }}>
      {pendingNav === "next"
        ? (!nextChapterId && lastShown >= total - 1 ? "Tap again to go back to series" : "Tap again for Next Chapter →")
        : "← Tap again for Previous Chapter"}
    </div>
  ) : null;

  const progressBar = (
    <div className={trackClass}>
      <span className="reader-slider-label">{first + 1}</span>
      <input
        type="range"
        className="reader-slider"
        min={0}
        max={Math.max(0, total - 1)}
        value={page}
        onChange={(e) => handleSliderChange(Number(e.target.value))}
      />
      <span className="reader-slider-label">{total}</span>
    </div>
  );

  const topBar = (
    <div className={topbarClass}>
      <Link href={`/library/${seriesId}`} className="btn btn-ghost btn-sm">← Back</Link>
      <div className="reader-title">{seriesTitle} — Chapter {chapter.number}</div>
      {readingMode !== "webtoon" && total > 2 && (
        <button type="button" className="btn btn-ghost btn-sm reader-spread-btn" onClick={cycleSpread}
          aria-label={`Two pages: ${spreadPref}`} title="Show two pages side by side">
          {spreadPref === "auto" ? "2 pages: auto" : spreadPref === "on" ? "2 pages: on" : "2 pages: off"}
        </button>
      )}
      <div className="reader-page-counter">{shown.length > 1 ? `${first + 1}–${lastShown + 1}` : first + 1} / {total}</div>
    </div>
  );

  // ── Webtoon mode: vertical scroll through all pages ──
  if (readingMode === "webtoon") {
    return (
      <div className="reader-page">
        {topBar}
        {chapterConfirmOverlay}
        <div
          ref={webtoonViewportRef}
          className="reader-viewport reader-viewport-webtoon"
          onClick={handleViewportClick}
        >
          {Array.from({ length: total }, (_, i) => (
            <img
              key={i}
              ref={(el) => { pageEls.current[i] = el; }}
              src={`/api/read/${chapter.id}/page/${i}`}
              alt={`Page ${i + 1}`}
            />
          ))}
          {nextChapterId && (
            <div className="reader-webtoon-next" onClick={(e) => e.stopPropagation()}>
              <Link href={`/library/${seriesId}/read/${nextChapterId}`} className="btn btn-primary">
                Next Chapter →
              </Link>
            </div>
          )}
        </div>
        {progressBar}
      </div>
    );
  }

  // ── Paged mode (LTR / RTL) ──
  return (
    <div className="reader-page">
      {topBar}
      {chapterConfirmOverlay}
      <div className={`reader-viewport${shown.length > 1 ? " reader-spread" : ""}${readingMode === "rtl" ? " reader-rtl" : ""}`} onClick={handleViewportClick}>
        {shown.map((p) => (
          <img
            key={p}
            src={`/api/read/${chapter.id}/page/${p}`}
            alt={`Page ${p + 1}`}
            style={{ pointerEvents: "none" }}
          />
        ))}
      </div>
      {progressBar}
    </div>
  );
}
