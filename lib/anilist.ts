import db from "./db";

const ANILIST_API = "https://graphql.anilist.co";

async function anilistRequest(token: string, query: string, variables: Record<string, unknown>) {
  const res = await fetch(ANILIST_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`AniList HTTP ${res.status}`);
  const json = await res.json() as { data?: unknown; errors?: { message: string }[] };
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data;
}

async function findAnilistId(token: string, title: string): Promise<number | null> {
  const data = await anilistRequest(token, `
    query ($search: String) {
      Media(search: $search, type: MANGA) { id title { romaji english } }
    }
  `, { search: title }) as { Media?: { id: number } } | null;
  return data?.Media?.id ?? null;
}

export async function syncAnilistProgress(userId: number, seriesId: number, chaptersRead: number): Promise<void> {
  const user = db.prepare("SELECT anilist_token FROM users WHERE id = ?").get(userId) as { anilist_token: string } | undefined;
  if (!user?.anilist_token) return;

  const seriesRow = db.prepare("SELECT anilist_id, title FROM series WHERE id = ?").get(seriesId) as
    | { anilist_id: number | null; title: string }
    | undefined;
  if (!seriesRow) return;

  let anilistId = seriesRow.anilist_id;

  if (!anilistId) {
    try {
      const found = await findAnilistId(user.anilist_token, seriesRow.title);
      if (!found) return;
      anilistId = found;
      db.prepare("UPDATE series SET anilist_id = ? WHERE id = ?").run(anilistId, seriesId);
    } catch {
      return;
    }
  }

  // Determine the appropriate list status.
  // Set COMPLETED when the user has read every chapter available in the local library.
  const totalLocal = (db.prepare(
    "SELECT COUNT(*) as c FROM chapters WHERE series_id = ?"
  ).get(seriesId) as { c: number }).c;

  const status = totalLocal > 0 && chaptersRead >= totalLocal ? "COMPLETED" : "CURRENT";

  try {
    await anilistRequest(user.anilist_token, `
      mutation ($mediaId: Int, $progress: Int, $status: MediaListStatus) {
        SaveMediaListEntry(mediaId: $mediaId, progress: $progress, status: $status) { id }
      }
    `, {
      mediaId: anilistId,
      progress: chaptersRead,
      status,
    });
  } catch (e) {
    console.warn("[anilist] sync failed for series", seriesId, (e as Error).message);
  }
}
