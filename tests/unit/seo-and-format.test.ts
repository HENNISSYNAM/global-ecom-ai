import { describe, expect, it } from "vitest";
import { formatMoney, formatQuantity, formatQuantityWithUnit, originLabel } from "@/modules/catalog/format";
import { productJsonLd, serializeJsonLd } from "@/modules/seo/jsonld";
import type { SnapshotProduct } from "@/modules/storefront/snapshot";

const product = (offers: SnapshotProduct["variants"][number]["offer"][]): SnapshotProduct => ({
  id: "2a000000-0000-4000-8000-000000000001",
  slug: "toi-boc-vo",
  name: "Tỏi bóc vỏ",
  category: null,
  processing: "Bóc vỏ",
  summary: null,
  description: null,
  originCountry: "CN",
  originRegion: null,
  storageInstructions: null,
  shelfLifeNote: null,
  approvedAt: "2026-10-08T00:00:00Z",
  imageAssetIds: [],
  evidence: [],
  variants: offers.map((offer, i) => ({
    id: `3a000000-0000-4000-8000-00000000000${i}`,
    sku: null,
    packDescription: null,
    saleUnit: "kg",
    packNetWeightKg: null,
    minOrderQty: "1.500",
    orderStepQty: "0.500",
    offer,
  })),
});

describe("Product JSON-LD", () => {
  const base = { url: "https://x.test/s/a/san-pham/toi-boc-vo", sellerName: "A", imageUrls: [] };

  it("emits no Offer for quote-only products (never price 0)", () => {
    const ld = productJsonLd({ ...base, product: product([{ priceMode: "quote_required", currency: "VND", unitPriceMinor: null, validTo: null }]) });
    expect(ld.offers).toBeUndefined();
    expect(JSON.stringify(ld)).not.toContain('"price"');
  });

  it("emits an Offer only for confirmed fixed prices, without invented availability or ratings", () => {
    const ld = productJsonLd({ ...base, product: product([{ priceMode: "fixed", currency: "VND", unitPriceMinor: "125000", validTo: null }]) });
    expect(ld.offers).toMatchObject({ "@type": "Offer", price: "125000", priceCurrency: "VND" });
    const text = JSON.stringify(ld);
    for (const forbidden of ["availability", "aggregateRating", "review", "gtin"]) expect(text).not.toContain(forbidden);
  });

  it("uses the declared origin per product (not Vietnam by default)", () => {
    const ld = productJsonLd({ ...base, product: product([]) });
    expect(ld.countryOfOrigin).toEqual({ "@type": "Country", name: "Trung Quốc" });
  });

  it("serializes without allowing a script breakout", () => {
    expect(serializeJsonLd({ name: "</script><script>alert(1)</script>" })).not.toContain("</script>");
  });
});

describe("formatting", () => {
  it("formats VND from integer strings", () => {
    expect(formatMoney("125000", "VND")).toBe("125.000 ₫");
    expect(formatMoney("9007199254740993", "VND")).toBe("9.007.199.254.740.993 ₫");
  });

  it("formats decimal quantities without float rounding", () => {
    expect(formatQuantity("1.500")).toBe("1,5");
    expect(formatQuantity("20.000")).toBe("20");
    expect(formatQuantity("0.333")).toBe("0,333");
    expect(formatQuantityWithUnit("1.500", "kg")).toBe("1,5 kg");
    expect(formatQuantityWithUnit("10.000", "bag")).toBe("10 túi");
  });

  it("shows nothing for unknown origin instead of a default", () => {
    expect(originLabel(null, null)).toBeNull();
    expect(originLabel("VN", "Lâm Đồng")).toBe("Lâm Đồng, Việt Nam");
  });
});

describe("siteUrl", () => {
  it("normalizes dashboard-style values and never throws", async () => {
    const { siteUrl } = await import("@/lib/site");
    expect(siteUrl({ SITE_URL: "global-ecom-ai.vercel.app" })).toBe("https://global-ecom-ai.vercel.app");
    expect(siteUrl({ SITE_URL: " https://shop.vn/ " })).toBe("https://shop.vn");
    expect(siteUrl({ SITE_URL: "http://localhost:3100/x" })).toBe("http://localhost:3100");
    expect(siteUrl({ SITE_URL: "not a url", VERCEL_PROJECT_PRODUCTION_URL: "p.vercel.app" })).toBe("https://p.vercel.app");
    expect(siteUrl({})).toBe("http://localhost:3000");
  });
});
