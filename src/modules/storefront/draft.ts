import { z } from "zod";
import { withActor, type Actor, type Sql, type Tx } from "@/lib/db";
import { DomainError, fromPgError } from "@/lib/errors";
import { brandSchema, type Brand } from "./brand";
import { placeholderTexts, referencedIds, sectionsSchema, type Section } from "./sections";
import { themeSchema, type Theme } from "./theme";

/**
 * Console-side storefront draft operations. All run as the signed-in user so RLS decides access; the tenant is
 * always derived from the storefront row, never taken from the request.
 */

export type Draft = { storefrontId: string; tenantId: string; revision: number; theme: unknown; brand: unknown; sections: unknown };

export const draftPatchSchema = z
  .object({ theme: themeSchema.optional(), brand: brandSchema.optional(), sections: sectionsSchema.optional() })
  .strict();
export type DraftPatch = { theme?: Theme; brand?: Brand; sections?: Section[] };

type DraftRow = { storefront_id: string; tenant_id: string; revision: number; theme: unknown; brand: unknown; sections: unknown };

async function loadDraft(tx: Tx, storefrontId: string): Promise<DraftRow | undefined> {
  const rows = await tx<DraftRow[]>`
    select storefront_id, tenant_id, revision, theme, brand, sections
    from public.storefront_versions
    where storefront_id = ${storefrontId} and kind = 'draft'
  `;
  return rows[0];
}

export async function getDraft(sql: Sql, actor: Actor, storefrontId: string): Promise<Draft> {
  const row = await withActor(sql, actor, (tx) => loadDraft(tx, storefrontId));
  if (!row) throw new DomainError("not_found", "Không tìm thấy gian hàng");
  return { storefrontId: row.storefront_id, tenantId: row.tenant_id, ...row };
}

export async function saveDraft(
  sql: Sql,
  actor: Actor,
  storefrontId: string,
  expectedRevision: number,
  patchInput: unknown,
): Promise<{ revision: number }> {
  const parsed = draftPatchSchema.safeParse(patchInput);
  if (!parsed.success) throw new DomainError("invalid", "Cấu hình gian hàng không hợp lệ", parsed.error.issues);
  const patch: DraftPatch = parsed.data;

  try {
    return await withActor(sql, actor, async (tx) => {
      const current = await loadDraft(tx, storefrontId);
      if (!current) throw new DomainError("not_found", "Không tìm thấy gian hàng");

      // Layout may only reference this tenant's own products and assets.
      const refs = referencedIds(patch.sections ?? []);
      if (patch.brand?.logoAssetId) refs.assetIds.push(patch.brand.logoAssetId);
      await assertOwnedByTenant(tx, current.tenant_id, refs);

      const rows = await tx<{ revision: number }[]>`
        update public.storefront_versions set
          theme = coalesce(${patch.theme ? tx.json(patch.theme) : null}::jsonb, theme),
          brand = coalesce(${patch.brand ? tx.json(patch.brand) : null}::jsonb, brand),
          sections = coalesce(${patch.sections ? tx.json(patch.sections) : null}::jsonb, sections)
        where storefront_id = ${storefrontId} and kind = 'draft' and revision = ${expectedRevision}
        returning revision
      `;
      const row = rows[0];
      if (!row) {
        // RLS hides the row from users who cannot edit; distinguish that from a stale revision.
        if (current.revision !== expectedRevision)
          throw new DomainError("conflict", "Bản nháp đã được người khác sửa; hãy tải lại", { revision: current.revision });
        throw new DomainError("forbidden", "Không có quyền sửa gian hàng này");
      }
      return { revision: row.revision };
    });
  } catch (err) {
    throw fromPgError(err) ?? err;
  }
}

async function countOwned(tx: Tx, table: "products" | "assets", tenantId: string, ids: string[]): Promise<number> {
  const rows =
    table === "products"
      ? await tx<{ n: number }[]>`select count(*)::int as n from public.products where tenant_id = ${tenantId} and id = any(${ids}::uuid[])`
      : await tx<{ n: number }[]>`select count(*)::int as n from public.assets where tenant_id = ${tenantId} and id = any(${ids}::uuid[])`;
  return rows[0]?.n ?? 0;
}

async function assertOwnedByTenant(tx: Tx, tenantId: string, refs: { productIds: string[]; assetIds: string[] }) {
  const products = [...new Set(refs.productIds)];
  if (products.length && (await countOwned(tx, "products", tenantId, products)) !== products.length)
    throw new DomainError("invalid", "Bố cục tham chiếu sản phẩm không thuộc gian hàng");
  const assets = [...new Set(refs.assetIds)];
  if (assets.length && (await countOwned(tx, "assets", tenantId, assets)) !== assets.length)
    throw new DomainError("invalid", "Bố cục tham chiếu ảnh không thuộc gian hàng");
}

export async function publishStorefront(
  sql: Sql,
  actor: Actor,
  storefrontId: string,
  expectedRevision: number,
): Promise<{ versionId: string }> {
  try {
    return await withActor(sql, actor, async (tx) => {
      // Never publish notes that stand in for facts the business has not supplied yet.
      const draft = await loadDraft(tx, storefrontId);
      const pending = draft ? placeholderTexts([draft.sections, draft.brand]) : [];
      if (pending.length)
        throw new DomainError("invalid", "Gian hàng còn nội dung chờ xác nhận; hãy thay trước khi xuất bản", { pending });
      const rows = await tx<{ id: string }[]>`
        select public.publish_storefront(${storefrontId}, ${expectedRevision}) as id
      `;
      return { versionId: rows[0]!.id };
    });
  } catch (err) {
    throw fromPgError(err) ?? err;
  }
}

export async function rollbackStorefront(sql: Sql, actor: Actor, storefrontId: string, versionId: string): Promise<void> {
  try {
    await withActor(sql, actor, (tx) => tx`select public.rollback_storefront(${storefrontId}, ${versionId})`);
  } catch (err) {
    throw fromPgError(err) ?? err;
  }
}
