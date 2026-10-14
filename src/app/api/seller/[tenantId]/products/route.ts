import { getSql } from "@/lib/db";
import { defaultStorage } from "@/modules/media/storage";
import { createProductFromSheet } from "@/modules/seller/products";
import { errorResponse, json, requireSeller, UUID_RE } from "../../_lib/respond";

export const maxDuration = 60;

export async function POST(request: Request, { params }: { params: Promise<{ tenantId: string }> }) {
  const { actor, response } = await requireSeller();
  if (!actor) return response;
  const { tenantId } = await params;
  if (!UUID_RE.test(tenantId)) return json({ error: "Không tìm thấy cửa hàng" }, 404);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Dữ liệu không hợp lệ" }, 400);
  }
  try {
    return json(await createProductFromSheet(getSql(), actor, defaultStorage(), tenantId, body), 201);
  } catch (err) {
    return errorResponse(err);
  }
}
