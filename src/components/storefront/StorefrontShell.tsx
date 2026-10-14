import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { storefrontPath } from "@/lib/site";
import type { PublishedStorefront } from "@/modules/storefront/public-read";
import { googleFontsHref, themeToCssVariables } from "@/modules/storefront/theme";
import { ChatWidget } from "./ChatWidget";

export function StorefrontShell({ store, children }: { store: PublishedStorefront; children: ReactNode }) {
  const announcement = store.sections.find((s) => s.type === "announcement");
  const brand = store.brand;
  const displayName = brand?.businessName ?? store.name;
  const home = storefrontPath(store.slug);

  return (
    <div className="sf" style={themeToCssVariables(store.theme) as CSSProperties}>
      <link rel="stylesheet" href={googleFontsHref(store.theme)} precedence="default" />
      {brand?.isDemo && (
        <div className="sf-demo-flag" role="note">
          Gian hàng demo — dữ liệu minh họa, không phải hàng thật
        </div>
      )}
      {announcement?.type === "announcement" && <div className="sf-announcement">{announcement.text}</div>}
      <header className="sf-header">
        <div className="sf-container sf-header-inner">
          <nav className="sf-nav" aria-label="Khám phá">
            <Link href={`${home}#san-pham`}>Sản phẩm</Link>
            <Link className="sf-nav-hide-sm" href={`${home}#cau-chuyen`}>
              Câu chuyện
            </Link>
          </nav>
          <Link href={home} className="sf-logo">
            {displayName}
          </Link>
          <nav className="sf-nav sf-nav--end" aria-label="Liên hệ">
            <Link className="sf-nav-hide-sm" href={`${home}#giao-hang`}>
              Giao hàng
            </Link>
            <Link href={`${home}#hoi-gia`}>Hỏi giá</Link>
          </nav>
        </div>
      </header>
      <main>{children}</main>
      <footer className="sf-footer">
        <div className="sf-container sf-footer-grid">
          <div>
            <p className="sf-footer-name">{displayName}</p>
            {brand?.tagline && <p>{brand.tagline}</p>}
            {brand?.address && <p>Địa chỉ: {brand.address}</p>}
            {brand?.phone && (
              <p>
                Điện thoại: <a href={`tel:${brand.phone.replace(/[^+0-9]/g, "")}`}>{brand.phone}</a>
              </p>
            )}
            {brand?.email && (
              <p>
                Email: <a href={`mailto:${brand.email}`}>{brand.email}</a>
              </p>
            )}
          </div>
          <div className="sf-footer-meta">
            <p>
              Cập nhật lần cuối: <time dateTime={store.publishedAt.toISOString()}>{store.publishedAt.toLocaleDateString("vi-VN")}</time>
            </p>
            <p>Thông tin sản phẩm do người bán cung cấp và xác nhận.</p>
          </div>
        </div>
      </footer>
      {brand?.phone && (
        <a className="sf-contact-pill" href={`tel:${brand.phone.replace(/[^+0-9]/g, "")}`}>
          Liên hệ
        </a>
      )}
      <ChatWidget storeSlug={store.slug} storeName={displayName} />
    </div>
  );
}
