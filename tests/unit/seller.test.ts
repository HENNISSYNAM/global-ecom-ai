import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { normalizeImage, ImageRejected } from "@/modules/media/images";
import { parseJsonObject, sanitizeDraft } from "@/modules/ai/product-draft";
import { defaultVisionProvider, MockVisionProvider, OpenAICompatibleVisionProvider } from "@/modules/ai/vision";
import { completeness, EMPTY_SHEET, sheetFromDraft, sheetToPayload, validateStep } from "@/modules/seller/sheet";
import { productSheetSchema } from "@/modules/seller/products";

const ASSET = "11111111-1111-4111-8111-111111111111";

describe("vision provider selection and request", () => {
  it("uses the gateway when configured, the labelled mock otherwise", () => {
    expect(defaultVisionProvider({ AI_BASE_URL: "https://api.stali.vn/v1", AI_API_KEY: "k", AI_MODEL: "m" }).name).toBe("openai_compatible");
    expect(defaultVisionProvider({ AI_BASE_URL: "https://x/v1", AI_API_KEY: "k", AI_MODEL: "chat", AI_VISION_MODEL: "vision" }).model).toBe("vision");
    const mock = defaultVisionProvider({});
    expect(mock).toBeInstanceOf(MockVisionProvider);
    expect(mock.isMock).toBe(true);
  });

  it("sends photos as data URLs with a JSON response format and never echoes the error body", async () => {
    const calls: { url: string; body: any; headers: any }[] = [];
    const okFetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)), headers: init.headers });
      return new Response(JSON.stringify({ choices: [{ message: { content: '```json\n{"fields":{"name":{"value":"Gừng","status":"observed"}}}\n```' } }], usage: { prompt_tokens: 3, completion_tokens: 2 } }));
    }) as unknown as typeof fetch;
    const p = new OpenAICompatibleVisionProvider({ baseUrl: "https://api.stali.vn/v1/", apiKey: "secret-key", model: "m" }, okFetch);
    const res = await p.analyzeProductImages([{ assetId: ASSET, mimeType: "image/webp", data: Buffer.from("abc") }], "ghi chú");
    expect(calls[0]!.url).toBe("https://api.stali.vn/v1/chat/completions");
    expect(calls[0]!.body.response_format).toEqual({ type: "json_object" });
    const parts = calls[0]!.body.messages[0].content;
    expect(parts.some((c: any) => c.type === "image_url" && c.image_url.url === `data:image/webp;base64,${Buffer.from("abc").toString("base64")}`)).toBe(true);
    expect(parts[0].text).toContain(ASSET);
    expect(res).toEqual({ raw: { fields: { name: { value: "Gừng", status: "observed" } } }, usage: { inputTokens: 3, outputTokens: 2 } });

    const badFetch = (async () => new Response("key secret-key invalid", { status: 401 })) as unknown as typeof fetch;
    const bad = new OpenAICompatibleVisionProvider({ baseUrl: "https://x", apiKey: "secret-key", model: "m" }, badFetch);
    await expect(bad.analyzeProductImages([{ assetId: ASSET, mimeType: "image/webp", data: Buffer.from("a") }], null)).rejects.toThrow(
      /^AI provider responded 401$/,
    );
  });
});

describe("draft sanitizing", () => {
  it("rejects output that is not a draft object and extracts JSON from wrapped replies", () => {
    expect(() => sanitizeDraft("not an object", [], { mock: false })).toThrow();
    expect(parseJsonObject('Đây là kết quả: {"a":1} xong')).toEqual({ a: 1 });
    expect(() => parseJsonObject("không có json")).toThrow();
  });

  it("drops unknown sale units and keeps an empty, honest draft for the mock", () => {
    const d = sanitizeDraft({ fields: { saleUnit: { value: "tấn", status: "observed" } } }, [ASSET], { mock: true });
    expect(d.fields.saleUnit.value).toBeNull();
    expect(d.mock).toBe(true);
    expect(Object.values(d.fields).every((f) => f.value === null)).toBe(true);
  });
});

describe("product sheet", () => {
  it("pre-fills only AI-suggestable fields and validates each step", () => {
    const draft = sanitizeDraft(
      { fields: { name: { value: "Củ năng gọt vỏ", status: "observed" }, originCountry: { value: "VN", status: "observed" }, saleUnit: { value: "bag", status: "observed" } } },
      [ASSET],
      { mock: false },
    );
    const { sheet, suggested } = sheetFromDraft(draft);
    expect(sheet).toMatchObject({ name: "Củ năng gọt vỏ", originCountry: "", saleUnit: "bag" });
    expect(suggested).toEqual({ name: true, saleUnit: true });

    expect(validateStep("origin", sheet)).not.toBeNull();
    expect(validateStep("moq", { ...sheet, minOrderQty: "1,5" })).toBeNull();
    expect(validateStep("price", { ...sheet, priceMode: "fixed", unitPriceVnd: "55.000đ" })).toBeNull();
    expect(validateStep("price", { ...sheet, priceMode: "fixed", unitPriceVnd: "0" })).not.toBeNull();
    expect(completeness(EMPTY_SHEET)).toMatchObject({ filled: 0, total: 10 });
  });

  it("produces a payload the server schema accepts, with decimals as strings and price in đồng", () => {
    const payload = sheetToPayload(
      {
        ...EMPTY_SHEET,
        name: "Hành tím bóc vỏ",
        processing: "Bóc vỏ",
        originCountry: "VN",
        saleUnit: "kg",
        packNetWeightKg: "2",
        minOrderQty: "1,5",
        priceMode: "fixed",
        unitPriceVnd: "48.000",
        storageInstructions: "Ngăn mát",
      },
      { jobId: null, photoAssetIds: [ASSET], approve: true },
    );
    expect(payload).toMatchObject({
      variant: { saleUnit: "kg", packNetWeightKg: null, minOrderQty: "1.5", orderStepQty: "1" },
      price: { mode: "fixed", unitPriceVnd: "48000" },
    });
    expect(productSheetSchema.safeParse(payload).success).toBe(true);
  });
});

describe("image normalization", () => {
  it("rejects tiny images and non-images; re-encodes to WebP within 2000 px", async () => {
    const tiny = await sharp({ create: { width: 100, height: 100, channels: 3, background: "#fff" } }).png().toBuffer();
    await expect(normalizeImage(tiny)).rejects.toBeInstanceOf(ImageRejected);
    await expect(normalizeImage(Buffer.from("GIF89a fake"))).rejects.toBeInstanceOf(ImageRejected);
    const big = await sharp({ create: { width: 4000, height: 3000, channels: 3, background: "#eee" } }).jpeg().toBuffer();
    const out = await normalizeImage(big);
    expect(out).toMatchObject({ mimeType: "image/webp", width: 2000, height: 1500 });
    expect(out.sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("quote line totals", () => {
  it("match the database rounding exactly, without floating point", async () => {
    const { lineTotal } = await import("@/components/rfq/QuoteForm");
    expect(lineTotal("1.333", "100001")).toBe(133301n);
    expect(lineTotal("20", "120.000")).toBe(2_400_000n);
    expect(lineTotal("0.005", "100")).toBe(1n); // 0.5 rounds half up
    expect(lineTotal("1,5", "33333")).toBe(50000n); // 49999.5 → 50000
    expect(lineTotal("abc", "1")).toBeNull();
  });
});
