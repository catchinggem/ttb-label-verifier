/**
 * Read a JPEG's pixel dimensions from its header, without decoding it.
 *
 * `createImageBitmap`'s resize options only help if the target size is known
 * before decoding — and the obvious ways to learn the size (decoding, or
 * loading into an <img>) are the very cost being avoided. The dimensions live
 * in the SOF (Start Of Frame) marker a few hundred bytes in, so a short scan
 * over the head of the file answers it.
 *
 * Returns null for anything not a JPEG, or a JPEG whose SOF is not found in the
 * scanned prefix. Callers fall back to decoding.
 */
export async function readJpegDimensions(
  blob: Blob,
  scanBytes = 256 * 1024,
): Promise<{ width: number; height: number } | null> {
  if (!/^image\/jpe?g$/i.test(blob.type)) return null;

  const view = new DataView(await blob.slice(0, scanBytes).arrayBuffer());
  if (view.byteLength < 4) return null;
  if (view.getUint16(0) !== 0xffd8) return null; // not SOI

  let offset = 2;
  while (offset + 4 < view.byteLength) {
    if (view.getUint8(offset) !== 0xff) {
      offset++; // resynchronize on padding
      continue;
    }

    const marker = view.getUint8(offset + 1);

    // Standalone markers carry no length payload.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    // Start of scan — pixel data begins; SOF should already have been seen.
    if (marker === 0xda) return null;

    const length = view.getUint16(offset + 2);
    if (length < 2) return null;

    // SOF0-SOF15, excluding DHT (c4), JPG (c8) and DAC (cc), which are not frames.
    const isFrame =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

    if (isFrame) {
      if (offset + 9 > view.byteLength) return null;
      return {
        height: view.getUint16(offset + 5),
        width: view.getUint16(offset + 7),
      };
    }

    offset += 2 + length;
  }

  return null;
}
