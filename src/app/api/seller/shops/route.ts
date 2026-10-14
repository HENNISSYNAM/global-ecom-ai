import { getSql } from "@/lib/db";
import { createShop } from "@/modules/seller/shops";
import { errorResponse, json, requireSeller } from "../_lib/respond";

export async function POST(request: Request) {
  const { actor, response } = await requireSeller();
  if (!actor) return response;
  const body = await request.json().catch(() => null);
  try {
    return json(await createShop(getSql(), actor, body), 201);
  } catch (err) {
    return errorResponse(err);
  }
}
