import { z } from "zod";

/**
 * The vision model's job is to OBSERVE and REPORT, never to judge.
 *
 * Every field here is a fact about what is rendered on the label — text, casing,
 * weight, relative size. No field is a pass/fail. All verdicts are computed
 * deterministically in TypeScript from this structure (see lib/checks), which
 * keeps compliance decisions auditable and testable without a model in the loop.
 *
 * FIELD DOCS MUST USE .describe(), NOT COMMENTS. Only `.describe()` text is
 * compiled into the JSON schema the model actually receives; a `/** *\/` comment
 * is invisible to it. An earlier version of this file documented every field in
 * comments alone, and the model — working from the system prompt only —
 * transcribed the warning without its "GOVERNMENT WARNING:" prefix on every
 * single run. Keep human-facing rationale in comments; put anything the model
 * needs to obey in .describe().
 */

const TextObservation = z.object({
  text: z
    .string()
    .nullable()
    .describe(
      "The text exactly as printed on the label, preserving its original " +
        "capitalization, punctuation, and spacing. Null if this does not appear on the label.",
    ),
  confidence: z
    .number()
    .describe("How confident you are that you read this field correctly, from 0 to 1."),
});

const WarningObservation = z.object({
  present: z
    .boolean()
    .describe("Whether any government health warning statement appears on the label at all."),
  text: z
    .string()
    .nullable()
    .describe(
      "The COMPLETE government warning statement, transcribed verbatim. This must " +
        'START WITH THE WORDS "GOVERNMENT WARNING:" and run through both numbered ' +
        "clauses to the end. The prefix is part of the statement being checked — do " +
        "not omit it, and do not start the transcription at clause (1). Reproduce any " +
        "misspelling or altered wording exactly as printed rather than correcting it. " +
        "Null only if no warning appears on the label.",
    ),
  prefixIsAllCaps: z
    .boolean()
    .nullable()
    .describe(
      'Whether every letter of the "GOVERNMENT WARNING:" prefix is a capital, read ' +
        "from the letterforms themselves. Null if the rendering is too small, blurred, " +
        "or low-contrast to tell.",
    ),
  prefixAppearsBold: z
    .boolean()
    .nullable()
    .describe(
      'Whether the "GOVERNMENT WARNING:" prefix is rendered in a heavier weight than ' +
        "the warning body text immediately following it. Compare the two directly: if " +
        "the strokes are the same thickness, it is not bold. Null if the rendering is " +
        "too small, blurred, or low-contrast to make that comparison confidently.",
    ),
  relativeFontSize: z
    .number()
    .nullable()
    .describe(
      "Height of the warning's type divided by the height of the median body text " +
        "elsewhere on the label. 1.0 means the same size; 0.4 means noticeably smaller.",
    ),
  confidence: z
    .number()
    .describe("How confident you are in the warning transcription above, from 0 to 1."),
});

export const LabelObservationSchema = z.object({
  beverageType: z
    .enum(["distilled_spirits", "wine", "malt_beverage", "unknown"])
    .describe("The beverage category the label indicates. Use unknown if it is not clear."),
  brandName: TextObservation.describe("The brand name."),
  classType: TextObservation.describe(
    'The class or type designation, e.g. "Kentucky Straight Bourbon Whiskey".',
  ),
  alcoholContent: TextObservation.describe(
    'The alcohol content statement as printed, e.g. "45% Alc./Vol. (90 Proof)".',
  ),
  netContents: TextObservation.describe('The net contents, e.g. "750 mL".'),
  bottlerName: TextObservation.describe(
    "The name and address of the bottler, producer, or importer, as printed.",
  ),
  countryOfOrigin: TextObservation.describe(
    'The country of origin statement, as printed — for example "PRODUCT OF ' +
      'SCOTLAND" or "IMPORTED FROM FRANCE". Null if the label carries no such ' +
      "statement. Do not infer a country from the brand name, the language on " +
      "the label, or the class designation; report only an explicit statement.",
  ),
  governmentWarning: WarningObservation.describe(
    "The government health warning statement required by 27 CFR 16.21.",
  ),
  imageQuality: z
    .object({
      legible: z
        .boolean()
        .describe("Whether you could read the label confidently overall."),
      issues: z
        .array(z.string())
        .describe(
          'Short phrases naming anything that limited your read, e.g. "glare on lower ' +
            'third", "photographed at an angle". Empty if the image was clean.',
        ),
    })
    .describe("Your assessment of how readable this image was."),
});

export type LabelObservation = z.infer<typeof LabelObservationSchema>;
export type WarningObservationData = LabelObservation["governmentWarning"];
