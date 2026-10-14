import type { Brand } from "@/modules/storefront/brand";
import type { Section } from "@/modules/storefront/sections";

/**
 * The few storefront texts a seller edits in the console, mapped onto the draft layout. Keeps every other section
 * as it is; empty optional fields remove the corresponding section instead of publishing filler text.
 */
export type StoreInfo = {
  businessName: string;
  tagline: string;
  phone: string;
  email: string;
  address: string;
  heroEyebrow: string;
  heroLead: string;
  heroEmphasis: string;
  heroBody: string;
  storyTitle: string;
  storyBody: string;
  faq: { question: string; answer: string }[];
  announcement: string;
  /** Fact lists (process, delivery, trust): an empty body removes the item; an empty list removes the section. */
  facts: { id: string; title: string; items: { title: string; body: string }[] }[];
};

export function infoFromDraft(brand: Partial<Brand> | null, sections: Section[]): StoreInfo {
  const hero = sections.find((s) => s.type === "hero_split");
  const story = sections.find((s) => s.type === "story_panel");
  const faq = sections.find((s) => s.type === "faq");
  return {
    businessName: brand?.businessName ?? "",
    tagline: brand?.tagline ?? "",
    phone: brand?.phone ?? "",
    email: brand?.email ?? "",
    address: brand?.address ?? "",
    heroEyebrow: hero?.type === "hero_split" ? (hero.eyebrow ?? "") : "",
    heroLead: hero?.type === "hero_split" ? hero.titleLead : "",
    heroEmphasis: hero?.type === "hero_split" ? (hero.titleEmphasis ?? "") : "",
    heroBody: hero?.type === "hero_split" ? (hero.body ?? "") : "",
    storyTitle: story?.type === "story_panel" ? story.title : "",
    storyBody: story?.type === "story_panel" ? story.body : "",
    faq: faq?.type === "faq" ? faq.items : [],
    announcement: sections.find((s) => s.type === "announcement")?.type === "announcement"
      ? (sections.find((s) => s.type === "announcement") as Extract<Section, { type: "announcement" }>).text
      : "",
    facts: sections.flatMap((s) => (s.type === "fact_list" ? [{ id: s.id, title: s.title, items: s.items.map((i) => ({ ...i })) }] : [])),
  };
}

const opt = (s: string) => (s.trim() ? s.trim() : undefined);

export function applyInfo(brand: Partial<Brand> | null, sections: Section[], info: StoreInfo): { brand: Record<string, unknown>; sections: Section[] } {
  const nextBrand: Record<string, unknown> = {
    ...brand,
    businessName: info.businessName.trim(),
    tagline: opt(info.tagline),
    phone: opt(info.phone),
    email: opt(info.email),
    address: opt(info.address),
  };
  for (const k of Object.keys(nextBrand)) if (nextBrand[k] === undefined) delete nextBrand[k];

  let next = [...sections];
  const heroIdx = next.findIndex((s) => s.type === "hero_split");
  const prevHero = heroIdx >= 0 && next[heroIdx]!.type === "hero_split" ? next[heroIdx] : null;
  const hero: Section = {
    type: "hero_split",
    id: prevHero?.id ?? "mo-dau",
    titleLead: info.heroLead.trim() || info.businessName.trim(),
    eyebrow: opt(info.heroEyebrow),
    titleEmphasis: opt(info.heroEmphasis),
    body: opt(info.heroBody),
    cta: prevHero?.type === "hero_split" ? (prevHero.cta ?? { label: "Xem sản phẩm", target: "catalog" }) : { label: "Xem sản phẩm", target: "catalog" },
    imageAssetId: prevHero?.type === "hero_split" ? prevHero.imageAssetId : undefined,
    imageSide: prevHero?.type === "hero_split" ? prevHero.imageSide : "left",
  };
  if (heroIdx >= 0) next[heroIdx] = hero;
  else next.unshift(hero);

  const upsert = (type: Section["type"], section: Section | null, after: Section["type"][]) => {
    const idx = next.findIndex((s) => s.type === type);
    if (!section) {
      if (idx >= 0) next.splice(idx, 1);
      return;
    }
    if (idx >= 0) next[idx] = section;
    else {
      const anchor = Math.max(...after.map((t) => next.findIndex((s) => s.type === t)));
      next.splice(anchor >= 0 ? anchor + 1 : next.length, 0, section);
    }
  };

  const prevStory = next.find((s) => s.type === "story_panel");
  upsert(
    "story_panel",
    info.storyTitle.trim() && info.storyBody.trim()
      ? {
          type: "story_panel",
          id: prevStory?.id ?? "cau-chuyen",
          eyebrow: prevStory?.type === "story_panel" ? prevStory.eyebrow : "Câu chuyện",
          title: info.storyTitle.trim(),
          body: info.storyBody.trim(),
          imageAssetId: prevStory?.type === "story_panel" ? prevStory.imageAssetId : undefined,
        }
      : null,
    ["product_rail", "category_rows", "hero_split"],
  );

  const items = info.faq.map((f) => ({ question: f.question.trim(), answer: f.answer.trim() })).filter((f) => f.question && f.answer);
  const prevFaq = next.find((s) => s.type === "faq");
  upsert(
    "faq",
    items.length ? { type: "faq", id: prevFaq?.id ?? "hoi-dap", title: prevFaq?.type === "faq" ? prevFaq.title : "Câu hỏi thường gặp", items } : null,
    ["fact_list", "story_panel", "category_rows", "product_rail"],
  );

  const annIdx = next.findIndex((s) => s.type === "announcement");
  if (info.announcement.trim()) {
    const ann: Section = { type: "announcement", id: annIdx >= 0 ? next[annIdx]!.id : "thong-bao", text: info.announcement.trim() };
    if (annIdx >= 0) next[annIdx] = ann;
    else next.unshift(ann);
  } else if (annIdx >= 0) next.splice(annIdx, 1);

  for (const f of info.facts) {
    const idx = next.findIndex((s) => s.type === "fact_list" && s.id === f.id);
    if (idx < 0) continue;
    const prev = next[idx]!;
    if (prev.type !== "fact_list") continue;
    const items = f.items.map((i) => ({ title: i.title.trim(), body: i.body.trim() })).filter((i) => i.title && i.body);
    if (items.length) next[idx] = { ...prev, title: f.title.trim() || prev.title, items };
    else next.splice(idx, 1);
  }

  // Drop undefined keys so the strict schemas accept the result.
  next = JSON.parse(JSON.stringify(next));
  return { brand: nextBrand, sections: next };
}
