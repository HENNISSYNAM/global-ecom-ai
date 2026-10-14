import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DomainError } from "@/lib/errors";
import { claimNextJob, completeJob, getJobForSeller, processJob, runPendingJobs } from "@/modules/ai/jobs";
import { sanitizeDraft } from "@/modules/ai/product-draft";
import { MockVisionProvider, type VisionProvider } from "@/modules/ai/vision";
import type { Bucket, ObjectStorage } from "@/modules/media/storage";
import { uploadProductPhotos } from "@/modules/seller/photos";
import { createProductFromSheet } from "@/modules/seller/products";
import { createShop, listMyShops } from "@/modules/seller/shops";
import { getDraft, publishStorefront } from "@/modules/storefront/draft";
import { getPublishedStorefront } from "@/modules/storefront/public-read";
import { connect, IDS, resetTestDatabase } from "../db/helpers";

// Services commit, so the database is reset around this file.
const sql = connect();
const editorA = { role: "authenticated", userId: IDS.editorA } as const;
const ownerA = { role: "authenticated", userId: IDS.ownerA } as const;
const viewerA = { role: "authenticated", userId: IDS.viewerA } as const;
const ownerB = { role: "authenticated", userId: IDS.ownerB } as const;

class MemoryStorage implements ObjectStorage {
  readonly kind = "local" as const;
  readonly objects = new Map<string, Buffer>();
  async put(bucket: Bucket, key: string, data: Buffer) {
    if (this.objects.has(`${bucket}/${key}`)) throw new Error("exists");
    this.objects.set(`${bucket}/${key}`, data);
  }
  async get(bucket: Bucket, key: string) {
    const v = this.objects.get(`${bucket}/${key}`);
    if (!v) throw new Error("missing");
    return v;
  }
  async copy(from: { bucket: Bucket; key: string }, to: { bucket: Bucket; key: string }) {
    await this.put(to.bucket, to.key, await this.get(from.bucket, from.key));
  }
}

const storage = new MemoryStorage();

async function photo(r: number, g: number, b: number, exif = false): Promise<Buffer> {
  let img = sharp({ create: { width: 640, height: 480, channels: 3, background: { r, g, b } } }).jpeg();
  if (exif) img = img.withExif({ IFD0: { Copyright: "secret owner", Make: "PhoneCam" } });
  return img.toBuffer();
}

/** Provider that answers like a careless model: it "knows" origin, price and makes claims. */
class OverconfidentProvider implements VisionProvider {
  readonly name = "openai_compatible" as const;
  readonly model = "test-vision";
  readonly promptVersion = "test";
  readonly isMock = false;
  calls = 0;
  async analyzeProductImages(images: { assetId: string; data: Buffer }[]) {
    this.calls++;
    const a = images[0]!.assetId;
    return {
      raw: {
        observations: [{ text: "Các tép tỏi trắng đã bóc vỏ, đều cỡ", assetId: a }, { text: "Ảnh từ trang khác", assetId: "not-in-job" }],
        fields: {
          name: { value: "Tỏi bóc vỏ <b>Lý Sơn</b>", status: "observed", evidenceAssetIds: [a, "foreign-id"] },
          category: { value: "Tỏi", status: "suggested" },
          processing: { value: "Bóc vỏ, để nguyên tép", status: "observed", evidenceAssetIds: [a] },
          originCountry: { value: "VN", status: "observed" },
          priceVnd: { value: "55000", status: "suggested" },
          packNetWeightKg: { value: "1", status: "suggested" },
          description: { value: "Tỏi sạch nhất, 100% hữu cơ. Xem https://example.com", status: "suggested" },
          storageInstructions: { value: "Bảo quản ngăn mát", status: "suggested" },
        },
        questions: ["Nguồn tỏi ở đâu?"],
      },
      usage: { inputTokens: 10, outputTokens: 5 },
    };
  }
}

class FailingProvider implements VisionProvider {
  readonly name = "openai_compatible" as const;
  readonly model = "broken";
  readonly promptVersion = "test";
  readonly isMock = false;
  async analyzeProductImages(): Promise<never> {
    throw new Error("AI provider responded 503");
  }
}

beforeAll(() => resetTestDatabase());
afterAll(async () => {
  await sql.end();
  await resetTestDatabase();
});

async function expectDomainError(p: Promise<unknown>, code: DomainError["code"]) {
  const err = await p.then(() => null, (e: unknown) => e);
  expect(err).toBeInstanceOf(DomainError);
  expect((err as DomainError).code).toBe(code);
}

