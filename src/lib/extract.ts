import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { LabelObservationSchema, type LabelObservation } from "./observation";

/**
 * Two-tier cascade.
 *
 * Reading printed text off artwork is perception, not reasoning, so the default
 * is the cheapest fast model. Escalation buys a second opinion only for the
 * images that need it — a peak-season drop of 300 labels pays Haiku prices for
 * the clean ones and Sonnet prices for the handful that are genuinely hard.
 */
export const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
export const ESCALATION_MODEL = "claude-sonnet-5";

/** Escalate when the model's own confidence in any field falls below this. */
export const CONFIDENCE_FLOOR = 0.7;

/**
 * A null here means the default model could not find the field at all, which is
 * the other escalation trigger. These are the fields TTB requires on
 * essentially every label; alcohol content has carve-outs for some wine and malt
 * beverages (27 CFR 4.36(a), 7.65(a)), but a null is still worth a second look
 * before an agent sees it.
 */
const REQUIRED_TEXT_FIELDS = [
  "brandName",
  "classType",
  "alcoholContent",
  "netContents",
  "bottlerName",
] as const;

export const SUPPORTED_MEDIA_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

export type SupportedMediaType = (typeof SUPPORTED_MEDIA_TYPES)[number];

export function isSupportedMediaType(value: string): value is SupportedMediaType {
  return (SUPPORTED_MEDIA_TYPES as readonly string[]).includes(value);
}

const SYSTEM_PROMPT = `You read alcohol beverage labels for the TTB and report what is printed on them.

You are an observer, not a reviewer. Report what the label shows; a separate
system decides whether it complies. Do not judge, approve, or reject.

Transcribe text exactly as printed — original capitalization, punctuation, and
spacing. Do not correct spelling, expand abbreviations, or tidy up the
government warning to match what you know it should say. A label that misquotes
the warning must be reported with its misquote intact, because catching that
difference is the point.

Report a field as null when it does not appear on the label, rather than
inferring it from the beverage type or brand.

For the government warning, report the rendering of the "GOVERNMENT WARNING:"
prefix separately from its text.

Judge weight by comparison, not in isolation. Small type often looks light on
its own; what matters is whether the prefix's strokes are visibly heavier than
the words immediately following it in the same line of warning text. Compare
those two directly. If the prefix and the body text that follows have strokes of
the same thickness, the prefix is not bold.

Judge casing the same way — whether every letter in the prefix is a capital,
read from the letterforms rather than inferred from the words.

Return null for prefixIsAllCaps or prefixAppearsBold whenever the warning is
rendered too small, too blurred, or too low-contrast for you to make that
comparison confidently. Null is the correct answer for an unreadable rendering
and routes the label to a human. A guess does not.

Also report how the warning's type size compares to the median body text
elsewhere on the label.

Set each confidence to how sure you are that you read that field correctly. A
low confidence routes the image to a stronger model, so report uncertainty
honestly rather than rounding up.

Labels are often photographed at an angle, under poor lighting, or with glare on
the bottle. Read through those conditions where you can, and say so in
imageQuality when they limited what you could make out.`;

let client: Anthropic | null = null;

function getClient(): Anthropic {
  // Lazily constructed so importing this module doesn't require a key —
  // the checks in lib/checks are testable without one.
  client ??= new Anthropic();
  return client;
}

export interface LabelImage {
  data: string; // base64, no data: prefix
  mediaType: SupportedMediaType;
}

export interface ExtractionAttempt {
  model: string;
  latencyMs: number;
  /** Why this attempt was not accepted; null when it was. */
  escalationReason: string | null;
}

export interface ExtractionResult {
  observation: LabelObservation;
  /** The model whose observations are in `observation`. */
  model: string;
  /** Total wall clock across every attempt, not just the accepted one. */
  latencyMs: number;
  escalated: boolean;
  /** Per-attempt detail, oldest first. Drives the latency measurements. */
  attempts: ExtractionAttempt[];
}

/**
 * Decide whether a default-tier result needs a stronger model.
 * Returns the reason to escalate, or null to accept as-is.
 */
export function escalationReason(observation: LabelObservation): string | null {
  const reasons: string[] = [];

  const missing = REQUIRED_TEXT_FIELDS.filter(
    (field) => observation[field].text === null,
  );
  if (missing.length > 0) {
    reasons.push(`no value read for ${missing.join(", ")}`);
  }

  if (observation.governmentWarning.text === null) {
    reasons.push("no government warning text read");
  }

  const lowConfidence = [...REQUIRED_TEXT_FIELDS, "governmentWarning" as const]
    .filter((field) => observation[field].confidence < CONFIDENCE_FLOOR)
    .map((field) => `${field} (${observation[field].confidence.toFixed(2)})`);
  if (lowConfidence.length > 0) {
    reasons.push(`confidence below ${CONFIDENCE_FLOOR} on ${lowConfidence.join(", ")}`);
  }

  return reasons.length > 0 ? reasons.join("; ") : null;
}

async function observe(
  image: LabelImage,
  model: string,
): Promise<LabelObservation> {
  const response = await getClient().messages.parse({
    model,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    output_config: { format: zodOutputFormat(LabelObservationSchema) },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: image.mediaType,
              data: image.data,
            },
          },
          {
            type: "text",
            text: "Report what this label shows, following the schema.",
          },
        ],
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("The model declined to process this image.");
  }

  if (!response.parsed_output) {
    throw new Error(
      `Could not read structured observations from ${model} (stop_reason: ${response.stop_reason}).`,
    );
  }

  return response.parsed_output;
}

/**
 * Observe one label, escalating to a stronger model when the default tier
 * comes back incomplete or unsure.
 */
export async function extractLabelObservation(
  image: LabelImage,
): Promise<ExtractionResult> {
  const attempts: ExtractionAttempt[] = [];

  const firstStart = performance.now();
  const first = await observe(image, DEFAULT_MODEL);
  const firstLatency = Math.round(performance.now() - firstStart);

  const reason = escalationReason(first);
  attempts.push({
    model: DEFAULT_MODEL,
    latencyMs: firstLatency,
    escalationReason: reason,
  });

  if (reason === null) {
    return {
      observation: first,
      model: DEFAULT_MODEL,
      latencyMs: firstLatency,
      escalated: false,
      attempts,
    };
  }

  const secondStart = performance.now();
  const second = await observe(image, ESCALATION_MODEL);
  attempts.push({
    model: ESCALATION_MODEL,
    latencyMs: Math.round(performance.now() - secondStart),
    escalationReason: null,
  });

  return {
    observation: second,
    model: ESCALATION_MODEL,
    latencyMs: attempts.reduce((total, a) => total + a.latencyMs, 0),
    escalated: true,
    attempts,
  };
}
