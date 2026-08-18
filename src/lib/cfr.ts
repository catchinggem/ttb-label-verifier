/**
 * The § 16.21 mandatory health warning statement.
 *
 * SOURCE OF TRUTH: spec/cfr-16-21-warning.txt (fetched from eCFR).
 * This constant is a transcription of that file. `npm run check:cfr` fails the
 * build if the two drift apart.
 *
 * The CFR prints the statement as two paragraphs. Whitespace normalization
 * collapses that break, so the canonical comparison form is a single line.
 */
export const GOVERNMENT_WARNING =
  "GOVERNMENT WARNING: (1) According to the Surgeon General, women should not " +
  "drink alcoholic beverages during pregnancy because of the risk of birth defects. " +
  "(2) Consumption of alcoholic beverages impairs your ability to drive a car or " +
  "operate machinery, and may cause health problems.";

/** The prefix that must be all-caps and bold on the label. */
export const WARNING_PREFIX = "GOVERNMENT WARNING:";

/**
 * The ONLY normalization applied before comparing warning text.
 *
 * Collapses every run of whitespace — including the CFR's paragraph break and
 * any line wrapping the label artwork introduces — to a single space, and trims
 * the ends. Deliberately does NOT fold case or punctuation: 27 CFR 16.21
 * requires the statement verbatim, and "Government Warning" in title case is a
 * rejection, not a match.
 */
export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** `GOVERNMENT_WARNING` in the form used for comparison. */
export const GOVERNMENT_WARNING_NORMALIZED = normalizeWhitespace(GOVERNMENT_WARNING);
