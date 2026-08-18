import {
  GOVERNMENT_WARNING_NORMALIZED,
  WARNING_PREFIX,
  normalizeWhitespace,
} from "@/lib/cfr";
import type { WarningObservationData } from "@/lib/observation";
import type { FieldResult } from "@/lib/types";

/**
 * Below this ratio, a warning that is otherwise correct is held for review
 * rather than passed. 27 CFR 16.22 sets type-size minimums in millimetres
 * against container volume; we cannot measure millimetres from an uncalibrated
 * photograph, so this proxy flags the case for a human instead of deciding it.
 */
export const MIN_RELATIVE_FONT_SIZE = 0.6;

/**
 * The government warning is three independent assertions, all of which must
 * hold. They are checked separately so the reason string can name the one that
 * failed — "text matches but the prefix is title case" is a different
 * conversation with the applicant than "the warning is missing".
 *
 *   1. Text match       — verbatim, whitespace-normalized only. Strict.
 *   2. prefixIsAllCaps  — observed by the model, decided here.
 *   3. appearsBold      — observed by the model, decided here.
 *
 * Legibility is deliberately NOT a fourth assertion. A warning that is present,
 * correct, and bold but rendered very small is Needs Review, not Fail: the
 * threshold is a proxy, and a proxy should not reject an application on its own.
 */
export function checkGovernmentWarning(
  observation: WarningObservationData,
): FieldResult {
  const base = {
    field: "governmentWarning" as const,
    title: "Government Warning",
    observed: observation.text,
    expected: GOVERNMENT_WARNING_NORMALIZED,
  };

  if (!observation.present || observation.text === null) {
    return {
      ...base,
      verdict: "fail",
      reason: "No government warning statement found on the label.",
    };
  }

  const failures: string[] = [];

  // 1. Text match — whitespace normalization only. No case folding, no
  //    punctuation folding. The statement is required verbatim.
  if (normalizeWhitespace(observation.text) !== GOVERNMENT_WARNING_NORMALIZED) {
    failures.push("warning text does not match 27 CFR 16.21 verbatim");
  }

  // 2. Casing of the prefix.
  if (observation.prefixIsAllCaps === false) {
    failures.push(`"${WARNING_PREFIX}" is not in all capital letters`);
  }

  // 3. Weight of the prefix.
  if (observation.prefixAppearsBold === false) {
    failures.push(`"${WARNING_PREFIX}" does not appear bold`);
  }

  if (failures.length > 0) {
    return {
      ...base,
      verdict: "fail",
      reason: `Failed: ${failures.join("; ")}.`,
    };
  }

  // A null on either typographic observation means the model could not tell,
  // which is not the same as observing a violation. Hold for a human.
  if (
    observation.prefixIsAllCaps === null ||
    observation.prefixAppearsBold === null
  ) {
    return {
      ...base,
      verdict: "needs_review",
      reason:
        "Warning text matches, but the rendering of the " +
        `"${WARNING_PREFIX}" prefix could not be determined from this image.`,
    };
  }

  // Legibility signal — separate from the three assertions above.
  if (
    observation.relativeFontSize !== null &&
    observation.relativeFontSize < MIN_RELATIVE_FONT_SIZE
  ) {
    return {
      ...base,
      verdict: "needs_review",
      reason:
        `Warning is present, correct, and bold, but its type is ` +
        `${observation.relativeFontSize.toFixed(2)}x the size of surrounding label ` +
        `text (below the ${MIN_RELATIVE_FONT_SIZE}x review threshold). ` +
        "Undersized warnings are a known evasion — verify against the " +
        "27 CFR 16.22 type-size minimum for this container.",
    };
  }

  return {
    ...base,
    verdict: "pass",
    reason: "Text matches 27 CFR 16.21 verbatim; prefix is all caps and bold.",
  };
}
