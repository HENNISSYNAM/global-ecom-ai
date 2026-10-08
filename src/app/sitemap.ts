import type { MetadataRoute } from "next";
import { getSql } from "@/lib/db";
import { absoluteUrl, productPath, storefrontPath } from "@/lib/site";
import { getPublishedStorefront, listLiveStorefronts } from "@/modules/storefront/public-read";

export const dynamic = "force-dynamic";

/** Only published, non-demo storefronts and their published products. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const sql = getSql();
  const entries: MetadataRoute.Sitemap = [];
  for (const { slug } of await listLiveStorefronts(sql)) {
    const store = await getPublishedStorefront(sql, slug);
    if (!store || store.brand?.isDemo) continue;
    entries.push({ url: absoluteUrl(storefrontPath(slug)), lastModified: store.publishedAt });
    for (const p of store.catalog.products) {
      entries.push({ url: absoluteUrl(productPath(slug, p.slug)), lastModified: store.publishedAt });
    }
  }
  return entries;
}
