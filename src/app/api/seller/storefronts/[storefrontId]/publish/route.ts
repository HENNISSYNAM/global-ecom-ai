import { getSql } from "@/lib/db";
import { publishStorefront } from "@/modules/storefront/draft";
import { errorResponse, json, requireSeller, UUID_RE } from "../../../_lib/respond";

export async function POST(request: Request, { params }: { params: Promise<{ storefrontId: string }> }) {
  const { actor, response } = await requireSeller();
  if (!actor) return response;
  const { storefrontId } = await params;
  if (!UUID_RE.test(storefrontId)) return json({ error: "Không tìm thấy gian hàng" }, 404);
  const body = (await request.json().catch(() => null)) as { revision?: unknown } | null;
  if (typeof body?.revision !== "number" || !Number.isInteger(body.revision)) return json({ error: "Thiếu phiên bản nháp" }, 400);
  try {
    return json(await publishStorefront(getSql(), actor, storefrontId, body.revision));
  } catch (err) {
    return errorResponse(err);
  }
}
