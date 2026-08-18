import type { ApplicationData, BeverageType, VerificationResult } from "./types";

/**
 * Minimal RFC 4180 CSV handling. No dependency: agents export from Excel, which
 * produces quoted fields with embedded commas, quotes, and newlines, and that is
 * the whole of what needs supporting here.
 */

/** Split CSV text into rows of raw cell strings. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  // Normalize line endings first so CRLF from Excel doesn't leak into cells.
  const input = text.replace(/\r\n?/g, "\n");

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          cell += '"'; // escaped quote
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }

  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export interface ApplicationRecord extends ApplicationData {
  /** Filename of the label image this record describes. */
  imageName: string;
}

const BEVERAGE_TYPES: Record<string, BeverageType> = {
  distilled_spirits: "distilled_spirits",
  "distilled spirits": "distilled_spirits",
  spirits: "distilled_spirits",
  wine: "wine",
  malt_beverage: "malt_beverage",
  "malt beverage": "malt_beverage",
  beer: "malt_beverage",
};

/** Accepts a few spellings agents actually type, rather than only the enum. */
export function parseBeverageType(value: string): BeverageType | undefined {
  return BEVERAGE_TYPES[value.trim().toLowerCase()];
}

const HEADER_ALIASES: Record<string, keyof ApplicationRecord> = {
  image: "imageName",
  imagename: "imageName",
  image_name: "imageName",
  filename: "imageName",
  file: "imageName",
  beveragetype: "beverageType",
  beverage_type: "beverageType",
  type: "beverageType",
  brandname: "brandName",
  brand_name: "brandName",
  brand: "brandName",
  classtype: "classType",
  class_type: "classType",
  class: "classType",
  alcoholcontent: "alcoholContent",
  alcohol_content: "alcoholContent",
  abv: "alcoholContent",
  netcontents: "netContents",
  net_contents: "netContents",
  bottlername: "bottlerName",
  bottler_name: "bottlerName",
  bottler: "bottlerName",
};

export interface CsvParseResult {
  records: ApplicationRecord[];
  /** Header names that were not recognized, so the agent can fix their file. */
  unknownColumns: string[];
}

/**
 * Parse an application CSV. The only required column is the image filename —
 * every other field is optional, and a missing one becomes Needs Review rather
 * than a silent pass.
 */
export function parseApplicationCsv(text: string): CsvParseResult {
  const rows = parseCsv(text);
  if (rows.length === 0) return { records: [], unknownColumns: [] };

  const headers = rows[0].map((h) => h.trim());
  const keys = headers.map((h) => HEADER_ALIASES[h.toLowerCase().replace(/\s+/g, "")]);
  const unknownColumns = headers.filter((_, i) => keys[i] === undefined);

  const records = rows.slice(1).map((row) => {
    const record: ApplicationRecord = { imageName: "" };
    keys.forEach((key, i) => {
      const value = (row[i] ?? "").trim();
      if (!key || value === "") return;
      if (key === "beverageType") record.beverageType = parseBeverageType(value);
      else record[key] = value;
    });
    return record;
  });

  return { records: records.filter((r) => r.imageName !== ""), unknownColumns };
}

function escapeCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(rows: readonly (readonly string[])[]): string {
  return rows.map((row) => row.map(escapeCell).join(",")).join("\n");
}

export interface ExportRow {
  imageName: string;
  result: VerificationResult | null;
  error: string | null;
}

/**
 * Flatten results to one row per field, which is what an agent needs to paste
 * into a rejection notice or a tracking sheet.
 */
export function resultsToCsv(rows: readonly ExportRow[]): string {
  const out: string[][] = [
    [
      "image",
      "overall_verdict",
      "field",
      "application_value",
      "label_value",
      "field_verdict",
      "reason",
      "model",
      "escalated",
      "latency_ms",
    ],
  ];

  for (const { imageName, result, error } of rows) {
    if (!result) {
      out.push([imageName, "error", "", "", "", "error", error ?? "Unknown error", "", "", ""]);
      continue;
    }
    for (const field of result.fields) {
      out.push([
        imageName,
        result.verdict,
        field.title,
        field.expected ?? "",
        field.observed ?? "",
        field.verdict,
        field.reason,
        result.model,
        result.escalated ? "yes" : "no",
        String(result.elapsedMs),
      ]);
    }
  }

  return toCsv(out);
}
