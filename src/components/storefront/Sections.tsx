import { categoryLabel } from "@/modules/catalog/categories";
import type { PublishedStorefront } from "@/modules/storefront/public-read";
import type { Section } from "@/modules/storefront/sections";
import type { SnapshotAsset } from "@/modules/storefront/snapshot";
import { Media } from "./Media";
import { ProductCard } from "./ProductCard";

/** Renders the allowlisted section types. Unknown references (deleted/unapproved products) are skipped silently. */

const CTA_ANCHOR = { catalog: "#san-pham", rfq: "#hoi-gia", story: "#cau-chuyen", delivery: "#giao-hang" } as const;

function assetLookup(store: PublishedStorefront) {
  const map = new Map(store.catalog.assets.map((a) => [a.id, a]));
  return (id: string | undefined): SnapshotAsset | null => (id ? (map.get(id) ?? null) : null);
}

export function SectionList({ store }: { store: PublishedStorefront }) {
  const asset = assetLookup(store);
  let firstHero = true;
  return (
    <>
      {store.sections.map((section) => {
        if (section.type === "announcement") return null; // rendered by the shell
        const node = <SectionView key={section.id} section={section} store={store} asset={asset} priority={firstHero} />;
        if (section.type === "hero_split") firstHero = false;
        return node;
      })}
    </>
  );
}

function SectionView({
  section,
  store,
  asset,
  priority,
}: {
  section: Section;
  store: PublishedStorefront;
  asset: (id: string | undefined) => SnapshotAsset | null;
  priority: boolean;
}) {
  switch (section.type) {
    case "hero_split":
      return (
        <section className="sf-section" aria-labelledby={`${section.id}-title`}>
          <div className={`sf-container sf-hero ${section.imageSide === "right" ? "sf-hero--image-right" : ""}`}>
            <Media asset={asset(section.imageAssetId)} fallbackLabel={section.titleLead} priority={priority} sizes="(min-width: 900px) 50vw, 100vw" />
            <div className="sf-hero-copy">
              {section.eyebrow && <p className="sf-eyebrow">{section.eyebrow}</p>}
              <h1 id={`${section.id}-title`} className="sf-display">
                <em>{section.titleLead}</em>
                {section.titleEmphasis && <span className="sf-emph">{section.titleEmphasis}</span>}
              </h1>
              {section.body && <p className="sf-lead">{section.body}</p>}
              {section.cta && (
                <a className="sf-btn" href={CTA_ANCHOR[section.cta.target]}>
                  {section.cta.label}
                </a>
              )}
            </div>
          </div>
        </section>
      );

    case "product_rail": {
      const all = store.catalog.products;
      const products = section.productIds
        ? section.productIds.map((id) => all.find((p) => p.id === id)).filter((p) => p !== undefined)
        : all.filter((p) => !section.category || p.category === section.category);
      return (
        <section className="sf-section" id="san-pham" aria-labelledby={`${section.id}-title`}>
          <div className="sf-container sf-rail">
            <div>
              <h2 id={`${section.id}-title`} className="sf-h2">
                {section.title}
              </h2>
              {section.intro && <p className="sf-lead">{section.intro}</p>}
            </div>
            {products.length ? (
              <div className="sf-rail-track" role="list">
                {products.map((p) => (
                  <div role="listitem" key={p.id}>
                    <ProductCard storeSlug={store.slug} product={p} image={asset(p.imageAssetIds[0])} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="sf-empty">Chưa có sản phẩm nào được người bán duyệt để xuất bản.</p>
            )}
          </div>
        </section>
      );
    }

    case "story_panel":
      return (
        <section className="sf-section" id="cau-chuyen" aria-labelledby={`${section.id}-title`}>
          <div className="sf-container sf-story">
            <Media asset={asset(section.imageAssetId)} fallbackLabel={section.title} sizes="100vw" />
            <div className="sf-story-panel">
              {section.eyebrow && <p className="sf-eyebrow">{section.eyebrow}</p>}
              <h2 id={`${section.id}-title`} className="sf-h2">
                {section.title}
              </h2>
              <p>{section.body}</p>
            </div>
          </div>
        </section>
      );

    case "fact_list":
      return (
        <section
          className="sf-section"
          id={section.variant === "delivery" ? "giao-hang" : undefined}
          aria-labelledby={`${section.id}-title`}
        >
          <div className="sf-container sf-facts">
            <h2 id={`${section.id}-title`} className="sf-h2">
              {section.title}
            </h2>
            <ul className="sf-fact-list">
              {section.items.map((item) => (
                <li key={item.title}>
                  <span className="sf-fact-title">{item.title}</span>
                  <span>{item.body}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      );

    case "category_rows": {
      const approved = store.catalog.products;
      const groups = (
        section.categories ??
        [...new Set(approved.map((p) => p.category))].map((slug) => ({ slug: slug ?? "", label: categoryLabel(slug), note: undefined }))
      )
        .map((g) => ({ ...g, products: approved.filter((p) => (p.category ?? "") === g.slug) }))
        .filter((g) => g.products.length > 0);
      const anchor = store.sections.some((x) => x.type === "product_rail") ? undefined : "san-pham";
      return (
        <section className="sf-section" id={anchor} aria-labelledby={`${section.id}-title`}>
          <div className="sf-container">
            <h2 id={`${section.id}-title`} className="sf-h2">
              {section.title}
            </h2>
            {section.intro && <p className="sf-lead">{section.intro}</p>}
            {groups.length ? (
              groups.map((g) => (
                <div className="sf-rail sf-catrow" key={g.slug || "khac"}>
                  <div>
                    <h3 className="sf-cat-title">{g.label}</h3>
                    {g.note && <p className="sf-muted-text">{g.note}</p>}
                    <p className="sf-cat-count">{g.products.length} sản phẩm</p>
                  </div>
                  <div className="sf-rail-track" role="list">
                    {g.products.map((p) => (
                      <div role="listitem" key={p.id}>
                        <ProductCard storeSlug={store.slug} product={p} image={asset(p.imageAssetIds[0])} />
                      </div>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <p className="sf-empty">Chưa có sản phẩm nào được người bán duyệt để xuất bản.</p>
            )}
          </div>
        </section>
      );
    }

    case "faq":
      return (
        <section className="sf-section" id="hoi-dap" aria-labelledby={`${section.id}-title`}>
          <div className="sf-container sf-faq">
            <h2 id={`${section.id}-title`} className="sf-h2">
              {section.title}
            </h2>
            <div>
              {section.items.map((item) => (
                <details key={item.question} className="sf-faq-item">
                  <summary>{item.question}</summary>
                  <p>{item.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      );

    case "rfq_cta":
      return (
        <section className="sf-section" id="hoi-gia" aria-labelledby={`${section.id}-title`}>
          <div className="sf-container">
            <div className="sf-rfq">
              <h2 id={`${section.id}-title`} className="sf-h2">
                {section.title}
              </h2>
              {section.body && <p className="sf-lead">{section.body}</p>}
              {/* The RFQ flow is built in step 4; until then the button states what actually happens. */}
              <span className="sf-btn" role="link" aria-disabled="true">
                {section.buttonLabel}
              </span>
              <p className="sf-note">Biểu mẫu hỏi giá trực tuyến đang được xây dựng và chưa nhận yêu cầu.</p>
            </div>
          </div>
        </section>
      );

    case "announcement":
      return null;
  }
}
