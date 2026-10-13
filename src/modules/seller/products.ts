import { randomUUID } from "node:crypto";
import { z } from "zod";
import { withActor, withPrivileged, type Actor, type Sql, type Tx } from "@/lib/db";
import { DomainError, fromPgError } from "@/lib/errors";
import type { ObjectStorage } from "@/modules/media/storage";
import { slugify } from "./slug";

/**
 * Turns a seller-confirmed product sheet into catalog rows.
 *
 * Every value here was entered or confirmed by the seller in the console (AI suggestions are only pre-filled
 * inputs). Facts that matter to a buyer are also recorded as `seller_statement` evidence with the confirming user.
 */

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine((s) => !/[<>]/.test(s), "Không dùng ký tự < >")
    .transform((s) => (s === "" ? null : s));
const decimal = z
  .string()
  .trim()
  .regex(/^\d{1,10}(\.\d{1,3})?$/, "Số không hợp lệ (tối đa 3 chữ số thập phân)")
  .refine((s) => Number(s) > 0, "Phải lớn hơn 0");
const uuid = z.string().uuid();

export const productSheetSchema = z
  .object({
    jobId: uuid.nullable().default(null),
    photoAssetIds: z.array(uuid).max(8).default([]),
    name: z.string().trim().min(1, "Cần tên sản phẩm").max(200).refine((s) => !/[<>]/.test(s)),
    category: z
      .string()
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
      .max(60)
      .nullable()
      .default(null),
    processing: text(200).nullable().default(null),
    originCountry: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .nullable()
      .default(null),
    originRegion: text(120).nullable().default(null),
    storageInstructions: text(1000).nullable().default(null),
    shelfLifeNote: text(300).nullable().default(null),
    summary: text(300).nullable().default(null),
    description: text(5000).nullable().default(null),
    variant: z
      .object({
        saleUnit: z.enum(["kg", "bag", "box", "carton", "piece"]),
        packNetWeightKg: decimal.nullable().default(null),
        packDescription: text(200).nullable().default(null),
        minOrderQty: decimal,
        orderStepQty: decimal,
      })
      .strict()
      .refine((v) => v.saleUnit !== "kg" || v.packNetWeightKg === null, "Bán theo kg thì không cần khối lượng mỗi gói"),
    price: z.discriminatedUnion("mode", [
      z.object({ mode: z.literal("fixed"), unitPriceVnd: z.string().regex(/^[1-9]\d{0,11}$/, "Giá là số đồng, lớn hơn 0") }).strict(),
      z.object({ mode: z.literal("quote_required") }).strict(),
    ]),
    approve: z.boolean().default(false),
  })
  .strict();
export type ProductSheet = z.input<typeof productSheetSchema>;

