import { normalizeWhitespace } from "@/lib/cfr";
import type { LabelObservation } from "@/lib/observation";
import type { ApplicationData, FieldId, FieldResult } from "@/lib/types";

/**
 * Cosmetic normalization for comparing a label string against an application
 * string: case, whitespace, and punctuation are flattened.
 *
 * This is NOT the warning normalizer — the warning is strict and lives in
 * lib/cfr.ts. Here it encodes a deliberate judgment call: "STONE'S THROW" on
 * the label and "Stone's Throw" in the application are the same brand, and
 * failing that pair would bury agents in noise. A difference that survives this
 * normalization is a real mismatch.
 */
function normalizeForComparison(text: string): string {
  return normalizeWhitespace(text)
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[.,'"()\-–—]/g, "");
}

/** Compare one label field against its application counterpart. */
export function compareField(
  field: FieldId,
  title: string,
  observed: string | null,
  expected: string | undefined,
): FieldResult {
  const base = { field, title, observed, expected: expected ?? null };

  if (!expected) {
    return {
      ...base,
      verdict: "needs_review",
      reason: `The application does not specify a ${title.toLowerCase()}; nothing to compare against.`,
    };
  }

  if (observed === null) {
    return {
      ...base,
      verdict: "fail",
      reason: `The application specifies "${expected}", but no ${title.toLowerCase()} appears on the label.`,
    };
  }

  if (normalizeWhitespace(observed) === normalizeWhitespace(expected)) {
    return { ...base, verdict: "pass", reason: "Exact match with the application." };
  }

  if (normalizeForComparison(observed) === normalizeForComparison(expected)) {
    return {
      ...base,
      verdict: "pass",
      reason: `Matches the application apart from capitalization or punctuation ("${observed}" vs "${expected}").`,
    };
  }

  return {
    ...base,
    verdict: "fail",
    reason: `Label reads "${observed}" but the application specifies "${expected}".`,
  };
}

/** First percentage figure in a string, e.g. "45% Alc./Vol. (90 Proof)" -> 45. */
export function parseAbv(text: string | null): number | null {
  if (!text) return null;
  const match = text.match(/(\d+(?:\.\d+)?)\s*%/);
  return match ? Number.parseFloat(match[1]) : null;
}

/**
 * Alcohol content is compared numerically so that "45%" and "45.0% Alc./Vol."
 * agree.
 *
 * KNOWN GAP: 27 CFR 4.36 / 5.37 / 7.71 permit a labeling tolerance that varies
 * by beverage type and stated ABV. This scaffold requires exact numeric
 * equality, so a within-tolerance label currently reads as a mismatch. Wire the
 * per-type tolerance table in before this is used for real review decisions.
 */
export function checkAlcoholContent(
  observed: string | null,
  expected: string | undefined,
): FieldResult {
  const base = {
    field: "alcoholContent" as const,
    title: "Alcohol Content",
    observed,
    expected: expected ?? null,
  };

  const observedAbv = parseAbv(observed);
  const expectedAbv = parseAbv(expected ?? null);

  if (expectedAbv === null || observedAbv === null) {
    return compareField("alcoholContent", "Alcohol Content", observed, expected);
  }

  if (observedAbv === expectedAbv) {
    return {
      ...base,
      verdict: "pass",
      reason: `Label states ${observedAbv}% ABV, matching the application.`,
    };
  }

  return {
    ...base,
    verdict: "fail",
    reason: `Label states ${observedAbv}% ABV but the application specifies ${expectedAbv}%.`,
  };
}

/** Every non-warning field check, in the order agents read them. */
export function checkApplicationFields(
  observation: LabelObservation,
  application: ApplicationData,
): FieldResult[] {
  return [
    compareField("brandName", "Brand Name", observation.brandName.text, application.brandName),
    compareField("classType", "Class / Type", observation.classType.text, application.classType),
    checkAlcoholContent(observation.alcoholContent.text, application.alcoholContent),
    compareField("netContents", "Net Contents", observation.netContents.text, application.netContents),
  ];
}
