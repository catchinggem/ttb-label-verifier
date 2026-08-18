import { readJpegDimensions } from "./jpeg";
import type { ResizeRequest, ResizeResponse } from "./resize.worker";

/**
 * Client-side downscaling before upload.
 *
 * A phone photo of a bottle runs 2-5 MB; the model does not read a label any
 * better at 4000px than at 1568px, and every byte is time on a federal network.
 * Resizing here rather than server-side is the single largest latency win
 * available, because it happens before the upload rather than after it.
 *
 * 1568px matches the long edge Claude's vision pipeline works to, so this
 * discards data that would be discarded anyway.
 */
export const MAX_LONG_EDGE = 1568;

/** Below this, re-encoding costs more than it saves. */
const SKIP_BELOW_BYTES = 400 * 1024;

/**
 * A JPEG already within the long-edge cap is left completely alone, whatever
 * its byte size — `readJpegDimensions` detects that case from the header.
 * Re-encoding it would spend decode and encode time to produce a file the model
 * treats identically; the only gain would be a smaller upload, and a JPEG is
 * already compressed.
 */
const QUALITY = 0.92;

export interface ResizedImage {
  file: File;
  originalBytes: number;
  resizedBytes: number;
  width: number;
  height: number;
  /** False when the original was already small enough to send as-is. */
  wasResized: boolean;
}

let worker: Worker | null = null;
let workerBroken = false;

/** One worker for the page; a batch run reuses it across every image. */
function getWorker(): Worker | null {
  if (workerBroken) return null;
  if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") return null;
  try {
    worker ??= new Worker(new URL("./resize.worker.ts", import.meta.url));
    return worker;
  } catch {
    workerBroken = true;
    return null;
  }
}

function resizeInWorker(
  instance: Worker,
  request: ResizeRequest,
): Promise<ResizeResponse> {
  return new Promise((resolve, reject) => {
    const onMessage = (event: MessageEvent<ResizeResponse | { error: string }>) => {
      cleanup();
      if ("error" in event.data) reject(new Error(event.data.error));
      else resolve(event.data);
    };
    const onError = (event: ErrorEvent) => {
      cleanup();
      reject(new Error(event.message || "resize worker failed"));
    };
    function cleanup() {
      instance.removeEventListener("message", onMessage as EventListener);
      instance.removeEventListener("error", onError);
    }
    instance.addEventListener("message", onMessage as EventListener);
    instance.addEventListener("error", onError);
    instance.postMessage(request);
  });
}

/** The original main-thread path, kept as a fallback. */
async function resizeOnMainThread(
  file: File,
  originalBytes: number,
): Promise<ResizedImage | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return null;
  }

  const { width, height } = bitmap;
  const longEdge = Math.max(width, height);
  if (longEdge <= MAX_LONG_EDGE) {
    bitmap.close();
    return { file, originalBytes, resizedBytes: originalBytes, width, height, wasResized: false };
  }

  const scale = MAX_LONG_EDGE / longEdge;
  const targetWidth = Math.round(width * scale);
  const targetHeight = Math.round(height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    return null;
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, targetWidth, targetHeight);
  context.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", QUALITY),
  );
  if (!blob) return null;

  return {
    file: new File([blob], renameToJpg(file.name), { type: "image/jpeg" }),
    originalBytes,
    resizedBytes: blob.size,
    width: targetWidth,
    height: targetHeight,
    wasResized: true,
  };
}

function renameToJpg(name: string): string {
  return name.replace(/\.[^.]+$/, "") + ".jpg";
}

/**
 * Returns an image no larger than MAX_LONG_EDGE on its long edge.
 *
 * Order of preference:
 *   1. Send it as-is — small file, or a JPEG already within the cap.
 *   2. Resize in a worker, decoding straight to the target size when the
 *      JPEG header gives us the dimensions.
 *   3. Fall back to the main thread if workers or OffscreenCanvas are missing.
 *
 * An upload that might work always beats a hard failure on the client, so every
 * failure path returns the original file rather than throwing.
 */
export async function resizeForUpload(file: File): Promise<ResizedImage> {
  const originalBytes = file.size;
  const unchanged = (width = 0, height = 0): ResizedImage => ({
    file,
    originalBytes,
    resizedBytes: originalBytes,
    width,
    height,
    wasResized: false,
  });

  if (file.size < SKIP_BELOW_BYTES) return unchanged();

  // Cheap header read: also tells us whether the file is already small enough.
  const header = await readJpegDimensions(file);
  if (header && Math.max(header.width, header.height) <= MAX_LONG_EDGE) {
    // Already within the cap and already JPEG — nothing to gain by re-encoding.
    return unchanged(header.width, header.height);
  }

  const instance = getWorker();
  if (instance) {
    try {
      const result = await resizeInWorker(instance, {
        blob: file,
        maxLongEdge: MAX_LONG_EDGE,
        width: header?.width,
        height: header?.height,
        quality: QUALITY,
      });
      return {
        file: new File([result.blob], renameToJpg(file.name), { type: "image/jpeg" }),
        originalBytes,
        resizedBytes: result.blob.size,
        width: result.width,
        height: result.height,
        wasResized: true,
      };
    } catch {
      // Fall through to the main thread rather than failing the upload.
      workerBroken = true;
    }
  }

  return (await resizeOnMainThread(file, originalBytes)) ?? unchanged();
}

/** Human-readable byte count for the UI. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
