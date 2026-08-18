/**
 * Generate the sample label images from a shared template.
 *
 * One template with per-fixture overrides, so any difference between two
 * labels is a deliberate one rather than a drifting hand-edit. Rendered with
 * headless Chrome, the same path used for the original fixture.
 *
 *   node scripts/generate-fixtures.mjs
 */
import { execFile } from "node:child_process";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { promisify } from "node:util";

const run = promisify(execFile);
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OUT = "samples";
const TMP = ".fixture-html";

/** 27 CFR 16.21, verbatim. Deviations below are deliberate and per-fixture. */
const WARNING_CLAUSE_1 =
  "(1) According to the Surgeon General, women should not drink alcoholic " +
  "beverages during pregnancy because of the risk of birth defects.";
const WARNING_CLAUSE_2 =
  "(2) Consumption of alcoholic beverages impairs your ability to drive a car " +
  "or operate machinery, and may cause health problems.";

function template({
  established = "ESTABLISHED 1897",
  brand,
  classType,
  abv,
  netContents = "750 mL",
  bottler,
  countryOfOrigin = null,
  warningPrefix = "GOVERNMENT WARNING:",
  warningClause1 = WARNING_CLAUSE_1,
  warningClause2 = WARNING_CLAUSE_2,
  warningPresent = true,
  warningSize = 25,
  prefixBold = true,
}) {
  return `<!doctype html>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: 900px; height: 1200px; display: flex; align-items: center;
         justify-content: center; background: #2b2118; font-family: Georgia, serif; }
  .label { width: 760px; height: 1060px; background: #f2e8d5; color: #2b2118;
           border: 3px double #6b4f2a; padding: 48px 44px; display: flex;
           flex-direction: column; align-items: center; text-align: center; }
  .est { letter-spacing: .34em; font-size: 17px; margin-bottom: 26px; }
  .brand { font-size: 68px; letter-spacing: .05em; line-height: 1.02; font-weight: 700; }
  .rule { width: 62%; border-top: 2px solid #6b4f2a; margin: 26px 0; }
  .class { font-size: 30px; font-style: italic; line-height: 1.35; }
  .spacer { flex: 1; }
  .abv { font-size: 27px; letter-spacing: .04em; }
  .net { font-size: 25px; margin-top: 12px; }
  .origin { font-size: 20px; margin-top: 12px; letter-spacing: .06em; }
  .bottler { font-size: 16px; line-height: 1.5; margin-top: 26px; letter-spacing: .02em; }
  .warning { font-size: ${warningSize}px; line-height: 1.42; text-align: left;
             margin-top: 26px; font-family: Helvetica, Arial, sans-serif; }
  .warning b { font-weight: ${prefixBold ? 700 : 400}; }
</style>
<div class="label">
  <div class="est">${established}</div>
  <div class="brand">${brand}</div>
  <div class="rule"></div>
  <div class="class">${classType}</div>
  <div class="spacer"></div>
  ${abv ? `<div class="abv">${abv}</div>` : ""}
  ${netContents ? `<div class="net">${netContents}</div>` : ""}
  ${countryOfOrigin ? `<div class="origin">${countryOfOrigin}</div>` : ""}
  <div class="bottler">${bottler}</div>
  ${
    warningPresent
      ? `<div class="warning"><b>${warningPrefix}</b> ${warningClause1} ${warningClause2}</div>`
      : ""
  }
</div>`;
}

/**
 * Single-line bottler statements. A multi-line block ("DISTILLED AND BOTTLED
 * BY" over the name over the city) is more realistic, but the model may or may
 * not fold the lead-in into the transcription — which would add a second
 * variable to every row of the matrix. Each fixture should vary exactly one
 * thing from the control.
 */
const OLD_TOM_BOTTLER = "OLD TOM DISTILLING CO., LOUISVILLE, KY";

