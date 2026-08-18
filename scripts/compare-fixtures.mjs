/**
 * Isolation experiment for typographic misreads.
 *
 * Runs two fixtures that are identical except for the warning's type size
 * through extraction, and prints the model's rendering observations side by
 * side. If bold detection is correct at normal size and wrong at small size,
 * the failure mode is size-dependent and the prompt or the escalation gate is
 * the place to fix it — not the check's thresholds.
 *
 *   npm run dev
 *   npm run compare:fixtures
 */
const BASE_URL = process.env.MEASURE_URL ?? "http://localhost:3000";
const REPEATS = Number(process.env.COMPARE_REPEATS ?? 3);

const FIXTURES = [
  { label: "small warning  (11px)", path: "fixtures/old-tom-label.png" },
  { label: "normal warning (25px)", path: "fixtures/old-tom-label-normal-warning.png" },
];

const { readFile } = await import("node:fs/promises");
const { basename } = await import("node:path");

async function observe(path) {
  const bytes = await readFile(path);
  const form = new FormData();
  form.set("image", new Blob([bytes], { type: "image/png" }), basename(path));
  const response = await fetch(`${BASE_URL}/api/verify`, { method: "POST", body: form });
  const body = await response.json();
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${body.error}`);
  return body;
}

const show = (v) => (v === null ? "null " : v === true ? "true " : v === false ? "FALSE" : String(v));

console.log(`Ground truth for both fixtures: the "GOVERNMENT WARNING:" prefix IS`);
console.log(`bold and IS all caps. Any false/null below is a model misread.\n`);

for (const fixture of FIXTURES) {
  console.log(`${fixture.label}  (${REPEATS} runs)`);
  for (let i = 0; i < REPEATS; i++) {
    const body = await observe(fixture.path);
    const w = body.observation.governmentWarning;
    const warningField = body.fields.find((f) => f.field === "governmentWarning");
    console.log(
      `  allCaps=${show(w.prefixIsAllCaps)}  bold=${show(w.prefixAppearsBold)}  ` +
        `relSize=${w.relativeFontSize === null ? "null" : w.relativeFontSize.toFixed(2)}  ` +
        `conf=${w.confidence.toFixed(2)}  model=${body.model.replace(/^claude-/, "")}  ` +
        `-> ${warningField.verdict}`,
    );
    // Verbatim text is a separate question from rendering — report it separately.
    const textOk = warningField.reason.includes("diverges") === false;
    if (!textOk) console.log(`    text: ${warningField.reason.split(". ")[0]}.`);
  }
  console.log();
}
