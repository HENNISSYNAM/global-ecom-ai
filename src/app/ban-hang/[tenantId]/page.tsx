import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentActor } from "@/lib/auth";
import { getSql } from "@/lib/db";
import { listProducts } from "@/modules/seller/products";
import { listMyShops } from "@/modules/seller/shops";
import { SellerAssistant } from "@/components/seller/SellerAssistant";
import { StoreInfoForm } from "@/components/seller/StoreInfoForm";
import { PublishButton } from "@/components/seller/PublishButton";
import { getDraft } from "@/modules/storefront/draft";
import type { Brand } from "@/modules/storefront/brand";
import { sectionsSchema, type Section } from "@/modules/storefront/sections";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const metadata: Metadata = { title: "Trợ lý bán hàng", robots: { index: false, follow: false } };

const STATUS_LABEL = { draft: "Nháp", approved: "Đã duyệt", archived: "Lưu trữ" } as const;

export default async function SellerConsole({ params }: { params: Promise<{ tenantId: string }> }) {
  const actor = await currentActor();
  if (actor.role !== "authenticated") redirect("/dang-nhap");
  const { tenantId } = await params;
  const shop = (await listMyShops(getSql(), actor)).find((s) => s.tenantId === tenantId);
  if (!shop) notFound();
  const canEdit = shop.role === "owner" || shop.role === "editor";
  const products = await listProducts(getSql(), actor, tenantId);
  const draft = shop.storefrontId && canEdit ? await getDraft(getSql(), actor, shop.storefrontId) : null;
  const draftSections: Section[] = draft ? (sectionsSchema.safeParse(draft.sections).data ?? []) : [];

  return (
    <main className="sa-page sa-page--wide">
      <header className="sa-head">
        <div>
          <p className="sa-muted">
            Trợ lý bán hàng
            {shop.role !== "viewer" && (
              <>
                {" · "}
                <Link href={`/ban-hang/${tenantId}/hoi-gia`}>Yêu cầu báo giá</Link>
              </>
            )}
          </p>
          <h1 className="sa-title">{shop.tenantName}</h1>
        </div>
        <div className="sa-publish">
          {shop.storefrontSlug && (
            <Link className="sa-link" href={`/s/${shop.storefrontSlug}`} target="_blank">
              {shop.storefrontStatus === "live" ? "Xem gian hàng" : "Gian hàng chưa xuất bản"}
            </Link>
          )}
          {draft && shop.storefrontSlug && <PublishButton storefrontId={draft.storefrontId} revision={draft.revision} slug={shop.storefrontSlug} />}
        </div>
      </header>
      {draft && (
        <StoreInfoForm storefrontId={draft.storefrontId} revision={draft.revision} brand={draft.brand as Partial<Brand> | null} sections={draftSections} />
      )}
      <div className="sa-layout">
        {canEdit ? (
          <SellerAssistant
            tenantId={tenantId}
            storefront={
              shop.storefrontId && shop.storefrontSlug && shop.draftRevision !== null
                ? { id: shop.storefrontId, slug: shop.storefrontSlug, revision: shop.draftRevision, status: shop.storefrontStatus ?? "draft" }
                : null
            }
          />
        ) : (
          <p>Tài khoản của bạn chỉ có quyền xem cửa hàng này.</p>
        )}
        <aside className="sa-side" aria-label="Sản phẩm">
          <h2>Sản phẩm ({products.length})</h2>
          {products.length ? (
            <ul className="sa-products">
              {products.map((p) => (
                <li key={p.id}>
                  {p.photoAssetId ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/seller/assets/${p.photoAssetId}`} alt="" width={48} height={48} />
                  ) : (
                    <span className="sa-thumb" aria-hidden="true">{p.name.charAt(0)}</span>
                  )}
                  <span>
                    {p.name}
                    <small className={`sa-status sa-status--${p.status}`}>{STATUS_LABEL[p.status]}</small>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="sa-muted">Chưa có sản phẩm.</p>
          )}
        </aside>
      </div>
    </main>
  );
}
