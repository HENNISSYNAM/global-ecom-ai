import { describe, expect, it } from "vitest";
import { faqJsonLd } from "@/modules/seo/jsonld";
import { applyInfo, infoFromDraft } from "@/modules/seller/store-info";
import { starterSections } from "@/modules/seller/shops";
import { placeholderTexts, sectionsSchema, type Section } from "@/modules/storefront/sections";

describe("Cocoon-style sections", () => {
  it("accept category rows and FAQ, reject markup", () => {
    const ok = sectionsSchema.safeParse([
      { type: "category_rows", id: "nhom", title: "Nhóm hàng", categories: [{ slug: "toi", label: "Tỏi" }] },
      { type: "faq", id: "hd", title: "Hỏi đáp", items: [{ question: "Có VAT không?", answer: "Có, theo yêu cầu." }] },
    ]);
    expect(ok.success).toBe(true);
    expect(sectionsSchema.safeParse([{ type: "faq", id: "x", title: "Q", items: [{ question: "<b>?</b>", answer: "a" }] }]).success).toBe(false);
    expect(sectionsSchema.safeParse(starterSections("Hà Thịnh Phát")).success).toBe(true);
  });

  it("FAQ JSON-LD mirrors the visible answers", () => {
    expect(faqJsonLd([])).toBeNull();
    expect(faqJsonLd([{ question: "Q?", answer: "A." }])).toMatchObject({
      "@type": "FAQPage",
      mainEntity: [{ "@type": "Question", name: "Q?", acceptedAnswer: { "@type": "Answer", text: "A." } }],
    });
  });

  it("finds placeholder notes anywhere in the layout", () => {
    expect(placeholderTexts([{ a: ["[Chờ Thịnh Phát xác nhận: giá]"] }])).toHaveLength(1);
    expect(placeholderTexts(starterSections("Cửa hàng"))).toEqual([]);
  });
});

describe("store info editor", () => {
  it("lets the seller replace or remove every placeholder note", () => {
    const sections = sectionsSchema.parse([
      { type: "announcement", id: "tb", text: "[Chờ xác nhận: giờ nhận đơn]" },
      { type: "hero_split", id: "h", titleLead: "Tỏi" },
      { type: "fact_list", id: "gh", variant: "delivery", title: "Giao hàng",
        items: [{ title: "Phí giao", body: "[Chờ xác nhận]" }, { title: "Khu vực", body: "[Chờ xác nhận]" }] },
    ]);
    const info = infoFromDraft({ businessName: "X" }, sections);
    info.announcement = "";
    info.facts[0]!.items[0]!.body = "Báo khi xác nhận đơn.";
    info.facts[0]!.items[1]!.body = "";
    const next = applyInfo({ businessName: "X" }, sections, info);
    expect(placeholderTexts(next.sections)).toEqual([]);
    expect(next.sections.find((s) => s.type === "fact_list")).toMatchObject({ items: [{ title: "Phí giao", body: "Báo khi xác nhận đơn." }] });
  });

  it("updates hero and brand, adds story/FAQ only when filled, keeps other sections", () => {
    const start = starterSections("Hà Thịnh Phát");
    const info = infoFromDraft({ businessName: "Hà Thịnh Phát" }, start);
    const next = applyInfo({ businessName: "Hà Thịnh Phát" }, start, {
      ...info,
      phone: "0900 000 000",
      heroLead: "Tỏi sơ chế",
      storyTitle: "Xưởng nhỏ ở Tân Phú",
      storyBody: "Nội dung người bán xác nhận.",
      faq: [{ question: "Đơn tối thiểu?", answer: "10 kg." }, { question: "", answer: "" }],
    });
    expect(sectionsSchema.safeParse(next.sections).success).toBe(true);
    expect(next.sections.map((s: Section) => s.type)).toEqual(["hero_split", "category_rows", "story_panel", "faq", "rfq_cta"]);
    expect(next.brand).toMatchObject({ businessName: "Hà Thịnh Phát", phone: "0900 000 000" });
    expect(next.brand).not.toHaveProperty("email");

    const cleared = applyInfo(next.brand, next.sections, { ...infoFromDraft(next.brand, next.sections), storyBody: "", faq: [] });
    expect(cleared.sections.map((s: Section) => s.type)).toEqual(["hero_split", "category_rows", "rfq_cta"]);
  });
});
