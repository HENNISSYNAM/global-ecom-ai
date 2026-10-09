import type Anthropic from "@anthropic-ai/sdk";
import { afterAll, describe, expect, it } from "vitest";
import { answer, chatRequestSchema, createRateLimiter } from "@/modules/assistant/chat";
import { storeFacts } from "@/modules/assistant/context";
import { ClaudeChatProvider, CLAUDE_MODEL, MOCK_LABEL, MockChatProvider } from "@/modules/assistant/provider";
import { getPublishedStorefront } from "@/modules/storefront/public-read";
import { connect } from "../db/helpers";

const sql = connect();
afterAll(() => sql.end());

async function demoStore() {
  const store = await getPublishedStorefront(sql, "vuon-mau-demo");
  if (!store) throw new Error("demo store missing");
  return store;
}

describe("assistant grounding facts", () => {
  it("contain only published products and state unknowns instead of inventing them", async () => {
    const facts = storeFacts(await demoStore());
    expect(facts).toContain("Hạt điều rang muối (DEMO)");
    expect(facts).toContain("125.000 ₫ / túi");
    expect(facts).toContain("liên hệ báo giá (chưa công bố giá)");
    expect(facts).toContain("tối thiểu 1,5 kg, bước 0,5 kg");
    expect(facts).toContain("gian hàng DEMO");
    // The unapproved draft product never reaches the assistant.
    expect(facts).not.toContain("Tiêu đen");
  });

  it("is deterministic for a published version (cacheable prefix)", async () => {
    expect(storeFacts(await demoStore())).toBe(storeFacts(await demoStore()));
  });
});

describe("Claude provider request", () => {
  function fakeClient(response: Partial<Anthropic.Beta.BetaMessage>) {
    const calls: unknown[] = [];
    const client = {
      beta: {
        messages: {
          create: async (params: unknown) => {
            calls.push(params);
            return { content: [], stop_reason: "end_turn", ...response };
          },
        },
      },
    } as unknown as Anthropic;
    return { client, calls };
  }

  it("sends the facts behind a cache breakpoint with server-side fallbacks", async () => {
    const { client, calls } = fakeClient({ content: [{ type: "text", text: "Có ạ.", citations: null }] as never });
    const reply = await new ClaudeChatProvider(client).reply(await demoStore(), [{ role: "user", content: "Có hạt điều không?" }]);
    expect(reply).toEqual({ text: "Có ạ.", provider: "claude" });

    const params = calls[0] as Record<string, unknown> & { system: { text: string; cache_control?: unknown }[] };
    expect(params.model).toBe(CLAUDE_MODEL);
    expect(params.fallbacks).toBe("default");
    expect(params.betas).toEqual(["server-side-fallback-2026-07-01"]);
    expect(params.system[1]!.cache_control).toEqual({ type: "ephemeral" });
    expect(params.system[1]!.text).toContain("Hạt điều rang muối (DEMO)");
    expect(params.system[0]!.text).toContain("Không bao giờ tự tạo giá");
  });

  it("turns a refusal into a polite message instead of empty output", async () => {
    const { client } = fakeClient({ stop_reason: "refusal" });
    const reply = await new ClaudeChatProvider(client).reply(await demoStore(), [{ role: "user", content: "x" }]);
    expect(reply.refused).toBe(true);
    expect(reply.text.length).toBeGreaterThan(10);
  });
});

describe("mock provider", () => {
  it("is labelled as not AI and repeats only published facts", async () => {
    const reply = await new MockChatProvider().reply(await demoStore(), [{ role: "user", content: "trà xanh giá bao nhiêu" }]);
    expect(reply.provider).toBe("mock");
    expect(reply.text.startsWith(MOCK_LABEL)).toBe(true);
    expect(reply.text).toContain("Trà xanh sấy khô (DEMO)");
    expect(reply.text).toContain("giá liên hệ báo giá");
    expect(reply.text).not.toMatch(/0 ₫/);
  });
});

