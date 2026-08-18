import { resizeForUpload, type ResizedImage } from "./image";
import type { ApplicationData, VerificationResult } from "./types";

export interface VerifyOutcome {
  result: VerificationResult;
  image: ResizedImage;
}

/**
 * Resize, upload, verify. Shared by the single-label and batch screens so both
 * benefit from the same downscaling and the same error messages.
 */
export async function verifyImage(
  file: File,
  application: ApplicationData,
  signal?: AbortSignal,
): Promise<VerifyOutcome> {
  const image = await resizeForUpload(file);

  const form = new FormData();
  form.set("image", image.file);
  form.set("application", JSON.stringify(application));

  const response = await fetch("/api/verify", { method: "POST", body: form, signal });

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error(`The server returned an unreadable response (HTTP ${response.status}).`);
  }

  if (!response.ok) {
    const message =
      typeof body === "object" && body !== null && "error" in body
        ? String((body as { error: unknown }).error)
        : `Verification failed (HTTP ${response.status}).`;
    throw new Error(message);
  }

  return { result: body as VerificationResult, image };
}
