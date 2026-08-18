import type { BeverageType, FieldResult } from "@/lib/types";

/**
 * ABV labeling tolerances, transcribed from spec/cfr-abv-tolerances.txt.
 *
 * SECTION NUMBERING: the project brief cited 27 CFR 5.37 and 7.71. Neither
 * exists in the current CFR — T.D. TTB-176 (87 FR 232, Jan 2022) reorganized
 * parts 5 and 7, moving alcohol content to 5.65 and 7.65. Part 4 was not
 * reorganized, so 4.36 is still current.
 *
 * WHAT THE REGULATION ACTUALLY GOVERNS: each tolerance is the permitted spread
 * between a product's ACTUAL alcohol content and the content STATED ON ITS
 * LABEL. This tool compares the label against the APPLICATION, so it is using
 * the applicant's declared figure as a stand-in for actual content. That is the
 * right check for catching transcription errors between form and artwork, but
 * it is not a laboratory verification and does not establish compliance with
 * these sections on its own.
 */

export interface Tolerance {
  /** Permitted spread in percentage points, either direction. */
  percentagePoints: number;
  /** Citation for the reason string. */
  citation: string;
  /** Extra rule that applies regardless of the tolerance, if any. */
  note?: string;
}

/**
 * Resolve the tolerance for a beverage type at a given declared ABV.
 *
 * `declaredAbv` is the application's figure, which stands in for actual content
 * (see the module note). Wine brackets on it; malt beverages use it for the
 * no-tolerance carve-outs.
 */
export function toleranceFor(
  beverageType: BeverageType,
  declaredAbv: number,
): Tolerance {
  switch (beverageType) {
    case "distilled_spirits":
      // 5.65(c): "plus or minus 0.3 percentage points".
      return { percentagePoints: 0.3, citation: "27 CFR 5.65(c)" };

    case "wine":
      // 4.36(b)(1): 1% for wines over 14% ABV, 1.5% for 14% or less.
      return declaredAbv > 14
        ? { percentagePoints: 1.0, citation: "27 CFR 4.36(b)(1)" }
        : { percentagePoints: 1.5, citation: "27 CFR 4.36(b)(1)" };

    case "malt_beverage":
      // 7.65(c): 0.3 points, but only for malt beverages at or above 0.5% ABV.
      // 7.65(e)-(f): no tolerance at all below that, where "non-alcoholic" and
      // "alcohol free" claims attach.
      if (declaredAbv < 0.5) {
        return {
          percentagePoints: 0,
          citation: "27 CFR 7.65(e)-(f)",
          note: 'No tolerance is permitted below 0.5% ABV, where "non-alcoholic" and "alcohol free" claims apply.',
        };
      }
      return {
        percentagePoints: 0.3,
        citation: "27 CFR 7.65(c)",
        note: "A malt beverage labeled at 0.5% ABV or more may not fall below 0.5%, regardless of tolerance.",
      };
  }
}

/** First percentage figure in a string, e.g. "45% Alc./Vol. (90 Proof)" -> 45. */
export function parseAbv(text: string | null | undefined): number | null {
  if (!text) return null;
  const match = text.match(/(\d+(?:\.\d+)?)\s*%/);
  return match ? Number.parseFloat(match[1]) : null;
}

/**
 * Compare the label's stated ABV against the application's, within the
 * tolerance for the beverage type. Within tolerance is a Pass carrying the
 * delta; outside is a Fail.
 */
export function checkAlcoholContent(
  observed: string | null,
  expected: string | undefined,
  beverageType: BeverageType | undefined,
): FieldResult {
  const base = {
    field: "alcoholContent" as const,
    title: "Alcohol Content",
    observed,
    expected: expected ?? null,
  };

  if (!expected) {
    return {
      ...base,
      verdict: "needs_review",
      reason: "The application does not specify an alcohol content; nothing to compare against.",
    };
  }

  if (observed === null) {
    return {
      ...base,
      verdict: "fail",
      reason: `The application specifies ${expected}, but no alcohol content appears on the label.`,
    };
  }

  const observedAbv = parseAbv(observed);
  const expectedAbv = parseAbv(expected);

  if (observedAbv === null || expectedAbv === null) {
    return {
      ...base,
      verdict: "needs_review",
      reason:
        `Could not read a percentage from ` +
        `${observedAbv === null ? `the label ("${observed}")` : `the application ("${expected}")`}` +
        ", so no tolerance comparison was possible.",
    };
  }

  // The tolerance bracket is a compliance question, not something to guess at
  // from the artwork. Without a declared type, hold for a human.
  if (!beverageType) {
    return {
      ...base,
      verdict: "needs_review",
      reason:
        `Label states ${observedAbv}% and the application ${expectedAbv}%, but the ` +
        "application does not declare a beverage type, so the applicable tolerance " +
        "(27 CFR 4.36, 5.65, or 7.65) could not be selected.",
    };
  }

  const tolerance = toleranceFor(beverageType, expectedAbv);
  const delta = Math.round(Math.abs(observedAbv - expectedAbv) * 100) / 100;
  const suffix = tolerance.note ? ` ${tolerance.note}` : "";

  // 7.65(c): the 0.5% floor binds regardless of tolerance.
  if (
    beverageType === "malt_beverage" &&
    observedAbv >= 0.5 &&
    expectedAbv < 0.5
  ) {
    return {
      ...base,
      verdict: "fail",
      reason:
        `Label states ${observedAbv}% but the application declares ${expectedAbv}%. ` +
        "A malt beverage labeled at 0.5% ABV or more may not fall below 0.5%, " +
        "regardless of tolerance (27 CFR 7.65(c)).",
    };
  }

  if (delta <= tolerance.percentagePoints) {
    return {
      ...base,
      verdict: "pass",
      reason:
        delta === 0
          ? `Label states ${observedAbv}% ABV, matching the application exactly.`
          : `Label states ${observedAbv}% against the application's ${expectedAbv}% — ` +
            `a ${delta} point difference, within the ${tolerance.percentagePoints} point ` +
            `tolerance in ${tolerance.citation}.${suffix}`,
    };
  }

  return {
    ...base,
    verdict: "fail",
    reason:
      `Label states ${observedAbv}% against the application's ${expectedAbv}% — ` +
      `a ${delta} point difference, exceeding the ${tolerance.percentagePoints} point ` +
      `tolerance in ${tolerance.citation}.${suffix}`,
  };
}
