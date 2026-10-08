import { countryName } from "@/modules/catalog/format";
import type { Brand } from "@/modules/storefront/brand";
import type { SnapshotProduct } from "@/modules/storefront/snapshot";

/**
 * JSON-LD built strictly from data that is visible on the page. Rules:
 * - an Offer is emitted only for a confirmed fixed price; "contact for price" never becomes price 0;
 * - no ratings, GTINs, certifications, availability or shipping claims unless the data model holds them (it does not yet).
 */

type JsonLd = Record<string, unknown>;

export function organizationJsonLd(input: { name: string; url: string; brand: Brand | null; logoUrl?: string | null }): JsonLd {
  const org: JsonLd = { "@context": "https://schema.org", "@type": "Organization", name: input.brand?.businessName ?? input.name, url: input.url };
  if (input.logoUrl) org.logo = input.logoUrl;
  if (input.brand?.phone) org.telephone = input.brand.phone;
  if (input.brand?.email) org.email = input.brand.email;
  if (input.brand?.address) org.address = input.brand.address;
  if (input.brand?.website) org.sameAs = [input.brand.website];
  return org;
}

export function breadcrumbJsonLd(items: { name: string; url: string }[]): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({ "@type": "ListItem", position: i + 1, name: item.name, item: item.url })),
  };
}

export function productJsonLd(input: {
  product: SnapshotProduct;
  url: string;
  sellerName: string;
  imageUrls: string[];
}): JsonLd {
  const { product } = input;
  const ld: JsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    url: input.url,
  };
  const description = product.description ?? product.summary;
  if (description) ld.description = description;
  if (input.imageUrls.length) ld.image = input.imageUrls;
  if (product.category) ld.category = product.category;
  const origin = countryName(product.originCountry);
  if (origin) ld.countryOfOrigin = { "@type": "Country", name: origin };

  const offers = product.variants.flatMap((v) => {
    const offer = v.offer;
    if (!offer || offer.priceMode !== "fixed" || !offer.unitPriceMinor) return [];
    const o: JsonLd = {
      "@type": "Offer",
      price: offer.unitPriceMinor,
      priceCurrency: offer.currency,
      url: input.url,
      seller: { "@type": "Organization", name: input.sellerName },
    };
    if (v.sku) o.sku = v.sku;
    if (offer.validTo) o.priceValidUntil = offer.validTo.slice(0, 10);
    return [o];
  });
  if (offers.length) ld.offers = offers.length === 1 ? offers[0] : offers;
  return ld;
}

/** Serializes JSON-LD for a <script> tag without allowing "</script>" breakouts from text fields. */
export function serializeJsonLd(data: JsonLd | JsonLd[]): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
