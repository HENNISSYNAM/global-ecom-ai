import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { CLAUDE_MODEL } from "@/modules/assistant/provider";
import { analysisPrompt, parseJsonObject, PRODUCT_DRAFT_SCHEMA_VERSION, PROMPT_VERSION } from "./product-draft";

/** One photo as sent to a provider: already re-encoded on upload (no EXIF), max 2000 px. */
export type VisionImage = { assetId: string; mimeType: string; data: Buffer };

export type VisionResult = { raw: unknown; usage: Record<string, number> | null };

export interface VisionProvider {
  readonly name: "openai_compatible" | "claude" | "mock";
  readonly model: string;
  readonly promptVersion: string;
  readonly isMock: boolean;
  analyzeProductImages(images: VisionImage[], sellerNote: string | null): Promise<VisionResult>;
}

/** OpenAI-compatible gateways (e.g. stali.vn): `POST {baseUrl}/chat/completions` with image_url data URLs. */
export class OpenAICompatibleVisionProvider implements VisionProvider {
  readonly name = "openai_compatible" as const;
  readonly promptVersion = PROMPT_VERSION;
  readonly isMock = false;
  constructor(
    private readonly config: { baseUrl: string; apiKey: string; model: string; timeoutMs?: number },
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}
  get model() {
    return this.config.model;
  }

  async analyzeProductImages(images: VisionImage[], sellerNote: string | null): Promise<VisionResult> {
    const content: unknown[] = [{ type: "text", text: analysisPrompt(images.map((i) => i.assetId), sellerNote) }];
    for (const img of images) {
      content.push({ type: "text", text: `Ảnh mã ${img.assetId}:` });
      content.push({ type: "image_url", image_url: { url: `data:${img.mimeType};base64,${img.data.toString("base64")}` } });
    }
    const res = await this.fetchImpl(`${this.config.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.config.apiKey}` },
      body: JSON.stringify({
        model: this.config.model,
        max_tokens: 2000,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content }],
      }),
      signal: AbortSignal.timeout(this.config.timeoutMs ?? 90_000),
    });
    // The body can echo request details; the status is enough for the job log.
    if (!res.ok) throw new Error(`AI provider responded ${res.status}`);
    const data = (await res.json()) as {
      choices?: { message?: { content?: unknown } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const text = data.choices?.[0]?.message?.content;
    if (typeof text !== "string") throw new Error("AI provider returned no text");
    const usage = data.usage
      ? { inputTokens: data.usage.prompt_tokens ?? 0, outputTokens: data.usage.completion_tokens ?? 0 }
      : null;
    return { raw: parseJsonObject(text), usage };
  }
}

export class ClaudeVisionProvider implements VisionProvider {
  readonly name = "claude" as const;
  readonly model = CLAUDE_MODEL;
  readonly promptVersion = PROMPT_VERSION;
  readonly isMock = false;
  constructor(private readonly client: Anthropic = new Anthropic()) {}

  async analyzeProductImages(images: VisionImage[], sellerNote: string | null): Promise<VisionResult> {
    const content: Anthropic.ContentBlockParam[] = [];
    for (const img of images) {
      content.push({ type: "text", text: `Ảnh mã ${img.assetId}:` });
      content.push({
        type: "image",
        source: { type: "base64", media_type: img.mimeType as "image/webp", data: img.data.toString("base64") },
      });
    }
    content.push({ type: "text", text: analysisPrompt(images.map((i) => i.assetId), sellerNote) });
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4000,
      messages: [{ role: "user", content }],
    });
    if (response.stop_reason === "refusal") throw new Error("AI declined to analyse these photos");
    const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    return {
      raw: parseJsonObject(text),
      usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
    };
  }
}

/**
 * Used when no AI provider is configured. It does not look at the photos: every field is left for the seller and
 * the draft is marked `mock`, so the console says plainly that no AI was involved.
 */
export class MockVisionProvider implements VisionProvider {
  readonly name = "mock" as const;
  readonly model = "none";
  readonly promptVersion = PROMPT_VERSION;
  readonly isMock = true;

  async analyzeProductImages(images: VisionImage[]): Promise<VisionResult> {
    return {
      raw: {
        schemaVersion: PRODUCT_DRAFT_SCHEMA_VERSION,
        observations: [],
        fields: {},
        questions: [],
        photoFeedback: images.length < 3
          ? [{ assetId: null, issue: "Nên có ít nhất 3 ảnh: toàn cảnh, cận cảnh sản phẩm, bao bì/quy cách đóng gói." }]
          : [],
      },
      usage: null,
    };
  }
}

/** Same selection order as the chat: OpenAI-compatible gateway → Claude → labelled mock. */
export function defaultVisionProvider(env: Record<string, string | undefined> = process.env): VisionProvider {
  const model = env.AI_VISION_MODEL || env.AI_MODEL;
  if (env.AI_BASE_URL && env.AI_API_KEY && model) {
    return new OpenAICompatibleVisionProvider({ baseUrl: env.AI_BASE_URL, apiKey: env.AI_API_KEY, model });
  }
  if (env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN) return new ClaudeVisionProvider();
  return new MockVisionProvider();
}
