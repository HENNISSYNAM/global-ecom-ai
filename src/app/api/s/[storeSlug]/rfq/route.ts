import { getSql } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { createRateLimiter } from "@/modules/assistant/chat";
import { submitRfq } from "@/modules/rfq/buyer";

// 5 requests per visitor IP per 30 minutes, per server instance.
const allow = createRateLimiter(5, 30 * 60 * 1000);

export async function POST(request: Request, ctx: { params: Promise<{ storeSlug: string }> }) {
  const { storeSlug } = await ctx.params;
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!allow(`${storeSlug}:${ip}`)) return Response.json({ error: "Bạn đã gửi nhiều yêu cầu, vui lòng thử lại sau." }, { status: 429 });
  const body = await request.json().catch(() => null);
  try {
    // The tenant comes from the storefront slug inside submit_rfq, never from the body.
    const res = await submitRfq(getSql(), storeSlug, body);
    return Response.json(
      { reference: res.reference, link: `/bao-gia/${res.token}` },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    if (err instanceof DomainError) {
      const status = err.code === "not_found" ? 404 : 400;
      return Response.json({ error: err.code === "not_found" ? "Không tìm thấy gian hàng." : err.message }, { status });
    }
    console.error("rfq submit failed", (err as Error).message);
    return Response.json({ error: "Gửi không thành công, vui lòng thử lại." }, { status: 500 });
  }
}
