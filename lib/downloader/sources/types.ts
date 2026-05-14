export type SeriesType = "manga" | "comic";

export interface SearchResult {
  source: string;
  type: SeriesType;
  title: string;
  url: string;
  cover?: string;
  description?: string;
  status?: "ongoing" | "completed" | "hiatus" | "unknown";
  tags?: string[];
  chapters_hint?: string; // e.g. "120 chapters"
}

export interface SeriesMetadata {
  title: string;
  description: string;
  cover?: string;
  status: "ongoing" | "completed" | "hiatus" | "unknown";
  tags: string[];
  oneShot: boolean;
}

export interface ChapterRef {
  // External chapter identifier (e.g. a URL or a MangaDex chapter id).
  externalId: string;
  number: number;
  title?: string;
}

export type ChapterPayload =
  | { kind: "images"; images: Buffer[] }
  | { kind: "archive"; data: Buffer; ext: "cbz" | "cbr" | "zip" }
  | { kind: "unsupported_host"; host: string; url: string };

export type ProgressFn = (cur: number, total: number) => void;

export interface Source {
  id: string;
  type: SeriesType;
  search(query: string): Promise<SearchResult[]>;
  getMetadata(url: string): Promise<SeriesMetadata>;
  listChapters(url: string): Promise<ChapterRef[]>;
  fetchChapter(ref: ChapterRef, onProgress: ProgressFn, signal?: AbortSignal): Promise<ChapterPayload>;
}
