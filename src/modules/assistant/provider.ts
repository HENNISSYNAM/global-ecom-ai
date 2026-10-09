import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { originLabel, priceDisplay, SALE_UNIT_LABEL, formatQuantityWithUnit } from "@/modules/catalog/format";
import type { PublishedStorefront } from "@/modules/storefront/public-read";
import { ASSISTANT_RULES, storeFacts } from "./context";

export type ChatTurn = { role: "user" | "assistant"; content: string };
export type ChatReply = { text: string; provider: "claude" | "mock"; refused?: boolean };

export interface ChatProvider {
  readonly name: "claude" | "mock";
  reply(store: PublishedStorefront, turns: ChatTurn[]): Promise<ChatReply>;
}

export const CLAUDE_MODEL = "claude-opus-5-5";

/** Calls Claude with the store facts behind a cache breakpoint. Server-only; the key never reaches the browser. */
export class ClaudeChatProvider implements ChatProvider {
  readonly name = "claude" as const;
  constructor(private readonly client: Anthropic = new Anthropic()) {}

  async reply(store: PublishedStorefront, turns: ChatTurn[]): Promise<ChatReply> {
    const response = await this.client.beta.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 2000,
      // Chat route: low effort keeps answers fast; the task is lookup over a small, fixed document.
      output_config: { effort: "low" },
      // Re-run a policy decline on Anthropic's recommended fallback model instead of failing the chat.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: [
        { type: "text", text: `${ASSISTANT_RULES}\n\nLatency-sensitive; begin your visible answer immediately.` },
        // Identical for every visitor of the same published version, so repeated questions hit the cache.
        { type: "text", text: `# Dữ liệu cửa hàng\n\n${storeFacts(store)}`, cache_control: { type: "ephemeral" } },
      ],
      messages: turns.map((t) => ({ role: t.role, content: t.content })),
    });

    if (response.stop_reason === "refusal") {
      return {
        text: "Xin lỗi, mình không trả lời được câu này. Bạn có thể hỏi về sản phẩm, quy cách hoặc cách đặt hàng của cửa hàng.",
        provider: "claude",
        refused: true,
      };
    }
    const text = response.content
      .flatMap((b) => (b.type === "text" ? [b.text] : []))
      .join("")
      .trim();
    return { text: text || "Xin lỗi, mình chưa có câu trả lời. Bạn vui lòng thử hỏi lại.", provider: "claude" };
  }
}

const strip = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();

export const MOCK_LABEL = "[Trả lời tự động, chưa dùng AI — máy chủ chưa cấu hình ANTHROPIC_API_KEY]";

/**
 * Keyword lookup over the published catalog, used when no Anthropic credentials are configured. It is NOT AI and
 * every reply says so. It only repeats published facts, so it follows the same no-invention rules.
 */
export class MockChatProvider implements ChatProvider {
  readonly name = "mock" as const;

  async reply(store: PublishedStorefront, turns: ChatTurn[]): Promise<ChatReply> {
    const question = strip(turns.filter((t) => t.role === "user").at(-1)?.content ?? "");
    const words = question.split(/[^a-z0-9]+/).filter((w) => w.length >= 2);
    const matches = store.catalog.products.filter((p) => {
      const name = strip(p.name);
      return words.some((w) => name.includes(w));
    });

    const lines: string[] = [MOCK_LABEL];
    if (!matches.length) {
      lines.push(
        store.catalog.products.length
          ? `Mình chưa tìm thấy sản phẩm khớp câu hỏi. Cửa hàng đang có: ${store.catalog.products.map((p) => p.name).join(", ")}.`
          : "Cửa hàng chưa xuất bản sản phẩm nào.",
      );
    }
    for (const p of matches.slice(0, 3)) {
      const parts = [`${p.name}:`];
      const origin = originLabel(p.originCountry, p.originRegion);
      parts.push(`xuất xứ ${origin ?? "chưa có thông tin"}.`);
      for (const v of p.variants) {
        const price = priceDisplay(v);
        parts.push(
          `Bán theo ${SALE_UNIT_LABEL[v.saleUnit]}, tối thiểu ${formatQuantityWithUnit(v.minOrderQty, v.saleUnit)}, ` +
            (price.kind === "fixed" ? `giá ${price.text} / ${price.unit}.` : "giá liên hệ báo giá."),
        );
      }
      parts.push(`Xem: /s/${store.slug}/san-pham/${p.slug}`);
      lines.push(parts.join(" "));
    }
    lines.push("Phí giao và thời gian giao do người bán xác nhận khi báo giá.");
    return { text: lines.join("\n"), provider: "mock" };
  }
}

/** Uses Claude when credentials are configured, otherwise the labelled mock. */
export function defaultChatProvider(): ChatProvider {
  const hasCredentials = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
  return hasCredentials ? new ClaudeChatProvider() : new MockChatProvider();
}
