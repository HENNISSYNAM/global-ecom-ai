import { createHash } from "node:crypto";
import sharp from "sharp";

type Metadata = Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;

export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
export const MAX_PHOTOS_PER_PRODUCT = 8;
const MAX_EDGE = 2000;
const ACCEPTED = new Set(["jpeg", "png", "webp", "heif"]);

export type NormalizedImage = { data: Buffer; mimeType: "image/webp"; width: number; height: number; sha256: string };

export class ImageRejected extends Error {}

/**
 * Checks the real format from the bytes (not the file name or browser MIME type), applies the EXIF orientation,
 * downsizes to 2000 px and re-encodes as WebP. Re-encoding drops all metadata, including GPS location.
 */
export async function normalizeImage(input: Buffer): Promise<NormalizedImage> {
  if (input.length === 0 || input.length > MAX_UPLOAD_BYTES) throw new ImageRejected("Ảnh phải nhỏ hơn 12 MB");
  let meta: Metadata;
  try {
    meta = await sharp(input, { limitInputPixels: 60_000_000 }).metadata();
  } catch {
    throw new ImageRejected("Tệp không phải ảnh hợp lệ");
  }
  if (!meta.format || !ACCEPTED.has(meta.format)) throw new ImageRejected("Chỉ nhận ảnh JPG, PNG, WebP hoặc HEIC");
  if ((meta.width ?? 0) < 300 || (meta.height ?? 0) < 300) throw new ImageRejected("Ảnh quá nhỏ (cần tối thiểu 300×300)");

  let out: { data: Buffer; info: { width: number; height: number } };
  try {
    out = await sharp(input, { limitInputPixels: 60_000_000 })
      .rotate()
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 84 })
      .toBuffer({ resolveWithObject: true });
  } catch {
    throw new ImageRejected("Không đọc được ảnh này; hãy thử chụp lại hoặc xuất sang JPG");
  }
  return {
    data: out.data,
    mimeType: "image/webp",
    width: out.info.width,
    height: out.info.height,
    sha256: createHash("sha256").update(out.data).digest("hex"),
  };
}
