import * as cheerio from "cheerio";

/**
 * Extracts what a seller's existing website says about itself, for import as UNCONFIRMED draft material.
 * Nothing here is treated as a confirmed fact: the output feeds a review step where the seller confirms
 * names, origin, specs and prices before anything is approved or published.
 */

export type ExtractedImage = { url: string; alt: string | null };
export type ExtractedProduct = {
  name: string;
  priceText: string | null;
  /** True when the page shows "Liên hệ"-style pricing instead of a number. */
  contactForPrice: boolean;
  imageUrls: string[];
  description: string | null;
  source: "json-ld" | "page";
};

export type ExtractedPage = {
  url: string;
  title: string | null;
  metaDescription: string | null;
  canonical: string | null;
  h1: string | null;
  headings: string[];
  text: string;
  images: ExtractedImage[];
  links: string[];
  product: ExtractedProduct | null;
};

const PRICE_RE = /(\d{1,3}(?:[.,]\d{3})+|\d{4,})\s*(?:đ|₫|vnđ|vnd)/i;
// No \b: JS word boundaries are ASCII-only and fail next to Vietnamese letters like "ệ".
const CONTACT_RE = /(^|[^\p{L}])liên hệ($|[^\p{L}])/iu;

function abs(base: string, href: string | undefined | null): string | null {
  if (!href) return null;
  const h = href.trim();
  if (!h || h.startsWith("data:") || h.startsWith("javascript:") || h.startsWith("mailto:") || h.startsWith("tel:")) return null;
  try {
    const u = new URL(h, base);
    u.hash = "";
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

const clean = (s: string | undefined | null) => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length ? t : null;
};

function jsonLdProducts(raw: unknown[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const visit = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object") return;
    const obj = node as Record<string, unknown>;
    const type = obj["@type"];
    if (type === "Product" || (Array.isArray(type) && type.includes("Product"))) out.push(obj);
    if (obj["@graph"]) visit(obj["@graph"]);
  };
  raw.forEach(visit);
  return out;
}

export function extractPage(url: string, html: string): ExtractedPage {
  const $ = cheerio.load(html);
  const jsonLd: unknown[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      jsonLd.push(JSON.parse($(el).text()));
    } catch {
      // Ignore malformed JSON-LD; the page text is still extracted.
    }
  });

  const images: ExtractedImage[] = [];
  const seenImg = new Set<string>();
  $("img").each((_, el) => {
    const $el = $(el);
    const src = abs(url, $el.attr("data-src") ?? $el.attr("data-lazy-src") ?? $el.attr("src"));
    if (!src || seenImg.has(src) || /\.svg(\?|$)/i.test(src)) return;
    const w = Number($el.attr("width") ?? 0);
    if (w && w < 64) return; // icons, tracking pixels
    seenImg.add(src);
    images.push({ url: src, alt: clean($el.attr("alt")) });
  });

  const links = new Set<string>();
  $("a[href]").each((_, el) => {
    const href = abs(url, $(el).attr("href"));
    if (href) links.add(href);
  });

  const h1 = clean($("h1").first().text());
  const headings = $("h2, h3")
    .map((_, el) => clean($(el).text()))
    .get()
    .filter((t): t is string => Boolean(t))
    .slice(0, 40);

  $("script, style, noscript, svg, iframe, header nav, footer").remove();
  const main = $("main").length ? $("main") : $("article").length ? $("article") : $("body");
  const text = (main.text() ?? "").replace(/\s+/g, " ").trim().slice(0, 20_000);

  let product: ExtractedProduct | null = null;
  const ld = jsonLdProducts(jsonLd)[0];
  if (ld && typeof ld.name === "string") {
    const offers = (Array.isArray(ld.offers) ? ld.offers[0] : ld.offers) as Record<string, unknown> | undefined;
    const price = offers?.price != null ? String(offers.price) : null;
    const image = ld.image;
    const imageUrls = (Array.isArray(image) ? image : image ? [image] : [])
      .map((i) => abs(url, typeof i === "string" ? i : ((i as { url?: string }).url ?? null)))
      .filter((u): u is string => Boolean(u));
    product = {
      name: ld.name.trim(),
      // A JSON-LD price of 0 usually means "contact us"; never import it as a real price.
      priceText: price && Number(price) > 0 ? `${price} ${String(offers?.priceCurrency ?? "")}`.trim() : null,
      contactForPrice: !price || Number(price) === 0,
      imageUrls,
      description: typeof ld.description === "string" ? clean(ld.description) : null,
      source: "json-ld",
    };
  } else if (h1 && ($('meta[property="og:type"]').attr("content") === "product" || PRICE_RE.test(text) || CONTACT_RE.test(text))) {
    const priceMatch = text.match(PRICE_RE);
    product = {
      name: h1,
      priceText: priceMatch ? priceMatch[0] : null,
      contactForPrice: !priceMatch && CONTACT_RE.test(text),
      imageUrls: images.slice(0, 6).map((i) => i.url),
      description: clean($('meta[name="description"]').attr("content")),
      source: "page",
    };
  }

  return {
    url,
    title: clean($("title").first().text()),
    metaDescription: clean($('meta[name="description"]').attr("content")),
    canonical: abs(url, $('link[rel="canonical"]').attr("href")),
    h1,
    headings,
    text,
    images,
    links: [...links],
    product,
  };
}

/** Minimal robots.txt check for the "*" group (Disallow prefixes only). */
export function robotsDisallows(robotsTxt: string): string[] {
  const rules: string[] = [];
  let applies = false;
  for (const line of robotsTxt.split(/\r?\n/)) {
    const [rawKey, ...rest] = line.split("#")[0]!.split(":");
    const key = rawKey?.trim().toLowerCase();
    const value = rest.join(":").trim();
    if (key === "user-agent") applies = value === "*";
    else if (applies && key === "disallow" && value) rules.push(value);
  }
  return rules;
}
