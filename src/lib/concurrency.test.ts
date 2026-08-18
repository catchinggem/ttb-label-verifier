import { describe, expect, it } from "vitest";
import { runBounded } from "./concurrency";

describe("runBounded", () => {
  it("returns results in input order regardless of completion order", async () => {
    const results = await runBounded({
      items: [30, 10, 20],
      limit: 3,
      worker: async (ms) => {
        await new Promise((r) => setTimeout(r, ms));
        return ms;
      },
    });
    expect(results.map((r) => (r.status === "fulfilled" ? r.value : null))).toEqual([30, 10, 20]);
  });

  it("never exceeds the concurrency limit", async () => {
    let active = 0;
    let peak = 0;
    await runBounded({
      items: Array.from({ length: 25 }, (_, i) => i),
      limit: 8,
      worker: async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 5));
        active--;
      },
    });
    expect(peak).toBeLessThanOrEqual(8);
  });

  /** One bad label in a 300-label drop must not sink the run. */
  it("captures a rejection and keeps going", async () => {
    const results = await runBounded({
      items: [1, 2, 3, 4],
      limit: 2,
      worker: async (n) => {
        if (n === 2) throw new Error("image missing");
        return n * 10;
      },
    });
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    const failed = results[1];
    expect(failed.status).toBe("rejected");
    if (failed.status === "rejected") expect(failed.reason.message).toBe("image missing");
  });

  it("wraps non-Error throws so callers always get a message", async () => {
    const [only] = await runBounded({
      items: ["x"],
      worker: async () => {
        throw "just a string";
      },
    });
    expect(only.status).toBe("rejected");
    if (only.status === "rejected") expect(only.reason.message).toBe("just a string");
  });

  it("streams each result as it settles", async () => {
    const seen: number[] = [];
    await runBounded({
      items: [1, 2, 3],
      limit: 1,
      worker: async (n) => n,
      onSettled: (r) => seen.push(r.index),
    });
    expect(seen).toEqual([0, 1, 2]);
  });

  it("stops early when aborted", async () => {
    const controller = new AbortController();
    let ran = 0;
    const run = runBounded({
      items: Array.from({ length: 50 }, (_, i) => i),
      limit: 2,
      signal: controller.signal,
      worker: async () => {
        ran++;
        await new Promise((r) => setTimeout(r, 5));
      },
    });
    setTimeout(() => controller.abort(), 20);
    await run;
    expect(ran).toBeLessThan(50);
  });

  it("handles an empty input list", async () => {
    expect(await runBounded({ items: [], worker: async () => 1 })).toEqual([]);
  });
});
