import type { LabelObservation } from "@/lib/observation";
import type {
  ApplicationData,
  CheckOutcome,
  Verdict,
  WarningReadingDisagreement,
} from "@/lib/types";
import type { FieldResult } from "@/lib/types";
import { checkApplicationFields } from "./fields";
import { checkGovernmentWarning } from "./warning";

export {
  checkGovernmentWarning,
  FONT_SIZE_PASS_ABOVE,
  FONT_SIZE_REVIEW_BELOW,
} from "./warning";
export { checkApplicationFields, checkCountryOfOrigin, compareTextField } from "./fields";
export { checkAlcoholContent, parseAbv, toleranceFor } from "./abv";

/**
 * When two models transcribed the warning differently, neither reading is
 * authoritative. Report both and hand the decision to an agent rather than
 * quietly taking the escalation model's word for it.
 */
function applyDisagreement(
  result: FieldResult,
  disagreement: WarningReadingDisagreement | null,
): FieldResult {
  if (!disagreement) return result;
  const quote = (text: string | null) => (text === null ? "(no warning found)" : `"${text}"`);
  return {
    ...result,
    verdict: "needs_review",
    reason:
      "Two models read this warning differently, so neither reading is being " +
      `treated as authoritative. ${disagreement.defaultModel} read ` +
      `${quote(disagreement.defaultText)}. ${disagreement.escalationModel} read ` +
      `${quote(disagreement.escalationText)}. Compare both against the label.`,
  };
}

/** Any fail sinks the whole result; any review holds it. */
function rollUp(verdicts: Verdict[]): Verdict {
  if (verdicts.includes("fail")) return "fail";
  if (verdicts.includes("needs_review")) return "needs_review";
  return "pass";
}

/**
 * Turn one set of model observations into a verdict.
 *
 * Pure and synchronous: no model call, no I/O. Every compliance decision the
 * app makes is reachable from here with a hand-written observation object,
 * which is what makes the checks testable.
 */
export function verifyLabel(
  observation: LabelObservation,
  application: ApplicationData,
  elapsedMs: number,
  warningDisagreement: WarningReadingDisagreement | null = null,
): CheckOutcome {
  const fields = [
    ...checkApplicationFields(observation, application),
    applyDisagreement(
      checkGovernmentWarning(observation.governmentWarning),
      warningDisagreement,
    ),
  ];

  const { legible, issues } = observation.imageQuality;
  const imageQualityNote =
    !legible && issues.length > 0
      ? `Image quality may have affected this read: ${issues.join("; ")}.`
      : null;

  // An illegible image can't produce a clean pass, however the fields land.
  const verdict = legible
    ? rollUp(fields.map((f) => f.verdict))
    : rollUp([...fields.map((f) => f.verdict), "needs_review"]);

  return { verdict, fields, elapsedMs, imageQualityNote };
}
