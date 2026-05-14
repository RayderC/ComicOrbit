// In-memory progress bus. Consumers (SSE clients) subscribe; downloader publishes.
// Restarts wipe state — the DB row is the persistent source of truth.

export type QueueStatus = "queued" | "downloading" | "paused" | "error" | "done";

export interface ProgressState {
  queueId: number;
  seriesId: number;
  status: QueueStatus;
  progress_pct: number;
  current_chapter: string;
  error_message: string;
  updated_at: string;
}

type Listener = (snapshot: ProgressState[]) => void;

const state = new Map<number, ProgressState>();
const listeners = new Set<Listener>();

export function publish(s: ProgressState) {
  state.set(s.queueId, s);
  const snap = snapshot();
  for (const l of listeners) {
    try { l(snap); } catch { /* swallow */ }
  }
}

export function remove(queueId: number) {
  state.delete(queueId);
  const snap = snapshot();
  for (const l of listeners) {
    try { l(snap); } catch { /* swallow */ }
  }
}

export function snapshot(): ProgressState[] {
  return Array.from(state.values()).sort((a, b) => a.queueId - b.queueId);
}

export function subscribe(l: Listener): () => void {
  listeners.add(l);
  // Send current snapshot to the new subscriber.
  try { l(snapshot()); } catch { /* swallow */ }
  return () => { listeners.delete(l); };
}
