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

export interface ResizedImage {
  file: File;
  originalBytes: number;
  resizedBytes: number;
  width: number;
  height: number;
  /** False when the original was already small enough to send as-is. */
  wasResized: boolean;
}

/**
 * Returns a JPEG no larger than MAX_LONG_EDGE on its long edge. Falls back to
 * the original file if the browser cannot decode it — an upload that might work
 * beats a hard failure on the client.
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

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return unchanged();
  }

  const { width, height } = bitmap;
  const longEdge = Math.max(width, height);

  if (longEdge <= MAX_LONG_EDGE) {
    bitmap.close();
    return unchanged(width, height);
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
    return unchanged(width, height);
  }

  // White ground: labels are usually light, and a transparent source flattened
  // onto black would wreck the contrast the model reads type weight from.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, targetWidth, targetHeight);
  context.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.92),
  );

  if (!blob) return unchanged(width, height);

  const renamed = file.name.replace(/\.[^.]+$/, "") + ".jpg";
  return {
    file: new File([blob], renamed, { type: "image/jpeg" }),
    originalBytes,
    resizedBytes: blob.size,
    width: targetWidth,
    height: targetHeight,
    wasResized: true,
  };
}

/** Human-readable byte count for the UI. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
