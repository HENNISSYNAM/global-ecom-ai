/**
 * Downsizes a photo in the browser before upload (serverless request bodies are limited to a few MB).
 * The server still re-encodes and strips metadata; this only reduces transfer size. Formats the browser cannot
 * decode (e.g. HEIC outside Safari) are sent unchanged.
 */
export async function shrinkPhoto(file: File, maxEdge = 1600, quality = 0.82): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}
