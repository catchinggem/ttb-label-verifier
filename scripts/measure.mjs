/**
 * End-to-end latency measurement against a running dev server.
 *
 *   npm run dev            # in one terminal
 *   npm run measure        # in another
 *
 * Reports p50 over N sequential runs, plus the per-tier split so the cost of
 * the escalation path is visible separately from the Haiku baseline.
 */
import { readFile } from "node:fs/promises";
import { basename } from "node:path";

const BASE_URL = process.env.MEASURE_URL ?? "http://localhost:3000";
const RUNS = Number(process.env.MEASURE_RUNS ?? 5);
const IMAGE = process.env.MEASURE_IMAGE ?? "fixtures/old-tom-label.png";

/** What the fixture label actually says, so the run also checks correctness. */
const APPLICATION = {
  beverageType: "distilled_spirits",
  brandName: "OLD TOM DISTILLERY",
  classType: "Kentucky Straight Bourbon Whiskey",
  alcoholContent: "45% Alc./Vol. (90 Proof)",
  netContents: "750 mL",
  bottlerName: "OLD TOM DISTILLING CO. LOUISVILLE, KENTUCKY",
};

function percentile(sorted, p) {
  if (sorted.length === 0) return NaN;
  // Nearest-rank: with 5 runs, p50 is the 3rd value. No interpolation, so the
  // number reported is one an actual request produced.
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(rank, sorted.length) - 1];
}

const bytes = await readFile(IMAGE);

async function run() {
  const form = new FormData();
  form.set("image", new Blob([bytes], { type: "image/png" }), basename(IMAGE));
  form.set("application", JSON.stringify(APPLICATION));

  const started = performance.now();
  const response = await fetch(`${BASE_URL}/api/verify`, { method: "POST", body: form });
  const wallMs = Math.round(performance.now() - started);
  const body = await response.json();

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${body.error ?? "unknown error"}`);
  }
  return { wallMs, body };
}

console.log(`Measuring ${RUNS} sequential runs against ${BASE_URL}`);
console.log(`Image: ${IMAGE} (${(bytes.length / 1024).toFixed(0)} KB)\n`);

const results = [];
for (let i = 1; i <= RUNS; i++) {
  const { wallMs, body } = await run();
  results.push({ wallMs, body });
  const tiers = body.attempts
    .map((a) => `${a.model.replace(/^claude-/, "")} ${a.latencyMs}ms`)
    .join(" -> ");
  console.log(
    `  run ${i}: ${String(wallMs).padStart(5)}ms  ${body.verdict.padEnd(12)} ` +
      `${body.escalated ? "ESCALATED" : "direct   "}  [${tiers}]`,
  );
}

const wall = results.map((r) => r.wallMs).sort((a, b) => a - b);
const escalations = results.filter((r) => r.body.escalated).length;

console.log(`\n  p50 wall clock : ${percentile(wall, 50)}ms`);
console.log(`  min / max      : ${wall[0]}ms / ${wall[wall.length - 1]}ms`);
console.log(`  budget (5000ms): ${percentile(wall, 50) <= 5000 ? "MET" : "MISSED"}`);
console.log(`  escalated      : ${escalations}/${RUNS} runs`);

// Per-tier medians, so the escalation path's cost is legible on its own.
const byModel = new Map();
for (const { body } of results) {
  for (const a of body.attempts) {
    byModel.set(a.model, [...(byModel.get(a.model) ?? []), a.latencyMs]);
  }
}
console.log("\n  per-model call latency (median):");
for (const [model, samples] of byModel) {
  const sorted = [...samples].sort((a, b) => a - b);
  console.log(`    ${model.padEnd(28)} ${percentile(sorted, 50)}ms  (n=${samples.length})`);
}

const last = results.at(-1).body;
console.log(`\n  final verdict: ${last.verdict}`);
for (const f of last.fields) {
  console.log(`    ${f.verdict.padEnd(12)} ${f.title.padEnd(20)} ${f.reason}`);
}
