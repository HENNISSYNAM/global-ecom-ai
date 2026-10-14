import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DomainError } from "@/lib/errors";
import { acceptQuote, getRfqForBuyer, submitRfq } from "@/modules/rfq/buyer";
import { declineRfq, getRfq, listRfqs, sendQuote } from "@/modules/rfq/seller";
import { getPublishedStorefront } from "@/modules/storefront/public-read";
import { connect, IDS, resetTestDatabase } from "../db/helpers";

const sql = connect();
const ownerA = { role: "authenticated", userId: IDS.ownerA } as const;
const viewerA = { role: "authenticated", userId: IDS.viewerA } as const;
const ownerB = { role: "authenticated", userId: IDS.ownerB } as const;

beforeAll(() => resetTestDatabase());
afterAll(async () => {
  await sql.end();
  await resetTestDatabase();
});

async function expectDomainError(p: Promise<unknown>, code: DomainError["code"]) {
  const err = await p.then(() => null, (e: unknown) => e);
  expect(err).toBeInstanceOf(DomainError);
  expect((err as DomainError).code).toBe(code);
}

async function demoItems() {
  const store = await getPublishedStorefront(sql, "vuon-mau-demo");
  return store!.catalog.products.map((p) => ({ productId: p.id, variantId: p.variants[0]!.id }));
}

const buyer = {
  buyerName: "Bếp ăn Thử Nghiệm",
  buyerPhone: "0900 111 222",
  buyerType: "kitchen" as const,
  deliveryArea: "Quận 12, TP.HCM",
  neededBy: "2026-10-20",
  needVatInvoice: true,
};

describe("buyer submits a request for quote", () => {
  it("accepts only published products, stores a hashed token and snapshots names/units", async () => {
    const items = await demoItems();
    const res = await submitRfq(sql, "vuon-mau-demo", { ...buyer, items: items.map((i) => ({ ...i, quantity: "12,5" })) });
    expect(res.reference).toMatch(/^YC-[0-9A-Z]{8}$/);
    expect(res.token).toMatch(/^[0-9a-f]{64}$/);
    const [row] = await sql<{ token_hash: string; tenant_id: string }[]>`select token_hash, tenant_id from rfqs where id = ${res.rfqId}`;
    expect(row!.token_hash).not.toBe(res.token);
    expect(row!.tenant_id).toBe(IDS.tenantA);

    const view = await getRfqForBuyer(sql, res.token);
    expect(view).toMatchObject({ reference: res.reference, status: "submitted", quote: null, order: null });
    expect(view!.items.map((i) => i.quantity)).toEqual(["12.500", "12.500"]);
    expect(await getRfqForBuyer(sql, "0".repeat(64))).toBeNull();
  });

  it("rejects draft products, other tenants' products, unpublished stores and bad input", async () => {
    const draftProduct = { productId: IDS.productA3Draft, quantity: "1" };
    await expectDomainError(submitRfq(sql, "vuon-mau-demo", { ...buyer, items: [draftProduct] }), "invalid");
    await expectDomainError(submitRfq(sql, "vuon-mau-demo", { ...buyer, items: [{ productId: IDS.productB1, quantity: "1" }] }), "invalid");
    await expectDomainError(submitRfq(sql, "nong-san-thinh-phat", { ...buyer, items: [{ productId: IDS.productB1, quantity: "1" }] }), "not_found");
    const items = await demoItems();
    await expectDomainError(submitRfq(sql, "vuon-mau-demo", { ...buyer, items: [{ ...items[0]!, quantity: "0" }] }), "invalid");
    await expectDomainError(submitRfq(sql, "vuon-mau-demo", { ...buyer, buyerName: "<b>x</b>", items: [{ ...items[0]!, quantity: "1" }] }), "invalid");
    await expectDomainError(submitRfq(sql, "vuon-mau-demo", { ...buyer, website: "spam", items: [{ ...items[0]!, quantity: "1" }] }), "invalid");
  });

  it("anonymous visitors cannot read requests directly", async () => {
    const err = await sql
      .begin(async (tx) => {
        await tx.unsafe("set local role anon");
        await tx`select buyer_phone from public.rfqs`;
      })
      .then(() => null, (e: { code?: string }) => e);
    expect(err?.code).toBe("42501");
  });
});

