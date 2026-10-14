import { getSql } from "@/lib/db";
import { sendQuote } from "@/modules/rfq/seller";
import { errorResponse, json, requireSeller, UUID_RE } from "../../../_lib/respond";

export async function POST(request: Request, { params }: { params: Promise<{ rfqId: string }> }) {
  const { actor, response } = await requireSeller();
  if (!actor) return response;
  const { rfqId } = await params;
  if (!UUID_RE.test(rfqId)) return json({ error: "Không tìm thấy yêu cầu" }, 404);
  const body = await request.json().catch(() => null);
  try {
    return json(await sendQuote(getSql(), actor, rfqId, body), 201);
  } catch (err) {
    return errorResponse(err);
  }
}
