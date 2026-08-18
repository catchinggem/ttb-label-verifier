import type { VerificationResult } from "./types";

/**
 * Batch progress survives a refresh.
 *
 * A 300-label drop is 20+ minutes of work. Losing it to a stray Cmd-R — or a
 * federal laptop deciding to reload the tab — would be exactly the kind of
 * "modernization makes my life harder" that Dave has watched fail before.
 * Images are NOT persisted (too large, and they are on the agent's disk
 * already); only the outcomes are, which is what would be expensive to redo.
 */
const STORAGE_KEY = "ttb-batch-progress-v1";

export interface BatchRow {
  imageName: string;
  status: "pending" | "running" | "done" | "error";
  result: VerificationResult | null;
  error: string | null;
}

export interface BatchProgress {
  savedAt: number;
  rows: BatchRow[];
}

/**
 * Cached snapshot. `useSyncExternalStore` compares snapshots by reference, so
 * this must return the same object until storage actually changes — rebuilding
 * it per call would spin the component forever.
 */
let snapshot: BatchProgress | null | undefined;

/** Client snapshot for useSyncExternalStore. */
export function getProgressSnapshot(): BatchProgress | null {
  if (snapshot === undefined) snapshot = loadProgress();
  return snapshot;
}

/**
 * Server snapshot. Always null: the server has no storage, and returning null
 * lets the first client render match the server's before the store swaps in.
 */
export function getServerProgressSnapshot(): null {
  return null;
}

/** Cross-tab updates. A second tab finishing a run refreshes this one. */
export function subscribeToProgress(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) {
      snapshot = undefined;
      onChange();
    }
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}

export function loadProgress(): BatchProgress | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BatchProgress;
    if (!Array.isArray(parsed.rows)) return null;
    return parsed;
  } catch {
    // Corrupt or unavailable storage must never break the page.
    return null;
  }
}

export function saveProgress(rows: readonly BatchRow[]): void {
  if (typeof window === "undefined") return;
  try {
    // Anything still in flight when the tab closed is recorded as pending, not
    // running, so a restored view never shows a spinner nothing is driving.
    const settled = rows.map((row) =>
      row.status === "running" ? { ...row, status: "pending" as const } : row,
    );
    const next: BatchProgress = { savedAt: Date.now(), rows: settled };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    snapshot = next;
  } catch {
    // Quota exceeded on a very large run — losing persistence is survivable,
    // failing the run is not.
  }
}

export function clearProgress(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    snapshot = null;
  } catch {
    /* nothing to do */
  }
}
