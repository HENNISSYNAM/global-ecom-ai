import { randomUUID } from "node:crypto";
import { withActor, type Actor, type Sql } from "@/lib/db";
import { DomainError, fromPgError } from "@/lib/errors";
import { MAX_PHOTOS_PER_PRODUCT, normalizeImage, ImageRejected, type NormalizedImage } from "@/modules/media/images";
import type { ObjectStorage } from "@/modules/media/storage";

export type UploadedPhoto = { id: string; width: number; height: number };

/**
 * Stores 1–8 photos of one product privately and queues the AI analysis.
 *
 * The tenant id comes from the console URL, but it only names which shop to write to: the asset insert runs as the
 * signed-in user, so RLS accepts it only for owners/editors of that tenant. The object is written inside the same
 * transaction; if storage fails, no asset row is left behind.
 */
export async function uploadProductPhotos(
  sql: Sql,
  actor: Actor,
  storage: ObjectStorage,
  input: { tenantId: string; files: Buffer[]; sellerNote?: string | null },
): Promise<{ photos: UploadedPhoto[]; jobId: string }> {
  if (actor.role !== "authenticated") throw new DomainError("forbidden", "Cần đăng nhập");
  if (input.files.length < 1 || input.files.length > MAX_PHOTOS_PER_PRODUCT)
    throw new DomainError("invalid", `Gửi từ 1 đến ${MAX_PHOTOS_PER_PRODUCT} ảnh cho một sản phẩm`);

  let images: NormalizedImage[];
  try {
    images = await Promise.all(input.files.map((f) => normalizeImage(f)));
  } catch (err) {
    if (err instanceof ImageRejected) throw new DomainError("invalid", err.message);
    throw err;
  }

  try {
    return await withActor(sql, actor, async (tx) => {
      const photos: UploadedPhoto[] = [];
      for (const img of images) {
        const id = randomUUID();
        const key = `${input.tenantId}/uploads/${id}.webp`;
        await tx`
          insert into public.assets (id, tenant_id, kind, bucket, object_key, mime_type, byte_size, sha256, width, height, uploaded_by)
          values (${id}, ${input.tenantId}, 'product_image', 'tenant-private', ${key}, ${img.mimeType}, ${img.data.length},
                  ${img.sha256}, ${img.width}, ${img.height}, ${actor.userId})
        `;
        await storage.put("tenant-private", key, img.data, img.mimeType);
        photos.push({ id, width: img.width, height: img.height });
      }
      const note = input.sellerNote?.trim().slice(0, 500) || null;
      const [row] = await tx<{ id: string }[]>`
        select public.enqueue_product_analysis(${photos.map((p) => p.id)}::uuid[], ${note}) as id
      `;
      return { photos, jobId: row!.id };
    });
  } catch (err) {
    throw fromPgError(err) ?? err;
  }
}

/** Reads a private photo for the console after RLS confirms the user is a member of its tenant. */
export async function readPrivatePhoto(
  sql: Sql,
  actor: Actor,
  storage: ObjectStorage,
  assetId: string,
): Promise<{ data: Buffer; mimeType: string }> {
  const rows = await withActor(sql, actor, (tx) => tx<{ bucket: string; object_key: string; mime_type: string }[]>`
    select bucket, object_key, mime_type from public.assets where id = ${assetId}
  `);
  const a = rows[0];
  if (!a) throw new DomainError("not_found", "Không tìm thấy ảnh");
  return { data: await storage.get(a.bucket as "tenant-private", a.object_key), mimeType: a.mime_type };
}
