import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { LabelObservationSchema, type LabelObservation } from "./observation";

/**
 * Claude Opus 5 with high-resolution vision (2576px long edge) — it reads type
 * weight and relative size off label artwork without a scale factor, which is
 * what the typographic assertions in lib/checks/warning.ts need.
 *
 * Effort is `low` because of the 5-second budget the Compliance Division set
 * after the scanning-vendor pilot. Extraction is a perception task, not a
 * reasoning one; raise this if field accuracy proves short, and measure the
 * latency cost when you do.
 */
export const MODEL = "claude-opus-5";
export const EFFORT = "low" as const;

/** Formats Claude's vision API accepts. */
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
prefix separately from its text: whether it is set in all capitals, whether it
appears bold against the body of the warning, and how its type size compares to
the median body text elsewhere on the label. Use null for any of these you
cannot determine from the image — that is more useful than a guess.

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

/**
 * Send one label image to the vision model and return its structured
 * observations. Throws on API failure; the caller maps that to a response.
 */
export async function extractLabelObservation(
  image: LabelImage,
): Promise<LabelObservation> {
  const response = await getClient().messages.parse({
    model: MODEL,
    // Generous enough for the structured output plus adaptive thinking, which
    // is on by default on Opus 5. Non-streaming, so kept under the SDK timeout.
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    output_config: {
      effort: EFFORT,
      format: zodOutputFormat(LabelObservationSchema),
    },
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
      `Could not read structured observations from the model (stop_reason: ${response.stop_reason}).`,
    );
  }

  return response.parsed_output;
}
