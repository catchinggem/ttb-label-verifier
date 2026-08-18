/// <reference lib="webworker" />

/**
 * Off-main-thread image downscaling.
 *
 * Two things are being bought here. Moving the work off the main thread keeps
 * the UI responsive during it — but that alone does not make it finish sooner.
 * The actual saving is `createImageBitmap`'s resize options: given a target
 * size up front, the decoder produces the downscaled bitmap directly instead of
 * decoding every pixel at full resolution and then resampling. On a 3400x4500
 * photograph that is the difference between decoding 15.3M pixels and 2.4M.
 *
 * Using it requires knowing the source dimensions before decoding, which is why
 * the caller parses them out of the JPEG header.
 */

export interface ResizeRequest {
  blob: Blob;
  maxLongEdge: number;
  /** Source dimensions when known from the file header; enables resize-on-decode. */
  width?: number;
  height?: number;
  quality: number;
}

export interface ResizeResponse {
  blob: Blob;
  width: number;
  height: number;
}

self.onmessage = async (event: MessageEvent<ResizeRequest>) => {
  const { blob, maxLongEdge, width, height, quality } = event.data;

  try {
    let bitmap: ImageBitmap;

    if (width && height) {
      // Fast path: decode straight to the target size.
      const scale = maxLongEdge / Math.max(width, height);
      bitmap = await createImageBitmap(blob, {
        resizeWidth: Math.round(width * scale),
        resizeHeight: Math.round(height * scale),
        resizeQuality: "high",
      });
    } else {
      // Dimensions unknown: decode, then downscale from the decoded bitmap.
      const full = await createImageBitmap(blob);
      const scale = maxLongEdge / Math.max(full.width, full.height);
      if (scale >= 1) {
        bitmap = full;
      } else {
        bitmap = await createImageBitmap(full, {
          resizeWidth: Math.round(full.width * scale),
          resizeHeight: Math.round(full.height * scale),
          resizeQuality: "high",
        });
        full.close();
      }
    }

    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("no 2d context");

    // White ground: a transparent source flattened onto black would wreck the
    // contrast the model reads type weight from.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, bitmap.width, bitmap.height);
    context.drawImage(bitmap, 0, 0);

    const out = await canvas.convertToBlob({ type: "image/jpeg", quality });
    const response: ResizeResponse = { blob: out, width: bitmap.width, height: bitmap.height };
    bitmap.close();
    self.postMessage(response);
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
