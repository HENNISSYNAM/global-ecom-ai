import { z } from "zod";
import { withActor, type Actor, type Sql } from "@/lib/db";
import { DomainError, fromPgError } from "@/lib/errors";
import type { Section } from "@/modules/storefront/sections";

export type MyShop = {
  tenantId: string;
  tenantName: string;
  role: "owner" | "editor" | "sales" | "viewer";
  isDemo: boolean;
  storefrontId: string | null;
  storefrontSlug: string | null;
  storefrontStatus: string | null;
  draftRevision: number | null;
};

/** Shops the signed-in user belongs to. RLS returns only their own memberships. */
export async function listMyShops(sql: Sql, actor: Actor): Promise<MyShop[]> {
  if (actor.role !== "authenticated") return [];
  return withActor(sql, actor, (tx) => tx<MyShop[]>`
    select t.id as "tenantId", t.name as "tenantName", m.role, t.is_demo as "isDemo",
      s.id as "storefrontId", s.slug as "storefrontSlug", s.status::text as "storefrontStatus",
      d.revision as "draftRevision"
    from public.memberships m
    join public.tenants t on t.id = m.tenant_id
    left join lateral (select * from public.storefronts s where s.tenant_id = t.id order by s.created_at limit 1) s on true
    left join public.storefront_versions d on d.storefront_id = s.id and d.kind = 'draft'
    where m.user_id = ${actor.userId}
    order by t.created_at`);
}

export const newShopSchema = z
  .object({
    name: z.string().trim().min(2, "Tên cửa hàng cần ít nhất 2 ký tự").max(120).refine((s) => !/[<>]/.test(s)),
    slug: z
      .string()
      .trim()
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Địa chỉ chỉ gồm chữ thường không dấu, số và dấu gạch ngang")
      .min(3)
      .max(60),
  })
  .strict();

/**
 * Starter layout following the editorial pattern learned from Cocoon: split hero → one row per product group →
 * RFQ. Story and FAQ are added once the seller writes them. Text is neutral and contains no seller facts.
 */
export function starterSections(shopName: string): Section[] {
  return [
    {
      type: "hero_split",
      id: "mo-dau",
      eyebrow: shopName.slice(0, 60),
      titleLead: "Nông sản",
      titleEmphasis: "sơ chế sẵn",
      body: "Người bán đang cập nhật giới thiệu cửa hàng.",
      cta: { label: "Xem sản phẩm", target: "catalog" },
      imageSide: "left",
    },
    { type: "category_rows", id: "nhom-hang", title: "Nhóm hàng" },
    { type: "rfq_cta", id: "hoi-gia", title: "Cần báo giá sỉ?", body: "Gửi mặt hàng, quy cách, số lượng và nơi giao — người bán sẽ báo giá.", buttonLabel: "Gửi yêu cầu báo giá" },
  ];
}

export async function createShop(sql: Sql, actor: Actor, input: unknown): Promise<{ tenantId: string; storefrontId: string }> {
  if (actor.role !== "authenticated") throw new DomainError("forbidden", "Cần đăng nhập");
  const parsed = newShopSchema.safeParse(input);
  if (!parsed.success) throw new DomainError("invalid", parsed.error.issues[0]?.message ?? "Thông tin chưa hợp lệ");
  const { name, slug } = parsed.data;
  try {
    return await withActor(sql, actor, async (tx) => {
      const [t] = await tx<{ id: string }[]>`select public.create_tenant(${name}) as id`;
      const [s] = await tx<{ id: string }[]>`select public.create_storefront(${t!.id}, ${slug}, ${name}) as id`;
      await tx`
        update public.storefront_versions
        set brand = ${tx.json({ businessName: name, isDemo: false })}, sections = ${tx.json(starterSections(name) as never)}
        where storefront_id = ${s!.id} and kind = 'draft'`;
      return { tenantId: t!.id, storefrontId: s!.id };
    });
  } catch (err) {
    const e = fromPgError(err);
    if (e?.code === "conflict") throw new DomainError("conflict", "Địa chỉ cửa hàng này đã có người dùng");
    throw e ?? err;
  }
}
