/** Canonical URL helpers. SITE_URL is the single canonical origin for storefront pages. */

export function siteUrl(): string {
  return (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

export function storefrontPath(storeSlug: string): string {
  return `/s/${storeSlug}`;
}

export function productPath(storeSlug: string, productSlug: string): string {
  return `/s/${storeSlug}/san-pham/${productSlug}`;
}

export function absoluteUrl(path: string): string {
  return `${siteUrl()}${path}`;
}

/** Public URL of an approved asset in the tenant-public bucket, or null when storage is not configured. */
export function publicAssetUrl(objectKey: string): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  const key = objectKey.split("/").map(encodeURIComponent).join("/");
  return `${base.replace(/\/+$/, "")}/storage/v1/object/public/tenant-public/${key}`;
}
