import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { StorefrontShell } from "@/components/storefront/StorefrontShell";
import { SectionList } from "@/components/storefront/Sections";
import { getSql } from "@/lib/db";
import { absoluteUrl, storefrontPath } from "@/lib/site";
import { getPublishedStorefront } from "@/modules/storefront/public-read";
import { organizationJsonLd, serializeJsonLd } from "@/modules/seo/jsonld";

// Rendered per request from the published version; no shared cache is keyed without tenant + version yet.
export const dynamic = "force-dynamic";

const loadStore = cache((slug: string) => getPublishedStorefront(getSql(), slug));

type Props = { params: Promise<{ storeSlug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { storeSlug } = await params;
  const store = await loadStore(storeSlug);
  if (!store) return {};
  const name = store.brand?.businessName ?? store.name;
  const hero = store.sections.find((s) => s.type === "hero_split");
  return {
    title: name,
    description: store.brand?.tagline ?? (hero?.type === "hero_split" ? hero.body : undefined),
    alternates: { canonical: absoluteUrl(storefrontPath(store.slug)) },
    // Demo stores are not real businesses; keep them out of search indexes.
    robots: store.brand?.isDemo ? { index: false, follow: false } : undefined,
  };
}

export default async function StorefrontPage({ params }: Props) {
  const { storeSlug } = await params;
  const store = await loadStore(storeSlug);
  if (!store) notFound();

  const jsonLd = organizationJsonLd({ name: store.name, url: absoluteUrl(storefrontPath(store.slug)), brand: store.brand });
  return (
    <StorefrontShell store={store}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
      <SectionList store={store} />
    </StorefrontShell>
  );
}
