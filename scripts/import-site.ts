// Crawl a seller's own website into a review bundle (pages, product candidates, images).
// Usage: npx tsx scripts/import-site.ts https://nongsanthinhphat.com/ [--max-pages 60]
// Output: data/imports/<host>/<timestamp>/{crawl.json,REVIEW.md,images/}. Nothing is written to the database.
import { join } from "node:path";
import { crawlSite } from "../src/modules/importer/crawl";

const args = process.argv.slice(2);
const start = args.find((a) => a.startsWith("http"));
if (!start) {
  console.error("Usage: npx tsx scripts/import-site.ts <https://site/> [--max-pages N]");
  process.exit(1);
}
const maxIdx = args.indexOf("--max-pages");
const maxPages = maxIdx >= 0 ? Number(args[maxIdx + 1]) : 60;
const host = new URL(start).host;
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outDir = join("data", "imports", host, stamp);

const result = await crawlSite({ startUrls: [start, new URL("/gioi-thieu", start).toString()], outDir, maxPages });
console.log(`pages=${result.pages.length} products=${result.pages.filter((p) => p.product).length} images=${result.images.length} skipped=${result.skipped.length}`);
console.log(`review: ${join(outDir, "REVIEW.md")}`);
