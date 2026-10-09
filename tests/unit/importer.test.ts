import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crawlSite } from "@/modules/importer/crawl";
import { extractPage, robotsDisallows } from "@/modules/importer/extract";

// 1x1 PNG
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

const pages: Record<string, string> = {
  "/": `<html><head><title>Nông sản mẫu</title></head><body>
    <nav><a href="/gioi-thieu">Giới thiệu</a><a href="/san-pham/toi-boc-vo">Tỏi</a><a href="/san-pham/hanh">Hành</a>
    <a href="/admin/bi-mat">Admin</a><a href="https://other.example/x">Ngoài</a><a href="/tai-lieu.pdf">PDF</a></nav>
    <main><h1>Trang chủ</h1><img src="/img/logo.png" alt="Logo"><img src="/pixel.gif" width="1"></main></body></html>`,
  "/gioi-thieu": `<html><head><title>Giới thiệu</title><meta name="description" content="Về chúng tôi"></head>
    <body><main><h1>Giới thiệu</h1><p>Cơ sở sơ chế nông sản.</p></main></body></html>`,
  "/san-pham/toi-boc-vo": `<html><head><title>Tỏi bóc vỏ</title></head><body><main>
    <h1>Tỏi bóc vỏ</h1><img data-src="/img/toi.png" src="/placeholder.gif" alt="Tỏi"><p>Giá: Liên hệ</p></main></body></html>`,
  "/san-pham/hanh": `<html><head><title>Hành</title><script type="application/ld+json">
    {"@context":"https://schema.org","@type":"Product","name":"Hành bóc vỏ","image":"/img/hanh.png","offers":{"price":"0","priceCurrency":"VND"}}
    </script></head><body><main><h1>Hành bóc vỏ</h1></main></body></html>`,
  "/admin/bi-mat": `<html><body><h1>Không được vào</h1></body></html>`,
};

let server: Server;
let base = "";
let outDir = "";
const requested: string[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    requested.push(req.url ?? "");
    if (req.url === "/robots.txt") return res.end("User-agent: *\nDisallow: /admin\n");
    if (req.url?.startsWith("/img/")) {
      res.setHeader("content-type", "image/png");
      return res.end(PNG);
    }
    const html = pages[req.url ?? ""];
    if (!html) {
      res.statusCode = 404;
      return res.end("not found");
    }
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(html);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const addr = server.address() as { port: number };
  base = `http://127.0.0.1:${addr.port}`;
  outDir = await mkdtemp(join(tmpdir(), "import-"));
});

afterAll(async () => {
  server.close();
  await rm(outDir, { recursive: true, force: true });
});

describe("site importer", () => {
  it("crawls one host politely and writes a review bundle", async () => {
    const result = await crawlSite({ startUrls: [`${base}/`], outDir, delayMs: 0 });

    const urls = result.pages.map((p) => new URL(p.url).pathname).sort();
    expect(urls).toEqual(["/", "/gioi-thieu", "/san-pham/hanh", "/san-pham/toi-boc-vo"]);
    expect(requested).not.toContain("/admin/bi-mat"); // robots.txt respected
    expect(requested).not.toContain("/tai-lieu.pdf");

    const toi = result.pages.find((p) => p.product?.name === "Tỏi bóc vỏ")!.product!;
    expect(toi).toMatchObject({ contactForPrice: true, priceText: null, source: "page" });
    expect(toi.imageUrls[0]).toBe(`${base}/img/toi.png`); // lazy-loaded src preferred

    // A JSON-LD price of 0 is "contact for price", never a real price.
    const hanh = result.pages.find((p) => p.product?.name === "Hành bóc vỏ")!.product!;
    expect(hanh).toMatchObject({ contactForPrice: true, priceText: null, source: "json-ld" });

    expect(result.images.map((i) => new URL(i.url).pathname).sort()).toEqual(["/img/hanh.png", "/img/logo.png", "/img/toi.png"]);
    const review = await readFile(join(outDir, "REVIEW.md"), "utf8");
    expect(review).toContain("CHỜ NGƯỜI BÁN XÁC NHẬN");
    expect(review).toContain("### Tỏi bóc vỏ");
    expect(review).toContain("Giá trên website: Liên hệ");
  });
});

describe("extraction helpers", () => {
  it("reads robots.txt disallow rules for all agents only", () => {
    expect(robotsDisallows("User-agent: bot\nDisallow: /x\nUser-agent: *\nDisallow: /admin\nDisallow:\n")).toEqual(["/admin"]);
  });

  it("picks up a printed VND price", () => {
    const page = extractPage("https://a.test/p", "<html><body><main><h1>Gừng</h1><p>Giá 45.000đ/kg</p></main></body></html>");
    expect(page.product).toMatchObject({ name: "Gừng", priceText: "45.000đ", contactForPrice: false });
  });

  it("ignores non-http links", () => {
    const page = extractPage("https://a.test/", '<a href="javascript:alert(1)">x</a><a href="tel:0123">y</a><a href="/ok">z</a>');
    expect(page.links).toEqual(["https://a.test/ok"]);
  });
});
