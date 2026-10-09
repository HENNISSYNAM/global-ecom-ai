import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { originLabel, priceDisplay, SALE_UNIT_LABEL, formatQuantityWithUnit } from "@/modules/catalog/format";
import type { PublishedStorefront } from "@/modules/storefront/public-read";
import { ASSISTANT_RULES, storeFacts } from "./context";

export type ChatTurn = { role: "user" | "assistant"; content: string };
export type ProviderName = "claude" | "openai_compatible" | "mock";
export type ChatReply = { text: string; provider: ProviderName; refused?: boolean };

export interface ChatProvider {
  readonly name: ProviderName;
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

export const MOCK_LABEL = "[Trả lời tự động, chưa dùng AI — máy chủ chưa cấu hình nhà cung cấp AI]";

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

export type OpenAICompatibleConfig = { baseUrl: string; apiKey: string; model: string; timeoutMs?: number };

/**
 * Any provider exposing the common `POST {baseUrl}/chat/completions` format (many Vietnamese AI gateways do).
 * Configured with AI_BASE_URL / AI_API_KEY / AI_MODEL. Same grounding rules and facts as the Claude provider.
 */
export class OpenAICompatibleChatProvider implements ChatProvider {
  readonly name = "openai_compatible" as const;
  constructor(
    private readonly config: OpenAICompatibleConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async reply(store: PublishedStorefront, turns: ChatTurn[]): Promise<ChatReply> {
    const url = `${this.config.baseUrl.replace(/\/+$/, "")}/chat/completions`;
    const res = await this.fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.config.apiKey}` },
      body: JSON.stringify({
        model: this.config.model,
        max_tokens: 800,
        temperature: 0.2,
        messages: [
          { role: "system", content: `${ASSISTANT_RULES}\n\n# Dữ liệu cửa hàng\n\n${storeFacts(store)}` },
          ...turns.map((t) => ({ role: t.role, content: t.content })),
        ],
      }),
      signal: AbortSignal.timeout(this.config.timeoutMs ?? 30_000),
    });
    if (!res.ok) {
      // Do not echo the provider's body: it can contain request details. Status is enough for the log.
      throw new Error(`AI provider responded ${res.status}`);
    }
    const data = (await res.json()) as { choices?: { message?: { content?: unknown } }[] };
    const content = data.choices?.[0]?.message?.content;
    const text = typeof content === "string" ? content.trim() : "";
    return { text: text || "Xin lỗi, mình chưa có câu trả lời. Bạn vui lòng thử hỏi lại.", provider: "openai_compatible" };
  }
}

/**
 * Picks the provider from server configuration: an OpenAI-compatible gateway when AI_BASE_URL, AI_API_KEY and AI_MODEL
 * are all set; otherwise Claude when Anthropic credentials are set; otherwise the labelled non-AI mock.
 */
export function defaultChatProvider(env: Record<string, string | undefined> = process.env): ChatProvider {
  if (env.AI_BASE_URL && env.AI_API_KEY && env.AI_MODEL) {
    return new OpenAICompatibleChatProvider({ baseUrl: env.AI_BASE_URL, apiKey: env.AI_API_KEY, model: env.AI_MODEL });
  }
  if (env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN) return new ClaudeChatProvider();
  return new MockChatProvider();
}
