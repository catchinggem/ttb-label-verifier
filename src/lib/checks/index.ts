import type { LabelObservation } from "@/lib/observation";
import type { ApplicationData, VerificationResult, Verdict } from "@/lib/types";
import { checkApplicationFields } from "./fields";
import { checkGovernmentWarning } from "./warning";

export { checkGovernmentWarning, MIN_RELATIVE_FONT_SIZE } from "./warning";
export { checkApplicationFields, compareField, parseAbv } from "./fields";

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
): VerificationResult {
  const fields = [
    ...checkApplicationFields(observation, application),
    checkGovernmentWarning(observation.governmentWarning),
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
