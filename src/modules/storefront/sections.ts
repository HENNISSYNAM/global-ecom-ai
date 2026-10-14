import { z } from "zod";

/**
 * Storefront layout = an ordered list of sections from a fixed allowlist. This is the contract the AI composer and
 * the conversational editor write to: plain text fields, ids of the store's own products/assets and enum targets.
 * No HTML, scripts, arbitrary URLs or styles. Text is rendered as text (React escapes it).
 */

const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((s) => !/[<>]/.test(s), "angle brackets are not allowed");
const optionalText = (max: number) => text(max).optional();
const id = z.string().uuid();

const ctaTarget = z.enum(["catalog", "rfq", "story", "delivery"]);
const cta = z.object({ label: text(40), target: ctaTarget }).strict();

export const announcementSection = z
  .object({ type: z.literal("announcement"), id: z.string().min(1).max(40), text: text(140) })
  .strict();

export const heroSplitSection = z
  .object({
    type: z.literal("hero_split"),
    id: z.string().min(1).max(40),
    eyebrow: optionalText(60),
    /** Serif italic lead-in, e.g. "Từ vườn". */
    titleLead: text(80),
    /** Condensed uppercase emphasis, e.g. "đến bếp". Keep short. */
    titleEmphasis: optionalText(40),
    body: optionalText(400),
    cta: cta.optional(),
    imageAssetId: id.optional(),
    imageSide: z.enum(["left", "right"]).default("left"),
  })
  .strict();

export const productRailSection = z
  .object({
    type: z.literal("product_rail"),
    id: z.string().min(1).max(40),
    title: text(80),
    intro: optionalText(300),
    /** Explicit product ids from this store, or all approved products when omitted. */
    productIds: z.array(id).max(24).optional(),
    category: z
      .string()
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
      .optional(),
  })
  .strict();

export const storyPanelSection = z
  .object({
    type: z.literal("story_panel"),
    id: z.string().min(1).max(40),
    eyebrow: optionalText(60),
    title: text(120),
    body: text(1500),
    imageAssetId: id.optional(),
  })
  .strict();

export const factListSection = z
  .object({
    type: z.literal("fact_list"),
    id: z.string().min(1).max(40),
    /** Used for trust points, processing steps or delivery terms — always seller-confirmed facts. */
    variant: z.enum(["trust", "process", "delivery"]),
    title: text(120),
    items: z
      .array(z.object({ title: text(80), body: text(400) }).strict())
      .min(1)
      .max(8),
  })
  .strict();

export const rfqCtaSection = z
  .object({
    type: z.literal("rfq_cta"),
    id: z.string().min(1).max(40),
    title: text(120),
    body: optionalText(400),
    buttonLabel: text(40),
  })
  .strict();

const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(60);

/**
 * Cocoon-style category page: one row per product group, group name on the left and a horizontal product rail on
 * the right. Built from approved catalog data only; empty groups are not shown.
 */
export const categoryRowsSection = z
  .object({
    type: z.literal("category_rows"),
    id: z.string().min(1).max(40),
    title: text(80),
    intro: optionalText(300),
    /** Order and labels of the groups; when omitted, every category of approved products is shown. */
    categories: z
      .array(z.object({ slug, label: text(40), note: optionalText(160) }).strict())
      .max(12)
      .optional(),
  })
  .strict();

/** Questions buyers ask, answered by the seller. Also emitted as FAQPage structured data. */
export const faqSection = z
  .object({
    type: z.literal("faq"),
    id: z.string().min(1).max(40),
    title: text(120),
    items: z
      .array(z.object({ question: text(200), answer: text(800) }).strict())
      .min(1)
      .max(12),
  })
  .strict();

export const sectionSchema = z.discriminatedUnion("type", [
  announcementSection,
  heroSplitSection,
  productRailSection,
  storyPanelSection,
  factListSection,
  rfqCtaSection,
  categoryRowsSection,
  faqSection,
]);

export const sectionsSchema = z
  .array(sectionSchema)
  .max(30)
  .refine((list) => new Set(list.map((s) => s.id)).size === list.length, "section ids must be unique");

export type Section = z.infer<typeof sectionSchema>;
export type SectionType = Section["type"];

/** Ids of products/assets a layout refers to; the server checks they belong to the same tenant before saving. */
export function referencedIds(sections: Section[]): { productIds: string[]; assetIds: string[] } {
  const productIds = new Set<string>();
  const assetIds = new Set<string>();
  for (const s of sections) {
    if (s.type === "product_rail") s.productIds?.forEach((p) => productIds.add(p));
    if ((s.type === "hero_split" || s.type === "story_panel") && s.imageAssetId) assetIds.add(s.imageAssetId);
  }
  return { productIds: [...productIds], assetIds: [...assetIds] };
}

/** Bracketed notes like "[Chờ Thịnh Phát xác nhận: ...]" mark text the business has not supplied yet. */
export const PLACEHOLDER_RE = /\[\s*(chờ|cho|cần|can|todo)(?!\p{L})[^\]]*\]/iu;

export function placeholderTexts(value: unknown): string[] {
  const out: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") {
      if (PLACEHOLDER_RE.test(v)) out.push(v);
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(value);
  return out;
}