describe("chat request handling", () => {
  it("rejects malformed or oversized conversations", () => {
    expect(chatRequestSchema.safeParse({ messages: [] }).success).toBe(false);
    expect(chatRequestSchema.safeParse({ messages: [{ role: "system", content: "x" }] }).success).toBe(false);
    expect(chatRequestSchema.safeParse({ messages: [{ role: "user", content: "a".repeat(1001) }] }).success).toBe(false);
    expect(chatRequestSchema.safeParse({ messages: [{ role: "assistant", content: "hi" }] }).success).toBe(false);
    expect(chatRequestSchema.safeParse({ messages: [{ role: "user", content: "hi" }], tenantId: "x" }).success).toBe(false);
  });

  it("sends only recent turns, starting with a user turn", async () => {
    const seen: number[] = [];
    const provider = {
      name: "mock" as const,
      reply: async (_s: unknown, turns: { role: string }[]) => {
        seen.push(turns.length);
        expect(turns[0]!.role).toBe("user");
        return { text: "ok", provider: "mock" as const };
      },
    };
    const messages = Array.from({ length: 19 }, (_, i) => ({ role: i % 2 === 0 ? "user" : "assistant", content: `m${i}` }) as const);
    await answer(provider, await demoStore(), chatRequestSchema.parse({ messages }));
    expect(seen[0]).toBeLessThanOrEqual(12);
  });

  it("rate limits per key within a window", () => {
    const allow = createRateLimiter(2, 1000);
    expect([allow("a", 0), allow("a", 1), allow("a", 2), allow("b", 2), allow("a", 1001)]).toEqual([true, true, false, true, true]);
  });
});

describe("OpenAI-compatible provider", () => {
  it("sends bearer auth, the grounding rules and facts, and reads the first choice", async () => {
    const { OpenAICompatibleChatProvider } = await import("@/modules/assistant/provider");
    const seen: { url: string; init: RequestInit }[] = [];
    const fakeFetch = (async (url: string, init: RequestInit) => {
      seen.push({ url, init });
      return new Response(JSON.stringify({ choices: [{ message: { content: " Dạ có ạ. " } }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const provider = new OpenAICompatibleChatProvider({ baseUrl: "https://gw.test/v1/", apiKey: "k-test", model: "m-test" }, fakeFetch);
    const reply = await provider.reply(await demoStore(), [{ role: "user", content: "Có trà không?" }]);

    expect(reply).toEqual({ text: "Dạ có ạ.", provider: "openai_compatible" });
    expect(seen[0]!.url).toBe("https://gw.test/v1/chat/completions");
    expect((seen[0]!.init.headers as Record<string, string>).Authorization).toBe("Bearer k-test");
    const body = JSON.parse(String(seen[0]!.init.body));
    expect(body.model).toBe("m-test");
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[0].content).toContain("Không bao giờ tự tạo giá");
    expect(body.messages[0].content).toContain("Trà xanh sấy khô (DEMO)");
    expect(body.messages.at(-1)).toEqual({ role: "user", content: "Có trà không?" });
  });

  it("fails with the status only, without leaking the provider body", async () => {
    const { OpenAICompatibleChatProvider } = await import("@/modules/assistant/provider");
    const fakeFetch = (async () => new Response("secret details", { status: 401 })) as unknown as typeof fetch;
    const provider = new OpenAICompatibleChatProvider({ baseUrl: "https://gw.test/v1", apiKey: "k", model: "m" }, fakeFetch);
    await expect(provider.reply(await demoStore(), [{ role: "user", content: "x" }])).rejects.toThrow("AI provider responded 401");
  });

  it("is chosen only when base URL, key and model are all configured", async () => {
    const { defaultChatProvider } = await import("@/modules/assistant/provider");
    expect(defaultChatProvider({ AI_BASE_URL: "https://gw.test/v1", AI_API_KEY: "k", AI_MODEL: "m" }).name).toBe("openai_compatible");
    expect(defaultChatProvider({ AI_BASE_URL: "https://gw.test/v1", AI_API_KEY: "k" }).name).toBe("mock");
    expect(defaultChatProvider({}).name).toBe("mock");
  });
});
