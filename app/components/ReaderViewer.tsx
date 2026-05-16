"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Props {
  seriesId: number;
  seriesTitle: string;
  chapter: { id: number; number: number; title: string; page_count: number };
  initialPage: number;
  nextChapterId: number | null;
  prevChapterId: number | null;
  readingMode: "ltr" | "rtl" | "webtoon";
}

export default function ReaderViewer({
  seriesId, seriesTitle, chapter, initialPage, nextChapterId, prevChapterId, readingMode,
}: Props) {
  const router = useRouter();
  const [page, setPage] = useState(Math.max(0, Math.min(initialPage, chapter.page_count - 1)));
  const [topbarVisible, setTopbarVisible] = useState(true);
  const total = Math.max(1, chapter.page_count);
  const lastSaved = useRef(-1);
  const preloadRef = useRef<HTMLImageElement | null>(null);
  const pageEls = useRef<(HTMLImageElement | null)[]>([]);

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

  useEffect(() => {
    saveProgress(page, page >= total - 1);
  }, [page, total, saveProgress]);

  const goPrev = useCallback(() => {
    if (page > 0) setPage((p) => p - 1);
    else if (prevChapterId) router.push(`/library/${seriesId}/read/${prevChapterId}`);
  }, [page, prevChapterId, router, seriesId]);

  const goNext = useCallback(() => {
    if (page < total - 1) setPage((p) => p + 1);
    else if (nextChapterId) router.push(`/library/${seriesId}/read/${nextChapterId}`);
  }, [page, total, nextChapterId, router, seriesId]);

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

  // Preload next page (paged modes only)
  useEffect(() => {
    if (readingMode === "webtoon") return;
    if (page < total - 1) {
      const img = new Image();
      img.src = `/api/read/${chapter.id}/page/${page + 1}`;
      preloadRef.current = img;
    }
  }, [page, total, chapter.id, readingMode]);

  // Webtoon IntersectionObserver — update page counter as images scroll into view
  useEffect(() => {
    if (readingMode !== "webtoon") return;
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const idx = pageEls.current.indexOf(entry.target as HTMLImageElement);
            if (idx >= 0) setPage(idx);
          }
        });
      },
      { threshold: 0.4 }
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
      // In RTL: left side advances (next page), right side goes back
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
    if (readingMode === "webtoon") {
      pageEls.current[val]?.scrollIntoView({ behavior: "smooth" });
    }
    setPage(val);
  }

  const trackClass = `reader-progress-track${topbarVisible ? "" : " reader-progress-track-hidden"}`;
  const topbarClass = `reader-topbar${topbarVisible ? "" : " reader-topbar-hidden"}`;

  const progressBar = (
    <div className={trackClass}>
      <span className="reader-slider-label">{page + 1}</span>
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
      <div className="reader-page-counter">{page + 1} / {total}</div>
    </div>
  );

  // ── Webtoon mode: vertical scroll through all pages ──
  if (readingMode === "webtoon") {
    return (
      <div className="reader-page">
        {topBar}
        <div className="reader-viewport reader-viewport-webtoon" onClick={handleViewportClick}>
          {Array.from({ length: total }, (_, i) => (
            <img
              key={i}
              ref={(el) => { pageEls.current[i] = el; }}
              src={`/api/read/${chapter.id}/page/${i}`}
              alt={`Page ${i + 1}`}
            />
          ))}
          {nextChapterId && (
            <div className="reader-webtoon-next">
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
      <div className="reader-viewport" onClick={handleViewportClick}>
        <img
          src={`/api/read/${chapter.id}/page/${page}`}
          alt={`Page ${page + 1}`}
          style={{ pointerEvents: "none" }}
        />
      </div>
      {progressBar}
    </div>
  );
}
