import { afterAll, describe, expect, it } from "vitest";
import { as, connect, IDS, inRollback, sqlError } from "../db/helpers";

const sql = connect();
afterAll(() => sql.end());

describe("offers: money and price modes", () => {
  const offer = (o: Record<string, unknown>) => ({ tenant_id: IDS.tenantA, variant_id: IDS.variantA1, ...o });

  it.each([
    ["fixed without a price", { price_mode: "fixed", unit_price_minor: null }],
    ["fixed with price 0", { price_mode: "fixed", unit_price_minor: 0 }],
    ["quote_required with a price", { price_mode: "quote_required", unit_price_minor: 100000 }],
  ])("rejects %s", async (_label, o) => {
    await inRollback(sql, async (tx) => {
      const err = await sqlError(tx`insert into offers ${tx(offer(o))}`);
      expect(err.code).toBe("23514");
    });
  });

  it("stores VND as an exact integer", async () => {
    await inRollback(sql, async (tx) => {
      const [row] = await tx<{ unit_price_minor: bigint }[]>`
        insert into offers ${tx(offer({ price_mode: "fixed", unit_price_minor: "9007199254740993" }))} returning unit_price_minor`;
      expect(row!.unit_price_minor).toBe(9007199254740993n);
    });
  });
});

describe("variants: decimal quantities and units", () => {
  it("keeps 1.5 kg exactly and in kg", async () => {
    await inRollback(sql, async () => {
      const [row] = await sql<{ min_order_qty: string; order_step_qty: string; sale_unit: string }[]>`
        select min_order_qty, order_step_qty, sale_unit from variants where id = ${IDS.variantA2}`;
      expect(row).toEqual({ min_order_qty: "1.500", order_step_qty: "0.500", sale_unit: "kg" });
    });
  });

  it("rejects a pack weight on kg-sold variants and non-positive MOQ", async () => {
    await inRollback(sql, async (tx) => {
      const base = { tenant_id: IDS.tenantA, product_id: IDS.productA3Draft, sale_unit: "kg", min_order_qty: 1, order_step_qty: 1 };
      expect((await sqlError(tx.savepoint((sp) => sp`insert into variants ${sp({ ...base, pack_net_weight_kg: 1 })}`))).code).toBe("23514");
      expect((await sqlError(tx.savepoint((sp) => sp`insert into variants ${sp({ ...base, min_order_qty: 0 })}`))).code).toBe("23514");
    });
  });

  it("SKU is unique within a tenant", async () => {
    await inRollback(sql, async (tx) => {
      const err = await sqlError(tx`
        insert into variants (tenant_id, product_id, sku, sale_unit, min_order_qty, order_step_qty)
        values (${IDS.tenantA}, ${IDS.productA3Draft}, 'DEMO-DIEU-500', 'bag', 1, 1)`);
      expect(err.code).toBe("23505");
    });
  });
});

describe("product approval gate", () => {
  it("lists what the seller still has to confirm and keeps the product in draft", async () => {
    await inRollback(sql, async (tx) => {
      const [row] = await as(tx, IDS.ownerB, (t) => t<{ missing: string[] }[]>`select approve_product(${IDS.productB1}) as missing`);
      expect(row!.missing).toEqual(["origin_country", "processing", "storage_instructions", "variant"]);
      const [p] = await tx<{ status: string }[]>`select status from products where id = ${IDS.productB1}`;
      expect(p!.status).toBe("draft");
    });
  });

  it("new products cannot be inserted as approved", async () => {
    await inRollback(sql, async (tx) => {
      const err = await sqlError(
        as(tx, IDS.editorA, (t) => t`insert into products (tenant_id, slug, name, status, approved_at) values (${IDS.tenantA}, 'x', 'X', 'approved', now())`),
      );
      expect(err.code).toBe("42501");
    });
  });

  it("editing buyer-facing fields of an approved product sends it back to review", async () => {
    await inRollback(sql, async (tx) => {
      await as(tx, IDS.editorA, (t) => t`update products set origin_region = 'Tỉnh khác' where id = ${IDS.productA1}`);
      const [p] = await tx<{ status: string }[]>`select status from products where id = ${IDS.productA1}`;
      expect(p!.status).toBe("draft");
    });
  });

  it("changing a price also sends the product back to review", async () => {
    await inRollback(sql, async (tx) => {
      await as(tx, IDS.editorA, (t) => t`
        insert into offers (tenant_id, variant_id, price_mode, unit_price_minor) values (${IDS.tenantA}, ${IDS.variantA1}, 'fixed', 130000)`);
      const [p] = await tx<{ status: string }[]>`select status from products where id = ${IDS.productA1}`;
      expect(p!.status).toBe("draft");
    });
  });

  it("other tenants cannot approve a product", async () => {
    await inRollback(sql, async (tx) => {
      const err = await sqlError(as(tx, IDS.ownerB, (t) => t`select approve_product(${IDS.productA3Draft})`));
      expect(err.code).toBe("42501");
    });
  });
});
