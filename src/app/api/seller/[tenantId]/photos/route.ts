import { after } from "next/server";
import { getSql } from "@/lib/db";
import { defaultStorage } from "@/modules/media/storage";
import { MAX_PHOTOS_PER_PRODUCT } from "@/modules/media/images";
import { uploadProductPhotos } from "@/modules/seller/photos";
import { drainAiJobs } from "@/modules/seller/runtime";
import { errorResponse, json, requireSeller, UUID_RE } from "../../_lib/respond";

export const maxDuration = 120;

export async function POST(request: Request, { params }: { params: Promise<{ tenantId: string }> }) {
  const { actor, response } = await requireSeller();
  if (!actor) return response;
  const { tenantId } = await params;
  if (!UUID_RE.test(tenantId)) return json({ error: "Không tìm thấy cửa hàng" }, 404);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "Dữ liệu tải lên không hợp lệ" }, 400);
  }
  const files = form.getAll("photos").filter((f): f is File => f instanceof File);
  if (!files.length || files.length > MAX_PHOTOS_PER_PRODUCT)
    return json({ error: `Gửi từ 1 đến ${MAX_PHOTOS_PER_PRODUCT} ảnh cho một sản phẩm` }, 400);
  const note = form.get("note");

  try {
    const buffers = await Promise.all(files.map(async (f) => Buffer.from(await f.arrayBuffer())));
    const result = await uploadProductPhotos(getSql(), actor, defaultStorage(), {
      tenantId,
      files: buffers,
      sellerNote: typeof note === "string" ? note : null,
    });
    // Start the analysis right after responding; the job row survives if this is cut short.
    after(() => drainAiJobs(1));
    return json(result, 201);
  } catch (err) {
    return errorResponse(err);
  }
}
