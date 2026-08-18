import {
  GOVERNMENT_WARNING_NORMALIZED,
  WARNING_PREFIX,
  normalizeWhitespace,
} from "@/lib/cfr";
import { describeDivergence, firstDivergence } from "@/lib/diff";
import type { WarningObservationData } from "@/lib/observation";
import type { FieldResult, Verdict } from "@/lib/types";

/**
 * Relative font size is reported as a BAND, not a point boundary.
 *
 * 27 CFR 16.22 sets type-size minimums in millimetres against container volume,
 * which is not measurable from an uncalibrated photograph. Measured against the
 * same fixture three times, the model returned 0.55, 0.65, and 0.65 — a spread
 * of ±0.05 that made a single 0.6 boundary flap between Pass and Needs Review
 * on identical input. An estimate that noisy cannot support a point boundary,
 * so the uncertain middle is called out as uncertain rather than decided.
 */
export const FONT_SIZE_REVIEW_BELOW = 0.5;
export const FONT_SIZE_PASS_ABOVE = 0.7;

/**
 * The government warning is three independent assertions. They are checked and
 * reported separately, but they do NOT carry equal weight:
 *
 *   1. Verbatim text  -> Fail.         The model is reliable at reading text.
 *   2. Prefix casing  -> Needs Review. The model judges rendered type poorly.
 *   3. Prefix weight  -> Needs Review. Same.
 *
 * The asymmetry is deliberate and is about which errors we can afford. A false
 * Fail on a typographic observation sends a rejection to a compliant applicant
 * over a property the model is not good at assessing. A false Needs Review
 * costs an agent a two-second glance at artwork already on their screen. Those
 * are not comparable costs, so casing and weight are capped at Needs Review no
 * matter how confident the observation looks.
 *
 * This is a confidence assignment, not a threshold tuned to suppress a known
 * misread: a genuine typographic violation still reaches an agent, with the
 * reason string telling them exactly what to confirm by eye.
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

  // Assertion 1 — verbatim text. The only assertion that can Fail.
  const divergence = firstDivergence(
    GOVERNMENT_WARNING_NORMALIZED,
    normalizeWhitespace(observation.text),
  );

  // Assertions 2 and 3 — rendering. Capped at Needs Review; null means the
  // model could not tell, which routes here too rather than passing silently.
  const renderingNotes: string[] = [];

  if (observation.prefixIsAllCaps === false) {
    renderingNotes.push(
      `the model read "${WARNING_PREFIX}" as not being in all capital letters`,
    );
  } else if (observation.prefixIsAllCaps === null) {
    renderingNotes.push(
      `the model could not determine whether "${WARNING_PREFIX}" is in all capital letters`,
    );
  }

  if (observation.prefixAppearsBold === false) {
    renderingNotes.push(
      `the model read "${WARNING_PREFIX}" as not appearing bold`,
    );
  } else if (observation.prefixAppearsBold === null) {
    renderingNotes.push(
      `the model could not determine whether "${WARNING_PREFIX}" appears bold`,
    );
  }

  const size = observation.relativeFontSize;
  const undersized = size !== null && size < FONT_SIZE_REVIEW_BELOW;
  const sizeUncertain =
    size !== null && size >= FONT_SIZE_REVIEW_BELOW && size <= FONT_SIZE_PASS_ABOVE;

  // Each assertion contributes its own sentence, so a result that trips two of
  // them tells the agent about both.
  const parts: string[] = [];
  let verdict: Verdict = "pass";

  if (divergence) {
    verdict = "fail";
    parts.push(describeDivergence(divergence));
  }

  if (renderingNotes.length > 0) {
    if (verdict !== "fail") verdict = "needs_review";
    parts.push(
      `Confirm the rendering by eye: ${renderingNotes.join(", and ")}. ` +
        "Typographic judgments from the model are advisory and are never a rejection on their own.",
    );
  }

  if (undersized) {
    if (verdict !== "fail") verdict = "needs_review";
    parts.push(
      `The warning is set at roughly ${size?.toFixed(2)}x the size of surrounding label ` +
        `text, below the ${FONT_SIZE_REVIEW_BELOW}x mark. Undersized warnings are a known ` +
        "evasion — check it against the 27 CFR 16.22 type-size minimum for this container.",
    );
  } else if (sizeUncertain) {
    if (verdict !== "fail") verdict = "needs_review";
    parts.push(
      `The warning is set at roughly ${size?.toFixed(2)}x the size of surrounding label ` +
        `text, between the ${FONT_SIZE_REVIEW_BELOW}x and ${FONT_SIZE_PASS_ABOVE}x marks. ` +
        "This estimate carries about ±0.05 of error, which is too imprecise to call either " +
        "way — measure the type against the 27 CFR 16.22 minimum for this container.",
    );
  }

  if (verdict === "pass") {
    return {
      ...base,
      verdict,
      reason: "Text matches 27 CFR 16.21 verbatim; prefix is all caps and bold.",
    };
  }

  return { ...base, verdict, reason: parts.join(" ") };
}
