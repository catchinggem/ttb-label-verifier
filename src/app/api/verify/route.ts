import { verifyLabel } from "@/lib/checks";
import {
  extractLabelObservation,
  isSupportedMediaType,
  SUPPORTED_MEDIA_TYPES,
} from "@/lib/extract";
import type { ApplicationData, VerificationResult } from "@/lib/types";

/** 10 MB — comfortably above a phone photo, below Claude's 32 MB request cap. */
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

function badRequest(message: string) {
  return Response.json({ error: message }, { status: 400 });
}

/**
 * Verify one label image against the fields declared in its application.
 *
 * multipart/form-data:
 *   image        — the label artwork (required)
 *   application  — JSON object of declared fields (optional)
 *
 * Batch upload is handled client-side by calling this per label, so one bad
 * image in a 300-label drop fails alone instead of sinking the batch.
 */
export async function POST(request: Request): Promise<Response> {
  const startedAt = performance.now();

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return badRequest("Expected a multipart/form-data upload.");
  }

  const image = form.get("image");
  if (!(image instanceof File)) {
    return badRequest("No image was uploaded.");
  }

  if (!isSupportedMediaType(image.type)) {
    return badRequest(
      `Unsupported image type "${image.type || "unknown"}". Supported: ${SUPPORTED_MEDIA_TYPES.join(", ")}.`,
    );
  }

  if (image.size > MAX_IMAGE_BYTES) {
    return badRequest(
      `Image is ${(image.size / 1024 / 1024).toFixed(1)} MB; the limit is ${MAX_IMAGE_BYTES / 1024 / 1024} MB.`,
    );
  }

  let application: ApplicationData = {};
  const applicationField = form.get("application");
  if (typeof applicationField === "string" && applicationField.trim() !== "") {
    try {
      application = JSON.parse(applicationField) as ApplicationData;
    } catch {
      return badRequest("The application field is not valid JSON.");
    }
  }

  const data = Buffer.from(await image.arrayBuffer()).toString("base64");

  try {
    const extraction = await extractLabelObservation({
      data,
      mediaType: image.type,
    });

    const result: VerificationResult = {
      ...verifyLabel(
        extraction.observation,
        application,
        Math.round(performance.now() - startedAt),
      ),
      model: extraction.model,
      escalated: extraction.escalated,
      attempts: extraction.attempts,
      observation: extraction.observation,
    };

    return Response.json(result);
  } catch (error) {
    // The message is surfaced to an agent, so it needs to say what to do next.
    const message =
      error instanceof Error ? error.message : "Label verification failed.";
    return Response.json({ error: message }, { status: 502 });
  }
}
