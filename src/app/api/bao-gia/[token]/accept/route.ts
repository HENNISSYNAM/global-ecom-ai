import { getSql } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { acceptQuote } from "@/modules/rfq/buyer";

export async function POST(request: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const body = (await request.json().catch(() => null)) as { quoteId?: unknown; idempotencyKey?: unknown } | null;
  if (typeof body?.quoteId !== "string" || typeof body.idempotencyKey !== "string")
    return Response.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
  try {
    const res = await acceptQuote(getSql(), token, body.quoteId, body.idempotencyKey);
    return Response.json(res, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof DomainError) {
      const status = { not_found: 404, conflict: 409, invalid: 400, forbidden: 403 }[err.code];
      return Response.json({ error: err.code === "conflict" ? "Báo giá đã hết hạn hoặc đã được thay bằng bản mới. Vui lòng tải lại trang." : err.message }, { status });
    }
    console.error("accept quote failed", (err as Error).message);
    return Response.json({ error: "Có lỗi xảy ra, vui lòng thử lại." }, { status: 500 });
  }
}
