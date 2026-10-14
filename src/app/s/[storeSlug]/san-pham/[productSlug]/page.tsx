import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Media } from "@/components/storefront/Media";
import { StorefrontShell } from "@/components/storefront/StorefrontShell";
import { getSql } from "@/lib/db";
import { absoluteUrl, productPath, publicAssetUrl, storefrontPath } from "@/lib/site";
import { formatQuantityWithUnit, originLabel, priceDisplay, SALE_UNIT_LABEL } from "@/modules/catalog/format";
import { breadcrumbJsonLd, productJsonLd, serializeJsonLd } from "@/modules/seo/jsonld";
import { findProduct, getPublishedStorefront } from "@/modules/storefront/public-read";

export const dynamic = "force-dynamic";

const loadStore = cache((slug: string) => getPublishedStorefront(getSql(), slug));

type Props = { params: Promise<{ storeSlug: string; productSlug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { storeSlug, productSlug } = await params;
  const store = await loadStore(storeSlug);
  const product = store && findProduct(store, productSlug);
  if (!store || !product) return {};
  const seller = store.brand?.businessName ?? store.name;
  return {
    title: `${product.name} | ${seller}`,
    description: product.summary ?? product.description?.slice(0, 160) ?? undefined,
    alternates: { canonical: absoluteUrl(productPath(store.slug, product.slug)) },
    robots: store.brand?.isDemo ? { index: false, follow: false } : undefined,
  };
}

export default async function ProductPage({ params }: Props) {
  const { storeSlug, productSlug } = await params;
  const store = await loadStore(storeSlug);
  const product = store && findProduct(store, productSlug);
  if (!store || !product) notFound();

  const seller = store.brand?.businessName ?? store.name;
  const assets = new Map(store.catalog.assets.map((a) => [a.id, a]));
  const images = product.imageAssetIds.map((id) => assets.get(id)).filter((a) => a !== undefined);
  const imageUrls = images.map((a) => publicAssetUrl(a.objectKey)).filter((u): u is string => u !== null);
  const url = absoluteUrl(productPath(store.slug, product.slug));
  const origin = originLabel(product.originCountry, product.originRegion);
  const storeUrl = absoluteUrl(storefrontPath(store.slug));

  const jsonLd = [
    productJsonLd({ product, url, sellerName: seller, imageUrls }),
    breadcrumbJsonLd([
      { name: seller, url: storeUrl },
      { name: "Sản phẩm", url: `${storeUrl}#san-pham` },
      { name: product.name, url },
    ]),
  ];

  return (
    <StorefrontShell store={store}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
      <div className="sf-container">
        <nav className="sf-breadcrumb" aria-label="Breadcrumb">
          <ol>
            <li>
              <Link href={storefrontPath(store.slug)}>{seller}</Link>
            </li>
            <li>
              <Link href={`${storefrontPath(store.slug)}#san-pham`}>Sản phẩm</Link>
            </li>
            <li aria-current="page">{product.name}</li>
          </ol>
        </nav>

        <article className="sf-pdp">
          <div className="sf-gallery">
            <Media asset={images[0] ?? null} fallbackLabel={product.name} priority sizes="(min-width: 900px) 55vw, 100vw" />
            {images.length > 1 && (
              <div className="sf-gallery-thumbs">
                {images.slice(1, 5).map((a) => (
                  <Media key={a.id} asset={a} fallbackLabel={product.name} sizes="12vw" />
                ))}
              </div>
            )}
          </div>

          <div className="sf-pdp-info">
            {product.processing && <p className="sf-eyebrow">{product.processing}</p>}
            <h1 className="sf-pdp-title">{product.name}</h1>
            {product.summary && <p className="sf-lead">{product.summary}</p>}

            <dl className="sf-attr">
              {origin && (
                <div>
                  <dt>Xuất xứ</dt>
                  <dd>{origin}</dd>
                </div>
              )}
              {product.storageInstructions && (
                <div>
                  <dt>Bảo quản</dt>
                  <dd>{product.storageInstructions}</dd>
                </div>
              )}
              {product.shelfLifeNote && (
                <div>
                  <dt>Hạn sử dụng</dt>
                  <dd>{product.shelfLifeNote}</dd>
                </div>
              )}
            </dl>

            <div className="sf-table-scroll">
              <table className="sf-variants">
                <caption className="visually-hidden">Quy cách và giá</caption>
                <thead>
                  <tr>
                    <th scope="col">Quy cách</th>
                    <th scope="col">Đơn vị bán</th>
                    <th scope="col">Tối thiểu</th>
                    <th scope="col">Giá</th>
                  </tr>
                </thead>
                <tbody>
                  {product.variants.map((v) => {
                    const price = priceDisplay(v);
                    return (
                      <tr key={v.id}>
                        <td>
                          {v.packDescription ?? "—"}
                          {v.packNetWeightKg && <div className="sf-card-meta">Khối lượng tịnh: {formatQuantityWithUnit(v.packNetWeightKg, "kg")}</div>}
                        </td>
                        <td>{SALE_UNIT_LABEL[v.saleUnit]}</td>
                        <td>
                          {formatQuantityWithUnit(v.minOrderQty, v.saleUnit)}
                          {v.orderStepQty !== v.minOrderQty && (
                            <div className="sf-card-meta">bước {formatQuantityWithUnit(v.orderStepQty, v.saleUnit)}</div>
                          )}
                        </td>
                        <td>
                          {price.kind === "fixed" && `${price.text} / ${price.unit}`}
                          {price.kind === "quote" && <span className="sf-price-quote">Liên hệ</span>}
                          {price.kind === "none" && "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <a className="sf-btn" href={`${storefrontPath(store.slug)}#hoi-gia`}>
              Gửi yêu cầu báo giá
            </a>
            <p className="sf-note">Phí giao hàng do người bán xác nhận khi báo giá. Khi chưa có báo giá, phí giao chưa được xác định và không có nghĩa là miễn phí.</p>

            {product.description && (
              <section aria-labelledby="mo-ta">
                <h2 id="mo-ta" className="sf-eyebrow">
                  Mô tả
                </h2>
                <p style={{ whiteSpace: "pre-line", margin: 0 }}>{product.description}</p>
              </section>
            )}

            {product.evidence.length > 0 && (
              <section aria-labelledby="can-cu">
                <h2 id="can-cu" className="sf-eyebrow">
                  Căn cứ người bán cung cấp
                </h2>
                <ul className="sf-fact-list">
                  {product.evidence.map((e, i) => (
                    <li key={i}>
                      <span className="sf-fact-title">{e.field}</span>
                      <span>
                        {e.value}
                        {e.sourceUrl && (
                          <>
                            {" "}
                            (<a href={e.sourceUrl} rel="nofollow noopener" target="_blank">nguồn</a>)
                          </>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </article>
      </div>
    </StorefrontShell>
  );
}
