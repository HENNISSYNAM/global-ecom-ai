import { withActor, type Sql } from "@/lib/db";
import { brandSchema, type Brand } from "./brand";
import { sectionsSchema, type Section } from "./sections";
import { catalogSnapshotSchema, type CatalogSnapshot, type SnapshotProduct } from "./snapshot";
import { parseTheme, type Theme } from "./theme";

/**
 * Public storefront reads. Runs as the `anon` role, so RLS only exposes live storefronts and the version they
 * currently publish — drafts, unapproved products and private assets are unreachable from here by construction.
 */

export type PublishedStorefront = {
  storefrontId: string;
  tenantId: string;
  slug: string;
  name: string;
  versionId: string;
  versionNo: number;
  publishedAt: Date;
  theme: Theme;
  brand: Brand | null;
  sections: Section[];
  catalog: CatalogSnapshot;
};

type Row = {
  storefront_id: string;
  tenant_id: string;
  slug: string;
  name: string;
  version_id: string;
  version_no: number;
  published_at: Date;
  theme: unknown;
  brand: unknown;
  sections: unknown;
  catalog: unknown;
};

export async function getPublishedStorefront(sql: Sql, slug: string): Promise<PublishedStorefront | null> {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return null;
  const rows = await withActor(sql, { role: "anon" }, (tx) => tx<Row[]>`
    select s.id as storefront_id, s.tenant_id, s.slug, s.name,
           v.id as version_id, v.version_no, v.published_at, v.theme, v.brand, v.sections, v.catalog
    from public.storefronts s
    join public.storefront_versions v on v.id = s.published_version_id
    where s.slug = ${slug}
  `);
  const row = rows[0];
  if (!row) return null;

  // Published content was validated when saved; parse again so a bad row degrades instead of crashing the page.
  const sections = sectionsSchema.safeParse(row.sections);
  const catalog = catalogSnapshotSchema.parse(row.catalog);
  const brand = brandSchema.safeParse(row.brand);
  return {
    storefrontId: row.storefront_id,
    tenantId: row.tenant_id,
    slug: row.slug,
    name: row.name,
    versionId: row.version_id,
    versionNo: row.version_no,
    publishedAt: row.published_at,
    theme: parseTheme(row.theme),
    brand: brand.success ? brand.data : null,
    sections: sections.success ? sections.data : [],
    catalog,
  };
}

export function findProduct(store: PublishedStorefront, productSlug: string): SnapshotProduct | null {
  return store.catalog.products.find((p) => p.slug === productSlug) ?? null;
}

/** Live storefront slugs for the sitemap. */
export async function listLiveStorefronts(sql: Sql): Promise<{ slug: string }[]> {
  return withActor(sql, { role: "anon" }, (tx) => tx<{ slug: string }[]>`
    select slug from public.storefronts where status = 'live' order by slug
  `);
}
