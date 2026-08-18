/**
 * Bounded-concurrency task pool.
 *
 * A 300-label drop fired at once would be rejected by rate limits and would
 * bury the browser. This runs a fixed number of workers over a shared cursor,
 * so the pool stays saturated without the batching stalls of a chunked
 * approach — a slow image never holds up the ones behind it.
 */
export const DEFAULT_CONCURRENCY = 8;

export type Settled<R> =
  | { status: "fulfilled"; index: number; value: R }
  | { status: "rejected"; index: number; reason: Error };

export interface RunOptions<T, R> {
  items: readonly T[];
  limit?: number;
  worker: (item: T, index: number) => Promise<R>;
  /** Called as each item settles, in completion order, so the UI can stream. */
  onSettled?: (result: Settled<R>) => void;
  /** Checked before each task starts, so a cancelled run stops promptly. */
  signal?: AbortSignal;
}

/**
 * Runs `worker` over `items`, at most `limit` at a time.
 *
 * One failure never kills the run: every rejection is captured and reported as
 * a settled result. The returned array is ordered by input index regardless of
 * completion order, so a caller can line results up with their inputs.
 */
export async function runBounded<T, R>({
  items,
  limit = DEFAULT_CONCURRENCY,
  worker,
  onSettled,
  signal,
}: RunOptions<T, R>): Promise<Settled<R>[]> {
  const results: Settled<R>[] = new Array(items.length);
  let cursor = 0;

  async function drain(): Promise<void> {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      if (signal?.aborted) return;

      let settled: Settled<R>;
      try {
        settled = { status: "fulfilled", index, value: await worker(items[index], index) };
      } catch (error) {
        settled = {
          status: "rejected",
          index,
          reason: error instanceof Error ? error : new Error(String(error)),
        };
      }

      results[index] = settled;
      onSettled?.(settled);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, drain);
  await Promise.all(workers);

  return results;
}