async function uniqueSlug(tx: Tx, tenantId: string, base: string): Promise<string> {
  const rows = await tx<{ slug: string }[]>`
    select slug from public.products where tenant_id = ${tenantId} and (slug = ${base} or slug like ${base + "-%"})
  `;
  const taken = new Set(rows.map((r) => r.slug));
  if (!taken.has(base)) return base;
  for (let i = 2; i < 1000; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
  return `${base}-${randomUUID().slice(0, 8)}`;
}

export type CreatedProduct = { productId: string; slug: string; status: "draft" | "approved"; missing: string[] };

export async function createProductFromSheet(
  sql: Sql,
  actor: Actor,
  storage: ObjectStorage,
  tenantId: string,
  input: unknown,
): Promise<CreatedProduct> {
  if (actor.role !== "authenticated") throw new DomainError("forbidden", "Cần đăng nhập");
  const parsed = productSheetSchema.safeParse(input);
  if (!parsed.success) throw new DomainError("invalid", parsed.error.issues[0]?.message ?? "Phiếu sản phẩm chưa hợp lệ", parsed.error.issues);
  const p = parsed.data;
  const userId = actor.userId;

  let created: { productId: string; slug: string };
  try {
    created = await withActor(sql, actor, async (tx) => {
      const [{ ok } = { ok: false }] = await tx<{ ok: boolean }[]>`select private.can_edit_catalog(${tenantId}) as ok`;
      if (!ok) throw new DomainError("forbidden", "Bạn không có quyền sửa danh mục của cửa hàng này");

      if (p.photoAssetIds.length) {
        const owned = await tx<{ n: number }[]>`
          select count(*)::int as n from public.assets
          where tenant_id = ${tenantId} and id = any(${p.photoAssetIds}::uuid[]) and kind = 'product_image'`;
        if (owned[0]?.n !== p.photoAssetIds.length) throw new DomainError("invalid", "Ảnh không thuộc cửa hàng này");
      }

      const slug = await uniqueSlug(tx, tenantId, slugify(p.name));
      const [prod] = await tx<{ id: string }[]>`
        insert into public.products (tenant_id, slug, name, category, processing, summary, description, origin_country,
          origin_region, storage_instructions, shelf_life_note, created_by)
        values (${tenantId}, ${slug}, ${p.name}, ${p.category}, ${p.processing}, ${p.summary}, ${p.description},
          ${p.originCountry}, ${p.originRegion}, ${p.storageInstructions}, ${p.shelfLifeNote}, ${userId})
        returning id`;
      const productId = prod!.id;

      for (const [i, assetId] of p.photoAssetIds.entries()) {
        await tx`insert into public.product_assets (tenant_id, product_id, asset_id, position)
                 values (${tenantId}, ${productId}, ${assetId}, ${i})`;
      }

      const v = p.variant;
      const [variant] = await tx<{ id: string }[]>`
        insert into public.variants (tenant_id, product_id, sale_unit, pack_net_weight_kg, pack_description, min_order_qty, order_step_qty)
        values (${tenantId}, ${productId}, ${v.saleUnit}, ${v.packNetWeightKg}, ${v.packDescription}, ${v.minOrderQty}, ${v.orderStepQty})
        returning id`;

      if (p.price.mode === "fixed") {
        await tx`insert into public.offers (tenant_id, variant_id, price_mode, unit_price_minor, created_by)
                 values (${tenantId}, ${variant!.id}, 'fixed', ${p.price.unitPriceVnd}, ${userId})`;
      } else {
        await tx`insert into public.offers (tenant_id, variant_id, price_mode, created_by)
                 values (${tenantId}, ${variant!.id}, 'quote_required', ${userId})`;
      }

      const statements: [string, string | null][] = [
        ["origin_country", p.originCountry],
        ["origin_region", p.originRegion],
        ["processing", p.processing],
        ["storage_instructions", p.storageInstructions],
        ["shelf_life_note", p.shelfLifeNote],
        ["min_order_qty", `${v.minOrderQty} ${v.saleUnit}`],
        ["pack_net_weight_kg", v.packNetWeightKg],
        ["price", p.price.mode === "fixed" ? `${p.price.unitPriceVnd} VND/${v.saleUnit}` : "quote_required"],
      ];
      for (const [field, value] of statements) {
        if (value === null) continue;
        await tx`insert into public.product_evidence (tenant_id, product_id, field, value, source_type, confirmed_by)
                 values (${tenantId}, ${productId}, ${field}, ${value}, 'seller_statement', ${userId})`;
      }

      if (p.jobId) await tx`select public.link_ai_job_product(${p.jobId}, ${productId})`;
      return { productId, slug };
    });
  } catch (err) {
    throw fromPgError(err) ?? err;
  }

  if (!p.approve) return { ...created, status: "draft", missing: [] };

  if (p.photoAssetIds.length) await publishProductPhotos(sql, storage, { tenantId, userId, productId: created.productId });
  const missing = await approveProduct(sql, actor, created.productId);
  return { ...created, status: missing.length ? "draft" : "approved", missing };
}

export async function approveProduct(sql: Sql, actor: Actor, productId: string): Promise<string[]> {
  try {
    const rows = await withActor(sql, actor, (tx) => tx<{ missing: string[] }[]>`select public.approve_product(${productId}) as missing`);
    return rows[0]?.missing ?? [];
  } catch (err) {
    throw fromPgError(err) ?? err;
  }
}

/**
 * Copies a product's private photos into the public bucket so the storefront can show them.
 * Privileged (clients cannot write public assets), so tenant membership and role are checked explicitly here.
 */
export async function publishProductPhotos(
  sql: Sql,
  storage: ObjectStorage,
  input: { tenantId: string; userId: string; productId: string },
): Promise<number> {
  return withPrivileged(sql, async (tx) => {
    const allowed = await tx<{ ok: boolean }[]>`
      select exists (
        select 1 from public.memberships m join public.tenants t on t.id = m.tenant_id
        where m.tenant_id = ${input.tenantId} and m.user_id = ${input.userId}
          and m.role in ('owner', 'editor') and t.status = 'active'
      ) as ok`;
    if (!allowed[0]?.ok) throw new DomainError("forbidden", "Bạn không có quyền duyệt ảnh của cửa hàng này");

    const photos = await tx<{ id: string; object_key: string; mime_type: string; byte_size: string; sha256: string; width: number | null; height: number | null; position: number; name: string }[]>`
      select a.id, a.object_key, a.mime_type, a.byte_size::text, a.sha256, a.width, a.height, pa.position, p.name
      from public.product_assets pa
      join public.assets a on a.tenant_id = pa.tenant_id and a.id = pa.asset_id
      join public.products p on p.tenant_id = pa.tenant_id and p.id = pa.product_id
      where pa.tenant_id = ${input.tenantId} and pa.product_id = ${input.productId}
        and a.bucket = 'tenant-private' and a.kind = 'product_image'
        and not exists (
          select 1 from public.product_assets pa2 join public.assets a2 on a2.tenant_id = pa2.tenant_id and a2.id = pa2.asset_id
          where pa2.product_id = pa.product_id and a2.visibility = 'public' and a2.sha256 = a.sha256)
      order by pa.position`;

    let n = 0;
    for (const ph of photos) {
      const publicId = randomUUID();
      const key = `${input.tenantId}/products/${publicId}.webp`;
      await storage.copy({ bucket: "tenant-private", key: ph.object_key }, { bucket: "tenant-public", key });
      await tx`
        insert into public.assets (id, tenant_id, kind, bucket, object_key, mime_type, byte_size, sha256, width, height,
          alt_text, visibility, review_status, uploaded_by)
        values (${publicId}, ${input.tenantId}, 'product_image', 'tenant-public', ${key}, ${ph.mime_type}, ${ph.byte_size},
          ${ph.sha256}, ${ph.width}, ${ph.height}, ${ph.name.slice(0, 300)}, 'public', 'approved', ${input.userId})`;
      await tx`update public.assets set review_status = 'approved' where tenant_id = ${input.tenantId} and id = ${ph.id}`;
      await tx`insert into public.product_assets (tenant_id, product_id, asset_id, position)
               values (${input.tenantId}, ${input.productId}, ${publicId}, ${ph.position})`;
      n++;
    }
    return n;
  });
}

export type ConsoleProduct = {
  id: string;
  slug: string;
  name: string;
  status: "draft" | "approved" | "archived";
  photoAssetId: string | null;
  priceMode: "fixed" | "quote_required" | null;
};

export async function listProducts(sql: Sql, actor: Actor, tenantId: string): Promise<ConsoleProduct[]> {
  return withActor(sql, actor, (tx) => tx<ConsoleProduct[]>`
    select p.id, p.slug, p.name, p.status,
      (select pa.asset_id from public.product_assets pa join public.assets a on a.tenant_id = pa.tenant_id and a.id = pa.asset_id
        where pa.product_id = p.id and a.bucket = 'tenant-private' order by pa.position limit 1) as "photoAssetId",
      (select o.price_mode from public.variants v join public.offers o on o.tenant_id = v.tenant_id and o.variant_id = v.id
        where v.product_id = p.id order by o.valid_from desc limit 1) as "priceMode"
    from public.products p
    where p.tenant_id = ${tenantId}
    order by p.created_at desc
    limit 100`);
}
