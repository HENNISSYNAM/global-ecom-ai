import { getSql } from "@/lib/db";
import { defaultStorage } from "@/modules/media/storage";
import { readPrivatePhoto } from "@/modules/seller/photos";
import { errorResponse, json, requireSeller, UUID_RE } from "../../_lib/respond";

/** Private photo for the console. RLS decides; the response is never cached by shared caches. */
export async function GET(_request: Request, { params }: { params: Promise<{ assetId: string }> }) {
  const { actor, response } = await requireSeller();
  if (!actor) return response;
  const { assetId } = await params;
  if (!UUID_RE.test(assetId)) return json({ error: "Không tìm thấy ảnh" }, 404);
  try {
    const photo = await readPrivatePhoto(getSql(), actor, defaultStorage(), assetId);
    return new Response(new Uint8Array(photo.data), {
      headers: { "Content-Type": photo.mimeType, "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff" },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
