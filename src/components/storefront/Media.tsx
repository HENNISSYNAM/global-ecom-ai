import { publicAssetUrl } from "@/lib/site";
import type { SnapshotAsset } from "@/modules/storefront/snapshot";

/** Renders an approved public asset, or an honest placeholder when the seller has not provided one yet. */
export function Media({
  asset,
  fallbackLabel,
  className,
  sizes,
  priority,
}: {
  asset: SnapshotAsset | null;
  fallbackLabel: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
}) {
  const url = asset ? publicAssetUrl(asset.objectKey) : null;
  if (asset && url) {
    return (
      <div className={`sf-media ${className ?? ""}`}>
        <img
          src={url}
          alt={asset.alt ?? fallbackLabel}
          width={asset.width ?? undefined}
          height={asset.height ?? undefined}
          sizes={sizes}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
        />
      </div>
    );
  }
  return (
    <div className={`sf-media sf-media--placeholder ${className ?? ""}`} role="img" aria-label={`Chưa có ảnh: ${fallbackLabel}`}>
      <span className="sf-media-initial" aria-hidden="true">
        {fallbackLabel.trim().charAt(0).toUpperCase()}
      </span>
      <span className="sf-media-note">Ảnh thật đang chờ người bán cung cấp</span>
    </div>
  );
}
