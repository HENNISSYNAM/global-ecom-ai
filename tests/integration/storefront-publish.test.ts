import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DomainError } from "@/lib/errors";
import { getDraft, publishStorefront, rollbackStorefront, saveDraft } from "@/modules/storefront/draft";
import { getPublishedStorefront } from "@/modules/storefront/public-read";
import type { Section } from "@/modules/storefront/sections";
import { connect, IDS, resetTestDatabase } from "../db/helpers";

// These tests go through the domain services, which commit; the database is reset around this file.
const sql = connect();
let storefrontId = "";
const owner = { role: "authenticated", userId: IDS.ownerA } as const;
const viewer = { role: "authenticated", userId: IDS.viewerA } as const;
const otherTenant = { role: "authenticated", userId: IDS.ownerB } as const;

beforeAll(async () => {
  await resetTestDatabase();
  const [row] = await sql<{ id: string }[]>`select id from storefronts where slug = 'vuon-mau-demo'`;
  storefrontId = row!.id;
});
afterAll(async () => {
  await sql.end();
  await resetTestDatabase();
});

async function expectDomainError(p: Promise<unknown>, code: DomainError["code"]) {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(DomainError);
  expect((err as DomainError).code).toBe(code);
}

const heroOnly = (title: string): Section[] => [
  { type: "hero_split", id: "mo-dau", titleLead: title, imageSide: "left" },
  { type: "product_rail", id: "san-pham", title: "Sản phẩm" },
];

describe("draft vs published", () => {
  it("editing the draft does not change the public storefront", async () => {
    const draft = await getDraft(sql, owner, storefrontId);
    const { revision } = await saveDraft(sql, owner, storefrontId, draft.revision, { sections: heroOnly("Bản nháp mới") });
    expect(revision).toBe(draft.revision + 1);

    const pub = await getPublishedStorefront(sql, "vuon-mau-demo");
    expect(pub!.versionNo).toBe(1);
    const hero = pub!.sections.find((s) => s.type === "hero_split");
    expect(hero?.type === "hero_split" && hero.titleLead).toBe("Từ vườn mẫu");
  });

  it("a stale revision is rejected for both save and publish", async () => {
    const draft = await getDraft(sql, owner, storefrontId);
    await expectDomainError(saveDraft(sql, owner, storefrontId, draft.revision - 1, { sections: heroOnly("x") }), "conflict");
    await expectDomainError(publishStorefront(sql, owner, storefrontId, draft.revision - 1), "conflict");
  });

  it("layouts are validated: no HTML, no unknown sections, no other tenant's products", async () => {
    const { revision } = await getDraft(sql, owner, storefrontId);
    await expectDomainError(
      saveDraft(sql, owner, storefrontId, revision, { sections: heroOnly("<script>alert(1)</script>") }),
      "invalid",
    );
    await expectDomainError(
      saveDraft(sql, owner, storefrontId, revision, { sections: [{ type: "custom_html", id: "x", html: "<b>hi</b>" }] }),
      "invalid",
    );
    await expectDomainError(
      saveDraft(sql, owner, storefrontId, revision, {
        sections: [{ type: "product_rail", id: "r", title: "Hàng", productIds: [IDS.productB1] }],
      }),
      "invalid",
    );
    expect((await getDraft(sql, owner, storefrontId)).revision).toBe(revision);
  });

  it("viewers and other tenants cannot edit or publish", async () => {
    const { revision } = await getDraft(sql, owner, storefrontId);
    await expectDomainError(saveDraft(sql, viewer, storefrontId, revision, { sections: heroOnly("x") }), "forbidden");
    await expectDomainError(getDraft(sql, otherTenant, storefrontId), "not_found");
    await expectDomainError(publishStorefront(sql, viewer, storefrontId, revision), "not_found");
    await expectDomainError(publishStorefront(sql, otherTenant, storefrontId, revision), "not_found");
  });

  it("publishing snapshots the approved catalog; later catalog edits wait for the next publish", async () => {
    const { revision } = await getDraft(sql, owner, storefrontId);
    await publishStorefront(sql, owner, storefrontId, revision);
    const v2 = await getPublishedStorefront(sql, "vuon-mau-demo");
    expect(v2!.versionNo).toBe(2);
    expect(v2!.sections.find((s) => s.type === "hero_split")).toMatchObject({ titleLead: "Bản nháp mới" });
    expect(v2!.catalog.products.map((p) => p.slug).sort()).toEqual(["hat-dieu-rang-muoi-demo", "tra-xanh-say-demo"]);

    // A price change after publishing sends the product back to draft; the public page keeps the published price.
    await sql`insert into offers (tenant_id, variant_id, price_mode, unit_price_minor) values (${IDS.tenantA}, ${IDS.variantA1}, 'fixed', 999000)`;
    const still = await getPublishedStorefront(sql, "vuon-mau-demo");
    const dieu = still!.catalog.products.find((p) => p.slug === "hat-dieu-rang-muoi-demo");
    expect(dieu!.variants[0]!.offer).toMatchObject({ priceMode: "fixed", unitPriceMinor: "125000" });
  });

  it("the snapshot keeps decimal quantities exact and never invents a price for quote-only items", async () => {
    const pub = await getPublishedStorefront(sql, "vuon-mau-demo");
    const tra = pub!.catalog.products.find((p) => p.slug === "tra-xanh-say-demo")!;
    expect(tra.variants[0]).toMatchObject({ saleUnit: "kg", minOrderQty: "1.500", orderStepQty: "0.500" });
    expect(tra.variants[0]!.offer).toMatchObject({ priceMode: "quote_required", unitPriceMinor: null });
  });

  it("rollback restores layout and catalog together", async () => {
    const [v1] = await sql<{ id: string }[]>`
      select id from storefront_versions where storefront_id = ${storefrontId} and version_no = 1`;
    await rollbackStorefront(sql, owner, storefrontId, v1!.id);
    const pub = await getPublishedStorefront(sql, "vuon-mau-demo");
    expect(pub!.versionNo).toBe(1);
    expect(pub!.sections.find((s) => s.type === "hero_split")).toMatchObject({ titleLead: "Từ vườn mẫu" });
    await expectDomainError(rollbackStorefront(sql, otherTenant, storefrontId, v1!.id), "not_found");
  });

  it("published versions are immutable", async () => {
    const err = await sql`update storefront_versions set sections = '[]' where kind = 'published'`.then(
      () => null,
      (e: { code?: string }) => e,
    );
    expect(err?.code).toBe("42501");
  });

  it("refuses to publish while bracketed 'chờ xác nhận' notes stand in for business facts", async () => {
    const htpOwner = { role: "authenticated", userId: "00000000-0000-4000-8000-0000000000d1" } as const;
    const [htp] = await sql<{ id: string }[]>`select id from storefronts where slug = 'ha-thinh-phat'`;
    const draft = await getDraft(sql, htpOwner, htp!.id);
    await expectDomainError(publishStorefront(sql, htpOwner, htp!.id, draft.revision), "invalid");
    expect(await getPublishedStorefront(sql, "ha-thinh-phat")).toBeNull();
    // Other tenants still get "not found", not the placeholder error.
    await expectDomainError(publishStorefront(sql, owner, htp!.id, draft.revision), "not_found");
  });

  it("an unpublished storefront is not reachable publicly", async () => {
    expect(await getPublishedStorefront(sql, "nong-san-thinh-phat")).toBeNull();
    expect(await getPublishedStorefront(sql, "../etc")).toBeNull();
  });
});
