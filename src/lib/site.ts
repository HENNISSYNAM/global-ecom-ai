/** Canonical URL helpers. SITE_URL is the single canonical origin for storefront pages. */

/**
 * Accepts "https://shop.vn", "shop.vn" or "shop.vn/" (a common copy-paste in hosting dashboards) and falls back to
 * Vercel's own production hostname, then localhost. Never throws: an invalid value must not break the build.
 */
export function siteUrl(env: Record<string, string | undefined> = process.env): string {
  for (const raw of [env.SITE_URL, env.VERCEL_PROJECT_PRODUCTION_URL, env.VERCEL_URL]) {
    const v = raw?.trim();
    if (!v) continue;
    try {
      const url = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
      return url.origin;
    } catch {
      // try the next candidate
    }
  }
  return "http://localhost:3000";
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
  const key = objectKey.split("/").map(encodeURIComponent).join("/");
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Development without Supabase Storage: approved images live on disk (see modules/media/storage.ts).
  if (!base) return process.env.NODE_ENV === "production" ? null : `/api/local-media/${key}`;
  return `${base.replace(/\/+$/, "")}/storage/v1/object/public/tenant-public/${key}`;
}
