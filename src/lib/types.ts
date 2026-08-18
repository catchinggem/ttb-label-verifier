/** Outcome of a single field check. */
export type Verdict = "pass" | "fail" | "needs_review";

export type FieldId =
  | "brandName"
  | "classType"
  | "alcoholContent"
  | "netContents"
  | "governmentWarning";

/**
 * What the agent filed in the COLA application. Every field is optional: an
 * application that omits a field means "nothing to compare against", which is a
 * different outcome from a mismatch.
 */
export interface ApplicationData {
  brandName?: string;
  classType?: string;
  alcoholContent?: string;
  netContents?: string;
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
}
