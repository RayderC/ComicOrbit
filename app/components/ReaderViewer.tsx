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
}

export default function ReaderViewer({
  seriesId, seriesTitle, chapter, initialPage, nextChapterId, prevChapterId,
}: Props) {
  const router = useRouter();
  const [page, setPage] = useState(Math.max(0, Math.min(initialPage, chapter.page_count - 1)));
  const [topbarVisible, setTopbarVisible] = useState(true);
  const total = Math.max(1, chapter.page_count);
  const lastSaved = useRef(-1);
  const preloadRef = useRef<HTMLImageElement | null>(null);

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
    if (page > 0) setPage(page - 1);
    else if (prevChapterId) router.push(`/library/${seriesId}/read/${prevChapterId}`);
  }, [page, prevChapterId, router, seriesId]);

  const goNext = useCallback(() => {
    if (page < total - 1) setPage(page + 1);
    else if (nextChapterId) router.push(`/library/${seriesId}/read/${nextChapterId}`);
  }, [page, total, nextChapterId, router, seriesId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); goNext(); }
      else if (e.key === "Escape") router.push(`/library/${seriesId}`);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goNext, goPrev, router, seriesId]);

  useEffect(() => {
    if (page < total - 1) {
      const img = new Image();
      img.src = `/api/read/${chapter.id}/page/${page + 1}`;
      preloadRef.current = img;
    }
  }, [page, total, chapter.id]);

  function handleViewportClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    if (pct < 0.3) goPrev();
    else if (pct > 0.7) goNext();
    else setTopbarVisible((v) => !v);
  }

  return (
    <div className="reader-page">
      <div className={`reader-topbar${topbarVisible ? "" : " reader-topbar-hidden"}`}>
        <Link href={`/library/${seriesId}`} className="btn btn-ghost btn-sm">← Back</Link>
        <div className="reader-title">
          {seriesTitle} — Chapter {chapter.number}
        </div>
        <div className="reader-page-counter">
          {page + 1} / {total}
        </div>
      </div>

      <div className="reader-viewport" onClick={handleViewportClick}>
        <img
          src={`/api/read/${chapter.id}/page/${page}`}
          alt={`Page ${page + 1}`}
          style={{ pointerEvents: "none" }}
        />
      </div>

      <div className="reader-progress-track">
        <div
          className="reader-progress-fill"
          style={{ width: `${Math.round(((page + 1) / total) * 100)}%` }}
        />
      </div>
    </div>
  );
}