describe("photo upload", () => {
  it("re-encodes photos without metadata and queues one analysis job per set of photos", async () => {
    const files = [await photo(240, 240, 230, true), await photo(200, 190, 180)];
    const first = await uploadProductPhotos(sql, editorA, storage, { tenantId: IDS.tenantA, files, sellerNote: "Tỏi bóc vỏ" });
    expect(first.photos).toHaveLength(2);

    const stored = await storage.get("tenant-private", `${IDS.tenantA}/uploads/${first.photos[0]!.id}.webp`);
    const meta = await sharp(stored).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.exif).toBeUndefined();

    // Same photos again: new asset rows, same job (input hash of the re-encoded bytes).
    const again = await uploadProductPhotos(sql, editorA, storage, { tenantId: IDS.tenantA, files });
    expect(again.jobId).toBe(first.jobId);

    const job = await getJobForSeller(sql, editorA, first.jobId);
    expect(job).toMatchObject({ status: "queued", tenantId: IDS.tenantA, assetIds: first.photos.map((p) => p.id) });
  });

  it("rejects files that are not images, and viewers or other tenants", async () => {
    await expectDomainError(
      uploadProductPhotos(sql, editorA, storage, { tenantId: IDS.tenantA, files: [Buffer.from("<script>")] }),
      "invalid",
    );
    const files = [await photo(10, 120, 10)];
    const before = storage.objects.size;
    await expectDomainError(uploadProductPhotos(sql, viewerA, storage, { tenantId: IDS.tenantA, files }), "forbidden");
    await expectDomainError(uploadProductPhotos(sql, ownerB, storage, { tenantId: IDS.tenantA, files }), "forbidden");
    expect(storage.objects.size).toBe(before);
  });

  it("jobs and photos of one tenant are invisible to another", async () => {
    const [{ id: jobId } = { id: "" }] = await sql<{ id: string }[]>`select id from ai_jobs limit 1`;
    await expectDomainError(getJobForSeller(sql, ownerB, jobId), "not_found");
    const assetIds = (await sql<{ id: string }[]>`select id from assets where tenant_id = ${IDS.tenantA} limit 1`).map((r) => r.id);
    // B cannot enqueue A's photos, even by calling the function directly.
    const err = await sql
      .begin(async (tx) => {
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ role: "authenticated", sub: IDS.ownerB })}, true)`;
        await tx.unsafe("set local role authenticated");
        await tx`select public.enqueue_product_analysis(${assetIds}::uuid[])`;
      })
      .then(() => null, (e: { code?: string }) => e);
    expect(err?.code).toBe("P0002");
    const anonErr = await sql
      .begin(async (tx) => {
        await tx.unsafe("set local role anon");
        await tx`select 1 from public.ai_jobs`;
      })
      .then(() => null, (e: { code?: string }) => e);
    expect(anonErr?.code).toBe("42501");
  });
});

describe("analysis worker", () => {
  it("stores a sanitized draft: photo-unprovable facts, claims, links and foreign evidence are removed", async () => {
    const provider = new OverconfidentProvider();
    expect(await runPendingJobs(sql, { storage, provider }, 5)).toBe(1);
    const [row] = await sql<{ id: string }[]>`select id from ai_jobs where status = 'succeeded'`;
    const job = await getJobForSeller(sql, editorA, row!.id);
    const f = job.draft!.fields;
    expect(f.name.value).toBe("Tỏi bóc vỏ"); // markup and the unprovable place name dropped
    expect(f.name.evidenceAssetIds).toEqual([job.assetIds[0]]);
    expect(f.category.value).toBe("toi");
    expect(f.originCountry).toEqual({ value: null, status: "needs_confirmation", evidenceAssetIds: [] });
    expect(f.priceVnd.value).toBeNull();
    expect(f.packNetWeightKg.value).toBeNull();
    expect(f.description.value).not.toMatch(/nhất|100|hữu cơ|https/);
    expect(job.draft!.claimWarnings).toEqual(expect.arrayContaining(["hữu cơ", "cam kết 100%", "địa danh xuất xứ"]));
    expect(job.draft!.observations).toHaveLength(2);
    expect(job.draft!.observations[1]!.assetId).toBeNull();
    expect(job.draft!.mock).toBe(false);
  });

  it("retries with backoff, then dead-letters; the seller can queue it again", async () => {
    const up = await uploadProductPhotos(sql, editorA, storage, { tenantId: IDS.tenantA, files: [await photo(90, 60, 30)] });
    const failing = new FailingProvider();
    for (let attempt = 1; attempt <= 3; attempt++) {
      await sql`update ai_jobs set run_after = now() where id = ${up.jobId}`;
      await runPendingJobs(sql, { storage, provider: failing }, 1);
      const [j] = await sql<{ status: string; attempts: number; last_error: string }[]>`
        select status, attempts, last_error from ai_jobs where id = ${up.jobId}`;
      expect(j).toMatchObject({ attempts: attempt, status: attempt < 3 ? "queued" : "dead", last_error: "AI provider responded 503" });
    }
    // Nothing runnable is left: dead jobs are not retried automatically.
    expect(await runPendingJobs(sql, { storage, provider: failing }, 1)).toBe(0);

    const again = await uploadProductPhotos(sql, editorA, storage, { tenantId: IDS.tenantA, files: [await photo(90, 60, 30)] });
    expect(again.jobId).toBe(up.jobId);
    const view = await getJobForSeller(sql, editorA, up.jobId);
    expect(view).toMatchObject({ status: "queued", attempts: 0 });
  });

  it("a worker whose lease expired cannot overwrite the newer attempt", async () => {
    const [j] = await sql<{ id: string }[]>`select id from ai_jobs where status = 'queued' limit 1`;
    await sql`update ai_jobs set run_after = now() where id = ${j!.id}`;
    const first = await claimNextJob(sql);
    expect(first?.id).toBe(j!.id);
    await sql`update ai_jobs set lease_until = now() - interval '1 second' where id = ${j!.id}`;
    const second = await claimNextJob(sql);
    expect(second).toMatchObject({ id: j!.id, attempts: first!.attempts + 1 });

    const draft = sanitizeDraft({}, [], { mock: true });
    expect(await completeJob(sql, first!, { output: draft, provider: "x", model: "x", promptVersion: "x", usage: null })).toBe(false);
    expect(await processJob(sql, second!, { storage, provider: new MockVisionProvider() })).toBe("succeeded");
    const view = await getJobForSeller(sql, editorA, j!.id);
    expect(view.draft?.mock).toBe(true);
  });
});

describe("product sheet → catalog → storefront", () => {
  const sheet = (over: Record<string, unknown> = {}) => ({
    name: "Tỏi bóc vỏ",
    category: "toi",
    processing: "Bóc vỏ, để nguyên tép",
    originCountry: "VN",
    originRegion: "Hải Dương",
    storageInstructions: "Ngăn mát 0–5°C",
    summary: "Tỏi bóc vỏ sẵn cho bếp ăn",
    variant: { saleUnit: "bag", packNetWeightKg: "0.5", minOrderQty: "20", orderStepQty: "10" },
    price: { mode: "quote_required" },
    approve: true,
    ...over,
  });

  it("creates product, variant, offer and seller evidence; approval publishes the photos", async () => {
    const [job] = await sql<{ id: string }[]>`select j.id from ai_jobs j where j.status = 'succeeded' and j.output->'fields'->'name'->>'value' = 'Tỏi bóc vỏ'`;
    const photoIds = (await getJobForSeller(sql, editorA, job!.id)).assetIds;
    const res = await createProductFromSheet(sql, editorA, storage, IDS.tenantA, sheet({ jobId: job!.id, photoAssetIds: photoIds }));
    expect(res).toMatchObject({ status: "approved", missing: [], slug: "toi-boc-vo" });

    const [offer] = await sql<{ price_mode: string; unit_price_minor: bigint | null }[]>`
      select o.price_mode, o.unit_price_minor from offers o join variants v on v.id = o.variant_id where v.product_id = ${res.productId}`;
    expect(offer).toEqual({ price_mode: "quote_required", unit_price_minor: null });
    const [v] = await sql<{ pack: string; moq: string }[]>`
      select pack_net_weight_kg::text as pack, min_order_qty::text as moq from variants where product_id = ${res.productId}`;
    expect(v).toEqual({ pack: "0.500", moq: "20.000" });
    const evidence = await sql<{ field: string; confirmed_by: string }[]>`
      select field, confirmed_by from product_evidence where product_id = ${res.productId} order by field`;
    expect(evidence.map((e) => e.field)).toEqual(expect.arrayContaining(["origin_country", "price", "storage_instructions"]));
    expect(evidence.every((e) => e.confirmed_by === IDS.editorA)).toBe(true);
    expect((await getJobForSeller(sql, editorA, job!.id)).productId).toBe(res.productId);

    const publicAssets = await sql<{ object_key: string }[]>`
      select a.object_key from product_assets pa join assets a on a.id = pa.asset_id
      where pa.product_id = ${res.productId} and a.visibility = 'public'`;
    expect(publicAssets).toHaveLength(photoIds.length);
    for (const a of publicAssets) expect(storage.objects.has(`tenant-public/${a.object_key}`)).toBe(true);

    // Not public until the storefront is published; then the snapshot carries the product and its public photos.
    expect((await getPublishedStorefront(sql, "vuon-mau-demo"))!.catalog.products.some((p) => p.slug === "toi-boc-vo")).toBe(false);
    const sf = await sql<{ id: string }[]>`select id from storefronts where slug = 'vuon-mau-demo'`;
    const draft = await getDraft(sql, ownerA, sf[0]!.id);
    await publishStorefront(sql, ownerA, sf[0]!.id, draft.revision);
    const pub = await getPublishedStorefront(sql, "vuon-mau-demo");
    const p = pub!.catalog.products.find((x) => x.slug === "toi-boc-vo")!;
    expect(p.imageAssetIds).toHaveLength(photoIds.length);
    expect(p.variants[0]!.offer).toMatchObject({ priceMode: "quote_required", unitPriceMinor: null });
  });

  it("fixed prices are stored as integer đồng; a second product with the same name gets a new slug", async () => {
    const res = await createProductFromSheet(sql, editorA, storage, IDS.tenantA, sheet({ price: { mode: "fixed", unitPriceVnd: "55000" }, approve: false }));
    expect(res).toMatchObject({ status: "draft", slug: "toi-boc-vo-2" });
    const [o] = await sql<{ unit_price_minor: bigint }[]>`
      select o.unit_price_minor from offers o join variants v on v.id = o.variant_id where v.product_id = ${res.productId}`;
    expect(o!.unit_price_minor).toBe(55000n);
  });

  it("does not approve without origin, and returns what is missing", async () => {
    const res = await createProductFromSheet(sql, editorA, storage, IDS.tenantA, sheet({ name: "Gừng gọt vỏ", originCountry: null }));
    expect(res.status).toBe("draft");
    expect(res.missing).toContain("origin_country");
  });

  it("rejects other tenants, foreign photos, bad numbers and markup", async () => {
    await expectDomainError(createProductFromSheet(sql, ownerB, storage, IDS.tenantA, sheet()), "forbidden");
    await expectDomainError(createProductFromSheet(sql, viewerA, storage, IDS.tenantA, sheet()), "forbidden");
    const aPhoto = (await sql<{ id: string }[]>`select id from assets where tenant_id = ${IDS.tenantA} and bucket = 'tenant-private' limit 1`)[0]!.id;
    await expectDomainError(createProductFromSheet(sql, ownerB, storage, IDS.tenantB, sheet({ photoAssetIds: [aPhoto] })), "invalid");
    await expectDomainError(
      createProductFromSheet(sql, editorA, storage, IDS.tenantA, sheet({ variant: { saleUnit: "kg", minOrderQty: "1.2345", orderStepQty: "1" } })),
      "invalid",
    );
    await expectDomainError(createProductFromSheet(sql, editorA, storage, IDS.tenantA, sheet({ price: { mode: "fixed", unitPriceVnd: "0" } })), "invalid");
    await expectDomainError(createProductFromSheet(sql, editorA, storage, IDS.tenantA, sheet({ name: "<img src=x>" })), "invalid");
  });
});

describe("shops", () => {
  it("a signed-in user creates a shop with a starter storefront and becomes its owner", async () => {
    const userC = "00000000-0000-4000-8000-0000000000c1";
    await sql`insert into auth.users (id, email) values (${userC}, 'c@example.test') on conflict do nothing`;
    const actor = { role: "authenticated", userId: userC } as const;
    const { tenantId } = await createShop(sql, actor, { name: "Hà Thịnh Phát (thử)", slug: "ha-thinh-phat-thu" });
    const shops = await listMyShops(sql, actor);
    expect(shops).toEqual([expect.objectContaining({ tenantId, role: "owner", storefrontSlug: "ha-thinh-phat-thu", storefrontStatus: "draft" })]);
    await expectDomainError(createShop(sql, actor, { name: "Trùng", slug: "vuon-mau-demo" }), "conflict");
    // Not public before publishing.
    expect(await getPublishedStorefront(sql, "ha-thinh-phat-thu")).toBeNull();
  });
});
