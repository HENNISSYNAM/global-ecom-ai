import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { extractPage, robotsDisallows, type ExtractedPage } from "./extract";

export type CrawlOptions = {
  startUrls: string[];
  outDir: string;
  maxPages?: number;
  maxImages?: number;
  maxImageBytes?: number;
  delayMs?: number;
  fetchImpl?: typeof fetch;
};

export type CrawlResult = {
  host: string;
  pages: ExtractedPage[];
  images: { url: string; file: string; sha256: string; bytes: number; contentType: string }[];
  skipped: { url: string; reason: string }[];
};

const USER_AGENT = "global-ecom-ai-importer/0.1 (seller-authorized catalog import)";
const SKIP_EXT = /\.(pdf|zip|rar|docx?|xlsx?|pptx?|mp4|mp3|jpg|jpeg|png|webp|gif|svg|css|js)(\?|$)/i;
const IMAGE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/**
 * Breadth-first crawl of ONE host, politely (robots.txt, delay, page/image caps). Intended for importing a
 * seller's own website with their permission; results are written for review, not published.
 */
export async function crawlSite(opts: CrawlOptions): Promise<CrawlResult> {
  const f = opts.fetchImpl ?? fetch;
  const maxPages = opts.maxPages ?? 60;
  const maxImages = opts.maxImages ?? 200;
  const maxImageBytes = opts.maxImageBytes ?? 5 * 1024 * 1024;
  const delay = opts.delayMs ?? 500;
  const first = new URL(opts.startUrls[0]!);
  const host = first.host;
  const origin = first.origin;

  let disallow: string[] = [];
  try {
    const r = await f(`${origin}/robots.txt`, { headers: { "User-Agent": USER_AGENT } });
    if (r.ok) disallow = robotsDisallows(await r.text());
  } catch {
    // No robots.txt reachable: crawl with the defaults.
  }
  const allowed = (u: URL) => u.host === host && !disallow.some((d) => u.pathname.startsWith(d));

  const queue = [...opts.startUrls];
  const seen = new Set<string>(queue);
  const result: CrawlResult = { host, pages: [], images: [], skipped: [] };

  while (queue.length && result.pages.length < maxPages) {
    const url = queue.shift()!;
    const u = new URL(url);
    if (!allowed(u)) {
      result.skipped.push({ url, reason: "robots.txt or other host" });
      continue;
    }
    try {
      const res = await f(url, { headers: { "User-Agent": USER_AGENT }, redirect: "follow" });
      const type = res.headers.get("content-type") ?? "";
      if (!res.ok || !type.includes("text/html")) {
        result.skipped.push({ url, reason: `HTTP ${res.status} ${type}` });
        continue;
      }
      const page = extractPage(res.url || url, await res.text());
      result.pages.push(page);
      for (const link of page.links) {
        const l = new URL(link);
        l.search = l.search.includes("page=") ? l.search : "";
        const key = l.toString();
        if (!seen.has(key) && l.host === host && !SKIP_EXT.test(l.pathname)) {
          seen.add(key);
          queue.push(key);
        }
      }
    } catch (err) {
      result.skipped.push({ url, reason: (err as Error).message });
    }
    if (delay) await new Promise((r) => setTimeout(r, delay));
  }

  const imageDir = join(opts.outDir, "images");
  await mkdir(imageDir, { recursive: true });
  const wanted = [...new Set(result.pages.flatMap((p) => [...(p.product?.imageUrls ?? []), ...p.images.map((i) => i.url)]))];
  for (const url of wanted.slice(0, maxImages)) {
    try {
      const res = await f(url, { headers: { "User-Agent": USER_AGENT } });
      const contentType = (res.headers.get("content-type") ?? "").split(";")[0]!.trim();
      const ext = IMAGE_TYPES[contentType];
      if (!res.ok || !ext) {
        result.skipped.push({ url, reason: `image HTTP ${res.status} ${contentType}` });
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > maxImageBytes) {
        result.skipped.push({ url, reason: `image too large (${buf.length} bytes)` });
        continue;
      }
      const sha256 = createHash("sha256").update(buf).digest("hex");
      const file = `images/${sha256}.${ext}`;
      await writeFile(join(opts.outDir, file), buf);
      result.images.push({ url, file, sha256, bytes: buf.length, contentType });
    } catch (err) {
      result.skipped.push({ url, reason: (err as Error).message });
    }
  }

  await writeFile(join(opts.outDir, "crawl.json"), JSON.stringify(result, null, 2));
  await writeFile(join(opts.outDir, "REVIEW.md"), reviewReport(result));
  return result;
}

export function reviewReport(r: CrawlResult): string {
  const products = r.pages.filter((p) => p.product);
  const imageFile = new Map(r.images.map((i) => [i.url, i.file]));
  const lines = [
    `# Dữ liệu nhập từ ${r.host} — CHỜ NGƯỜI BÁN XÁC NHẬN`,
    "",
    "Mọi thông tin dưới đây là nội dung website hiện có, chưa được xác nhận. Không xuất bản giá, xuất xứ, chứng nhận,",
    "công suất hay quy cách cho tới khi người bán duyệt từng sản phẩm.",
    "",
    `- Trang đã đọc: ${r.pages.length}`,
    `- Ảnh đã tải: ${r.images.length}`,
    `- Bỏ qua: ${r.skipped.length}`,
    `- Trang có dấu hiệu là sản phẩm: ${products.length}`,
    "",
    "## Sản phẩm phát hiện",
  ];
  for (const p of products) {
    const prod = p.product!;
    lines.push(
      "",
      `### ${prod.name}`,
      `- Nguồn: ${p.url} (${prod.source})`,
      `- Giá trên website: ${prod.priceText ?? (prod.contactForPrice ? "Liên hệ" : "không thấy")}`,
      `- Ảnh: ${prod.imageUrls.map((u) => imageFile.get(u) ?? u).join(", ") || "không có"}`,
      `- Cần người bán xác nhận: xuất xứ, mức sơ chế, quy cách, đơn vị bán, số lượng tối thiểu, bảo quản, giá/báo giá`,
    );
  }
  lines.push("", "## Trang khác", ...r.pages.filter((p) => !p.product).map((p) => `- ${p.title ?? p.url} — ${p.url}`));
  return lines.join("\n") + "\n";
}