/** Each fixture states the single thing it varies from the compliant control. */
export const FIXTURES = [
  {
    file: "01-compliant-control",
    varies: "nothing — every field correct and the warning verbatim",
    html: {
      brand: "OLD TOM<br>DISTILLERY",
      classType: "Kentucky Straight<br>Bourbon Whiskey",
      abv: "45% Alc./Vol. (90 Proof)",
      bottler: OLD_TOM_BOTTLER,
    },
  },
  {
    file: "02-warning-title-case",
    varies: 'warning prefix reads "Government Warning:" in title case',
    html: {
      brand: "OLD TOM<br>DISTILLERY",
      classType: "Kentucky Straight<br>Bourbon Whiskey",
      abv: "45% Alc./Vol. (90 Proof)",
      bottler: OLD_TOM_BOTTLER,
      warningPrefix: "Government Warning:",
    },
  },
  {
    file: "03-warning-non-verbatim",
    varies: "clause (1) reworded — 'expectant mothers', 'should avoid', 'harm to the baby'",
    html: {
      brand: "OLD TOM<br>DISTILLERY",
      classType: "Kentucky Straight<br>Bourbon Whiskey",
      abv: "45% Alc./Vol. (90 Proof)",
      bottler: OLD_TOM_BOTTLER,
      warningClause1:
        "(1) According to the Surgeon General, expectant mothers should avoid " +
        "alcoholic beverages during pregnancy because of the risk of harm to the baby.",
    },
  },
  {
    file: "04-warning-missing",
    varies: "no government warning anywhere on the label",
    html: {
      brand: "OLD TOM<br>DISTILLERY",
      classType: "Kentucky Straight<br>Bourbon Whiskey",
      abv: "45% Alc./Vol. (90 Proof)",
      bottler: OLD_TOM_BOTTLER,
      warningPresent: false,
    },
  },
  {
    file: "05-abv-outside-tolerance",
    varies: "label states 40% against an application of 45% (5.0 points, tolerance 0.3)",
    html: {
      brand: "OLD TOM<br>DISTILLERY",
      classType: "Kentucky Straight<br>Bourbon Whiskey",
      abv: "40% Alc./Vol. (80 Proof)",
      bottler: OLD_TOM_BOTTLER,
    },
  },
  {
    file: "06-abv-inside-tolerance",
    varies: "label states 45.2% against an application of 45% (0.2 points, inside 0.3)",
    html: {
      brand: "OLD TOM<br>DISTILLERY",
      classType: "Kentucky Straight<br>Bourbon Whiskey",
      abv: "45.2% Alc./Vol.",
      bottler: OLD_TOM_BOTTLER,
    },
  },
  {
    file: "07-missing-net-contents",
    varies: "no net contents statement on the label",
    html: {
      brand: "OLD TOM<br>DISTILLERY",
      classType: "Kentucky Straight<br>Bourbon Whiskey",
      abv: "45% Alc./Vol. (90 Proof)",
      netContents: null,
      bottler: OLD_TOM_BOTTLER,
    },
  },
  {
    file: "08-brand-case-variant",
    varies: "label sets the brand as STONE'S THROW; the application filed Stone's Throw",
    html: {
      established: "ESTABLISHED 1911",
      brand: "STONE'S<br>THROW",
      classType: "Tennessee<br>Straight Whiskey",
      abv: "43% Alc./Vol. (86 Proof)",
      bottler: "STONE'S THROW DISTILLERY, LYNCHBURG, TN",
    },
  },
  {
    file: "09-malt-below-floor",
    varies:
      "malt beverage labelled 0.5% against an application of 0.4% — 7.65(c) floor",
    html: {
      established: "BREWED SINCE 1954",
      brand: "HOLLOW CREEK<br>BREWING",
      classType: "Non-Alcoholic<br>Pale Lager",
      abv: "0.5% Alc./Vol.",
      netContents: "12 FL OZ",
      bottler: "HOLLOW CREEK BREWING CO., PORTLAND, OR",
    },
  },
  {
    file: "10-import-no-country",
    varies:
      "declared import with no country of origin statement on the label",
    html: {
      established: "ESTABLISHED 1824",
      brand: "GLEN CARRICK",
      classType: "Single Malt<br>Scotch Whisky",
      abv: "43% Alc./Vol. (86 Proof)",
      bottler: "NORTH ATLANTIC SPIRITS, BOSTON, MA",
      countryOfOrigin: null,
    },
  },
  {
    file: "12-import-with-country",
    varies:
      "same import, this time stating PRODUCT OF SCOTLAND — the other branch",
    html: {
      established: "ESTABLISHED 1824",
      brand: "GLEN CARRICK",
      classType: "Single Malt<br>Scotch Whisky",
      abv: "43% Alc./Vol. (86 Proof)",
      bottler: "NORTH ATLANTIC SPIRITS, BOSTON, MA",
      countryOfOrigin: "PRODUCT OF SCOTLAND",
    },
  },
];

async function main() {
  await mkdir(OUT, { recursive: true });
  await mkdir(TMP, { recursive: true });

  for (const fixture of FIXTURES) {
    const htmlPath = `${TMP}/${fixture.file}.html`;
    await writeFile(htmlPath, template(fixture.html), "utf8");
    await run(CHROME, [
      "--headless",
      "--disable-gpu",
      `--screenshot=${OUT}/${fixture.file}.png`,
      "--window-size=900,1200",
      "--hide-scrollbars",
      `file://${process.cwd()}/${htmlPath}`,
    ]).catch((e) => {
      // Chrome writes progress to stderr and exits 0; only a missing file is fatal.
      if (!e.stdout && !e.stderr) throw e;
    });
    console.log(`  ${fixture.file}.png — varies: ${fixture.varies}`);
  }

  await rm(TMP, { recursive: true, force: true });
  console.log(`\ngenerate-fixtures — ${FIXTURES.length} labels -> ${OUT}/`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
