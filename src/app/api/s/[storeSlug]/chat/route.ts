import { getSql } from "@/lib/db";
import { answer, chatRequestSchema, createRateLimiter } from "@/modules/assistant/chat";
import { defaultChatProvider } from "@/modules/assistant/provider";
import { getPublishedStorefront } from "@/modules/storefront/public-read";

// 20 questions per visitor IP per 10 minutes, per server instance.
const allow = createRateLimiter(20, 10 * 60 * 1000);

export async function POST(request: Request, ctx: { params: Promise<{ storeSlug: string }> }) {
  const { storeSlug } = await ctx.params;
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!allow(`${storeSlug}:${ip}`)) {
    return Response.json({ error: "Bạn hỏi hơi nhanh, vui lòng thử lại sau ít phút." }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Tin nhắn không hợp lệ." }, { status: 400 });

  // Only a live, published storefront can be asked about; the tenant comes from the slug, never from the body.
  const store = await getPublishedStorefront(getSql(), storeSlug);
  if (!store) return Response.json({ error: "Không tìm thấy gian hàng." }, { status: 404 });

  try {
    const reply = await answer(defaultChatProvider(), store, parsed.data);
    return Response.json(reply, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("chat provider failed", { storeSlug, error: (err as Error).message });
    return Response.json({ error: "Trợ lý đang gặp sự cố, vui lòng thử lại sau." }, { status: 502 });
  }
}
