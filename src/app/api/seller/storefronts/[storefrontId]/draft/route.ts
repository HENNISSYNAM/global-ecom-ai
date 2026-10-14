import { getSql } from "@/lib/db";
import { saveDraft } from "@/modules/storefront/draft";
import { errorResponse, json, requireSeller, UUID_RE } from "../../../_lib/respond";

/** Saves brand/sections of the draft. saveDraft validates the layout schema, tenancy of references and revision. */
export async function PUT(request: Request, { params }: { params: Promise<{ storefrontId: string }> }) {
  const { actor, response } = await requireSeller();
  if (!actor) return response;
  const { storefrontId } = await params;
  if (!UUID_RE.test(storefrontId)) return json({ error: "Không tìm thấy gian hàng" }, 404);
  const body = (await request.json().catch(() => null)) as { revision?: unknown; brand?: unknown; sections?: unknown } | null;
  if (typeof body?.revision !== "number") return json({ error: "Thiếu phiên bản nháp" }, 400);
  try {
    return json(await saveDraft(getSql(), actor, storefrontId, body.revision, { brand: body.brand, sections: body.sections }));
  } catch (err) {
    return errorResponse(err);
  }
}
