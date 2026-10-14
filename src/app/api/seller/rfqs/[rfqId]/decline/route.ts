import { getSql } from "@/lib/db";
import { declineRfq } from "@/modules/rfq/seller";
import { errorResponse, json, requireSeller, UUID_RE } from "../../../_lib/respond";

export async function POST(_request: Request, { params }: { params: Promise<{ rfqId: string }> }) {
  const { actor, response } = await requireSeller();
  if (!actor) return response;
  const { rfqId } = await params;
  if (!UUID_RE.test(rfqId)) return json({ error: "Không tìm thấy yêu cầu" }, 404);
  try {
    await declineRfq(getSql(), actor, rfqId);
    return json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
