import Link from "next/link";
import { originLabel, priceDisplay, SALE_UNIT_LABEL } from "@/modules/catalog/format";
import type { SnapshotAsset, SnapshotProduct } from "@/modules/storefront/snapshot";
import { productPath } from "@/lib/site";
import { Media } from "./Media";

export function ProductCard({ storeSlug, product, image }: { storeSlug: string; product: SnapshotProduct; image: SnapshotAsset | null }) {
  const first = product.variants[0];
  const price = first ? priceDisplay(first) : { kind: "none" as const };
  const origin = originLabel(product.originCountry, product.originRegion);
  const meta = [product.processing, first?.packDescription ?? (first ? `Bán theo ${SALE_UNIT_LABEL[first.saleUnit]}` : null)]
    .filter(Boolean)
    .join(" · ");

  return (
    <Link className="sf-card" href={productPath(storeSlug, product.slug)}>
      <Media asset={image} fallbackLabel={product.name} sizes="(min-width: 1024px) 25vw, 70vw" />
      <h3 className="sf-card-name">{product.name}</h3>
      {meta && <p className="sf-card-meta">{meta}</p>}
      {origin && <p className="sf-card-meta">Xuất xứ: {origin}</p>}
      <p className="sf-card-price">
        {price.kind === "fixed" && (
          <>
            {price.text} <span className="sf-card-meta">/ {price.unit}</span>
          </>
        )}
        {price.kind === "quote" && <span className="sf-price-quote">Liên hệ báo giá</span>}
      </p>
    </Link>
  );
}