describe("seller quotes and buyer accepts", () => {
  let token = "";
  let rfqId = "";

  beforeAll(async () => {
    const items = await demoItems();
    const res = await submitRfq(sql, "vuon-mau-demo", { ...buyer, items: [{ ...items[0]!, quantity: "20" }] });
    token = res.token;
    rfqId = res.rfqId;
  });

  it("only sellers of the tenant see the request with buyer contact", async () => {
    expect((await listRfqs(sql, ownerA, IDS.tenantA)).some((r) => r.id === rfqId)).toBe(true);
    expect(await listRfqs(sql, ownerB, IDS.tenantA)).toEqual([]);
    expect(await listRfqs(sql, viewerA, IDS.tenantA)).toEqual([]); // viewers are not sales
    await expectDomainError(getRfq(sql, ownerB, rfqId), "not_found");
    const detail = await getRfq(sql, ownerA, rfqId);
    expect(detail.buyer).toMatchObject({ phone: "0900 111 222", needVatInvoice: true, neededBy: "2026-10-20" });
  });

  it("computes line totals in whole đồng; a new version supersedes the old one; sent quotes are immutable", async () => {
    const detail = await getRfq(sql, ownerA, rfqId);
    const item = detail.items[0]!;
    await expectDomainError(sendQuote(sql, ownerB, rfqId, { lines: [{ description: "x", saleUnit: "kg", quantity: "1", unitPriceMinor: "1000" }] }), "not_found");

    const v1 = await sendQuote(sql, ownerA, rfqId, {
      lines: [{ rfqItemId: item.id, description: item.productName, saleUnit: item.saleUnit as "kg", quantity: "20", unitPriceMinor: "120.000" }],
      deliveryFeeMinor: "30.000",
      validDays: 2,
    });
    const v2 = await sendQuote(sql, ownerA, rfqId, {
      lines: [{ rfqItemId: item.id, description: item.productName, saleUnit: "kg", quantity: "1.333", unitPriceMinor: "100001" }],
      deliveryNote: "Giao sáng",
    });
    const quotes = await sql<{ id: string; version: number; status: string; subtotal_minor: bigint; total_minor: bigint }[]>`
      select id, version, status, subtotal_minor, total_minor from quotes where rfq_id = ${rfqId} order by version`;
    expect(quotes.map((q) => [q.version, q.status])).toEqual([[1, "superseded"], [2, "sent"]]);
    expect(quotes[0]!.total_minor).toBe(2_430_000n);
    expect(quotes[1]!.subtotal_minor).toBe(133_301n); // round(1.333 × 100001)

    const err = await sql`update quotes set total_minor = 1 where id = ${v2.quoteId}`.then(() => null, (e: { code?: string }) => e);
    expect(err?.code).toBe("42501");
    const lineErr = await sql`update quote_lines set unit_price_minor = 1, line_total_minor = 1 where quote_id = ${v2.quoteId}`.then(
      () => null,
      (e: { code?: string }) => e,
    );
    expect(lineErr?.code).toBe("42501");

    // The buyer sees only the live version and cannot accept the superseded one.
    const view = await getRfqForBuyer(sql, token);
    expect(view!.quote).toMatchObject({ id: v2.quoteId, version: 2, expired: false, subtotalMinor: "133301" });
    await expectDomainError(acceptQuote(sql, token, v1.quoteId, "key-superseded-1"), "conflict");
  });

  it("acceptance is idempotent, concurrent accepts create one order, and the order snapshot is frozen", async () => {
    const view = await getRfqForBuyer(sql, token);
    const quoteId = view!.quote!.id;
    const results = await Promise.allSettled([
      acceptQuote(sql, token, quoteId, "key-aaaaaaaa"),
      acceptQuote(sql, token, quoteId, "key-bbbbbbbb"),
      acceptQuote(sql, token, quoteId, "key-cccccccc"),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled").map((r) => (r as PromiseFulfilledResult<{ orderReference: string; replayed: boolean }>).value);
    expect(ok).toHaveLength(3);
    expect(new Set(ok.map((o) => o.orderReference)).size).toBe(1);
    expect(ok.filter((o) => !o.replayed)).toHaveLength(1);

    const [order] = await sql<{ snapshot: { lines: { unitPriceMinor: string }[]; buyer: { phone: string } }; total_minor: bigint }[]>`
      select snapshot, total_minor from orders where rfq_id = ${rfqId}`;
    expect(order!.snapshot.lines[0]!.unitPriceMinor).toBe("100001");
    expect(order!.snapshot.buyer.phone).toBe("0900 111 222");
    expect(order!.total_minor).toBe(133_301n);

    // After the order: no new quotes, no decline, buyer view shows the order.
    await expectDomainError(sendQuote(sql, ownerA, rfqId, { lines: [{ description: "x", saleUnit: "kg", quantity: "1", unitPriceMinor: "1" }] }), "conflict");
    await expectDomainError(declineRfq(sql, ownerA, rfqId), "conflict");
    expect((await getRfqForBuyer(sql, token))!.order?.reference).toBe(ok[0]!.orderReference);
  });

  it("an expired quote cannot be accepted; a wrong token reveals nothing", async () => {
    const items = await demoItems();
    const res = await submitRfq(sql, "vuon-mau-demo", { ...buyer, items: [{ ...items[0]!, quantity: "5" }] });
    const { quoteId } = await sendQuote(sql, ownerA, res.rfqId, {
      lines: [{ description: "Hàng thử", saleUnit: "kg", quantity: "5", unitPriceMinor: "1000" }],
    });
    // Simulate time passing (owner connection; the guard only protects commercial fields).
    await sql`alter table quotes disable trigger quotes_guard`;
    await sql`update quotes set sent_at = now() - interval '5 days', valid_until = now() - interval '1 second' where id = ${quoteId}`;
    await sql`alter table quotes enable trigger quotes_guard`;
    expect((await getRfqForBuyer(sql, res.token))!.quote!.expired).toBe(true);
    await expectDomainError(acceptQuote(sql, res.token, quoteId, "key-expired-1"), "conflict");
    await expectDomainError(acceptQuote(sql, "f".repeat(64), quoteId, "key-wrongtoken"), "not_found");
  });
});
