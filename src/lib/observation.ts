import { z } from "zod";

/**
 * The vision model's job is to OBSERVE and REPORT, never to judge.
 *
 * Every field here is a fact about what is rendered on the label — text, casing,
 * weight, relative size. No field is a pass/fail. All verdicts are computed
 * deterministically in TypeScript from this structure (see lib/checks), which
 * keeps compliance decisions auditable and testable without a model in the loop.
 */

const TextObservation = z.object({
  /** Verbatim text as printed, or null if absent from the label. */
  text: z.string().nullable(),
  /** Model's confidence that it read this correctly, 0-1. */
  confidence: z.number(),
});

const WarningObservation = z.object({
  /** Whether any government warning statement appears at all. */
  present: z.boolean(),
  /**
   * The full warning statement, transcribed verbatim including the
   * "GOVERNMENT WARNING:" prefix. Line breaks as they appear on the label —
   * normalization happens downstream, not here.
   */
  text: z.string().nullable(),
  /**
   * Is the "GOVERNMENT WARNING:" prefix rendered in all capital letters?
   * Reports casing as rendered, independent of the transcription above.
   */
  prefixIsAllCaps: z.boolean().nullable(),
  /** Does the "GOVERNMENT WARNING:" prefix appear bold relative to the body? */
  prefixAppearsBold: z.boolean().nullable(),
  /**
   * Height of the warning's type relative to the median body text elsewhere on
   * the label. 1.0 means the same size; 0.4 means noticeably smaller. Feeds the
   * legibility signal — undersized warnings are a known evasion.
   */
  relativeFontSize: z.number().nullable(),
  /** Confidence in the transcription above, 0-1. Feeds the escalation gate. */
  confidence: z.number(),
});

export const LabelObservationSchema = z.object({
  beverageType: z.enum(["distilled_spirits", "wine", "malt_beverage", "unknown"]),
  brandName: TextObservation,
  classType: TextObservation,
  alcoholContent: TextObservation,
  netContents: TextObservation,
  /** Name and address of the bottler or producer (27 CFR 4.35 / 5.66 / 7.66). */
  bottlerName: TextObservation,
  governmentWarning: WarningObservation,
  imageQuality: z.object({
    /** False when glare, angle, or resolution prevented a confident read. */
    legible: z.boolean(),
    /** Short phrases, e.g. "glare on lower third", "photographed at an angle". */
    issues: z.array(z.string()),
  }),
});

export type LabelObservation = z.infer<typeof LabelObservationSchema>;
export type WarningObservationData = LabelObservation["governmentWarning"];
