import type { LabelObservation } from "./observation";

/** Outcome of a single field check. */
export type Verdict = "pass" | "fail" | "needs_review";

export type FieldId =
  | "brandName"
  | "classType"
  | "alcoholContent"
  | "netContents"
  | "bottlerName"
  | "governmentWarning";

/**
 * Selects the ABV tolerance bracket. Sourced from the application rather than
 * inferred from the label — see lib/checks/abv.ts.
 */
export type BeverageType = "wine" | "distilled_spirits" | "malt_beverage";

/**
 * What the agent filed in the COLA application. Every field is optional: an
 * application that omits a field means "nothing to compare against", which is a
 * different outcome from a mismatch.
 */
export interface ApplicationData {
  /** Required to select an ABV tolerance bracket; without it that check holds for review. */
  beverageType?: BeverageType;
  brandName?: string;
  classType?: string;
  alcoholContent?: string;
  netContents?: string;
  bottlerName?: string;
}

export interface FieldResult {
  field: FieldId;
  /** Human label for the UI, e.g. "Government Warning". */
  title: string;
  verdict: Verdict;
  /** What the vision model read off the label. */
  observed: string | null;
  /** What the application claims, where applicable. */
  expected: string | null;
  /**
   * Why this verdict. On a failure this names the specific assertion that
   * failed, so an agent never has to guess which of the three warning checks
   * tripped.
   */
  reason: string;
}

export interface VerificationResult {
  verdict: Verdict;
  fields: FieldResult[];
  /** Wall-clock time of the model call plus checks, in ms. */
  elapsedMs: number;
  /** Set when the image itself was the problem (glare, angle, resolution). */
  imageQualityNote: string | null;
  /** Which model produced these observations — surfaced in the UI per result. */
  model: string;
  /** True when the default tier was incomplete or unsure and a stronger model ran. */
  escalated: boolean;
  /** Per-model-call timing and escalation reasons, oldest first. */
  attempts: ExtractionAttemptSummary[];
  /**
   * The raw structured observation the verdicts were computed from. Exposed so
   * the UI can show what was read off the label, and so typographic misreads
   * can be diagnosed without re-running extraction.
   */
  observation: LabelObservation;
}

export interface ExtractionAttemptSummary {
  model: string;
  latencyMs: number;
  /** Why this attempt was not accepted; null when it was. */
  escalationReason: string | null;
}

/**
 * What the deterministic checks alone produce. Model provenance is layered on
 * by the caller that actually ran the extraction, which keeps verifyLabel pure.
 */
export type CheckOutcome = Omit<
  VerificationResult,
  "model" | "escalated" | "attempts" | "observation"
>;
