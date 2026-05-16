import { notFound, redirect } from "next/navigation";
import ReaderViewer from "../../../../components/ReaderViewer";
import db from "@/lib/db";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { sessionOptions, User } from "@/lib/session";

export const dynamic = "force-dynamic";

interface ChapterRow {
  id: number;
  series_id: number;
  number: number;
  title: string;
  page_count: number;
}
interface SeriesRow { id: number; title: string; reading_mode: string; }

export default async function ReaderPage({
  params, searchParams,
}: {
  params: Promise<{ id: string; chapterId: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await getIronSession<{ user?: User }>(await cookies(), sessionOptions);
  if (!session.user) {
    redirect("/login");
  }

  const { id, chapterId } = await params;
  const { page } = await searchParams;

  const seriesId = Number(id);
  const cId = Number(chapterId);
  if (!Number.isFinite(seriesId) || !Number.isFinite(cId)) notFound();

  const series = db.prepare("SELECT id, title, reading_mode FROM series WHERE id = ?").get(seriesId) as SeriesRow | undefined;
  const chapter = db.prepare(
    "SELECT id, series_id, number, title, page_count FROM chapters WHERE id = ? AND series_id = ?"
  ).get(cId, seriesId) as ChapterRow | undefined;
  if (!series || !chapter) notFound();

  const next = db.prepare(
    "SELECT id FROM chapters WHERE series_id = ? AND number > ? ORDER BY number ASC LIMIT 1"
  ).get(seriesId, chapter.number) as { id: number } | undefined;
  const prev = db.prepare(
    "SELECT id FROM chapters WHERE series_id = ? AND number < ? ORDER BY number DESC LIMIT 1"
  ).get(seriesId, chapter.number) as { id: number } | undefined;

  const initialPage = Math.max(0, Math.min(Number(page || 0) || 0, Math.max(0, chapter.page_count - 1)));

  const readingMode = (["ltr", "rtl", "webtoon"].includes(series.reading_mode)
    ? series.reading_mode
    : "ltr") as "ltr" | "rtl" | "webtoon";

  return (
    <ReaderViewer
      seriesId={seriesId}
      seriesTitle={series.title}
      chapter={chapter}
      initialPage={initialPage}
      nextChapterId={next?.id ?? null}
      prevChapterId={prev?.id ?? null}
      readingMode={readingMode}
    />
  );
}
