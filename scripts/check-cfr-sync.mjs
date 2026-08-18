/**
 * Guards against drift between spec/cfr-16-21-warning.txt (the fetched eCFR
 * text, source of truth) and the GOVERNMENT_WARNING constant the checks compare
 * against. Run by `npm run check:cfr`.
 */
import { readFileSync } from "node:fs";

const normalize = (text) => text.replace(/\s+/g, " ").trim();

const fileText = normalize(
  readFileSync(new URL("../spec/cfr-16-21-warning.txt", import.meta.url), "utf8")
    .split("\n")
    .filter((line) => !line.startsWith("#"))
    .join("\n"),
);

const source = readFileSync(new URL("../src/lib/cfr.ts", import.meta.url), "utf8");
// Grab the whole `GOVERNMENT_WARNING = ... ;` declaration, then the string
// literals inside it, so a concatenated constant is reassembled in full.
const declaration = source.match(/GOVERNMENT_WARNING\s*=([\s\S]*?);\s*$/m)?.[1] ?? "";
const constantText = normalize(
  [...declaration.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]).join(""),
);

if (!constantText) {
  console.error("check:cfr — could not parse GOVERNMENT_WARNING from src/lib/cfr.ts");
  process.exit(1);
}

if (fileText !== constantText) {
  console.error("check:cfr — GOVERNMENT_WARNING has drifted from spec/cfr-16-21-warning.txt\n");
  console.error(`  spec file: ${fileText}\n`);
  console.error(`  constant : ${constantText}`);
  process.exit(1);
}

console.log("check:cfr — GOVERNMENT_WARNING matches spec/cfr-16-21-warning.txt");
