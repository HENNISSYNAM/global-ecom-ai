import { afterAll, describe, expect, it } from "vitest";
import { as, connect, IDS, inRollback, sqlError } from "../db/helpers";

const sql = connect();
afterAll(() => sql.end());

describe("tenant isolation (RLS + constraints)", () => {
  it("members see only their own tenant's catalog", async () => {
    await inRollback(sql, async (tx) => {
      const a = await as(tx, IDS.ownerA, (t) => t<{ tenant_id: string }[]>`select tenant_id from products`);
      expect(a.length).toBe(3);
      expect(new Set(a.map((r) => r.tenant_id))).toEqual(new Set([IDS.tenantA]));

      const b = await as(tx, IDS.ownerB, (t) => t`select id from products where id = ${IDS.productA1}`);
      expect(b.length).toBe(0);
      const bVariants = await as(tx, IDS.ownerB, (t) => t`select id from variants`);
      expect(bVariants.length).toBe(0);
    });
  });

  it("cannot insert rows into another tenant", async () => {
    await inRollback(sql, async (tx) => {
      const err = await sqlError(
        as(tx, IDS.ownerB, (t) => t`insert into products (tenant_id, slug, name) values (${IDS.tenantA}, 'x', 'X')`),
      );
      expect(err.code).toBe("42501");
    });
  });

  it("composite foreign keys block cross-tenant references even for a legitimate editor", async () => {
    await inRollback(sql, async (tx) => {
      // Editor A writes into tenant A (allowed by RLS) but points at tenant B's product.
      const err = await sqlError(
        as(tx, IDS.editorA, (t) => t`
          insert into variants (tenant_id, product_id, sale_unit, min_order_qty, order_step_qty)
          values (${IDS.tenantA}, ${IDS.productB1}, 'kg', 1, 1)`),
      );
      expect(err.code).toBe("23503");
    });
  });

  it("tenant_id cannot be changed after insert, even by a member of both tenants", async () => {
    await inRollback(sql, async (tx) => {
      await tx`insert into memberships (tenant_id, user_id, role) values (${IDS.tenantB}, ${IDS.editorA}, 'editor')`;
      const err = await sqlError(
        as(tx, IDS.editorA, (t) => t`update products set slug = 'moved' where id = ${IDS.productA3Draft} returning id`.then(
          () => t`update products set tenant_id = ${IDS.tenantB} where id = ${IDS.productA3Draft}`,
        )),
      );
      // Column grant excludes tenant_id; the trigger is a second line of defence for privileged paths.
      expect(err.code).toBe("42501");
    });
  });

  it("viewer can read but not write the catalog", async () => {
    await inRollback(sql, async (tx) => {
      const rows = await as(tx, IDS.viewerA, (t) => t`select id from products`);
      expect(rows.length).toBe(3);
      const updated = await as(tx, IDS.viewerA, (t) => t`update products set name = 'hack' where id = ${IDS.productA1} returning id`);
      expect(updated.length).toBe(0);
      const err = await sqlError(
        as(tx, IDS.viewerA, (t) => t`insert into products (tenant_id, slug, name) values (${IDS.tenantA}, 'v', 'V')`),
      );
      expect(err.code).toBe("42501");
    });
  });

  it("viewer and other tenants cannot publish; the error does not reveal whether the storefront exists", async () => {
    await inRollback(sql, async (tx) => {
      const [sf] = await tx<{ id: string }[]>`select id from storefronts where slug = 'vuon-mau-demo'`;
      for (const who of [IDS.viewerA, IDS.ownerB]) {
        const err = await sqlError(as(tx, who, (t) => t`select publish_storefront(${sf!.id}, 1)`));
        expect(err.code).toBe("P0002");
      }
    });
  });

  it("editors cannot grant themselves a higher role or join other tenants", async () => {
    await inRollback(sql, async (tx) => {
      const updated = await as(tx, IDS.editorA, (t) => t`
        update memberships set role = 'owner' where tenant_id = ${IDS.tenantA} and user_id = ${IDS.editorA} returning role`);
      expect(updated.length).toBe(0);
      const err = await sqlError(
        as(tx, IDS.editorA, (t) => t`insert into memberships (tenant_id, user_id, role) values (${IDS.tenantB}, ${IDS.editorA}, 'owner')`),
      );
      expect(err.code).toBe("42501");
      const [row] = await tx<{ role: string }[]>`
        select role from memberships where tenant_id = ${IDS.tenantA} and user_id = ${IDS.editorA}`;
      expect(row?.role).toBe("editor");
    });
  });

  it("a tenant always keeps at least one owner", async () => {
    await inRollback(sql, async (tx) => {
      const err = await sqlError(
        as(tx, IDS.ownerB, (t) => t`delete from memberships where tenant_id = ${IDS.tenantB} and user_id = ${IDS.ownerB}`),
      );
      expect(err.code).toBe("23514");
    });
  });

  it("revoking a membership removes access immediately", async () => {
    await inRollback(sql, async (tx) => {
      await as(tx, IDS.ownerA, (t) => t`delete from memberships where tenant_id = ${IDS.tenantA} and user_id = ${IDS.viewerA}`);
      const rows = await as(tx, IDS.viewerA, (t) => t`select id from products`);
      expect(rows.length).toBe(0);
      const audit = await as(tx, IDS.ownerA, (t) => t<{ action: string }[]>`
        select action from audit_events where action = 'membership.delete'`);
      expect(audit.length).toBe(1);
    });
  });

  it("suspending a tenant removes member access", async () => {
    await inRollback(sql, async (tx) => {
      await tx`update tenants set status = 'suspended' where id = ${IDS.tenantA}`;
      const rows = await as(tx, IDS.ownerA, (t) => t`select id from products`);
      expect(rows.length).toBe(0);
    });
  });

  it("audit events are scoped to the tenant", async () => {
    await inRollback(sql, async (tx) => {
      const b = await as(tx, IDS.ownerB, (t) => t<{ tenant_id: string }[]>`select tenant_id from audit_events`);
      expect(b.length).toBeGreaterThan(0);
      expect(b.every((r) => r.tenant_id === IDS.tenantB)).toBe(true);
    });
  });
});

describe("anonymous visitors", () => {
  it("cannot read catalog, assets, memberships or audit tables", async () => {
    await inRollback(sql, async (tx) => {
      for (const table of ["products", "variants", "offers", "assets", "product_evidence", "memberships", "audit_events", "tenants", "ai_jobs", "ai_job_assets"]) {
        const err = await sqlError(as(tx, "anon", (t) => t.unsafe(`select 1 from public.${table} limit 1`)));
        expect(err.code, table).toBe("42501");
      }
    });
  });

  it("see only live storefronts and only their currently published version", async () => {
    await inRollback(sql, async (tx) => {
      const stores = await as(tx, "anon", (t) => t<{ slug: string }[]>`select slug from storefronts`);
      expect(stores.map((s) => s.slug)).toEqual(["vuon-mau-demo"]);
      const versions = await as(tx, "anon", (t) => t<{ kind: string }[]>`select kind from storefront_versions`);
      expect(versions.map((v) => v.kind)).toEqual(["published"]);
    });
  });

  it("have no EXECUTE privilege on command functions (Supabase grants it by default)", async () => {
    const rows = await sql<{ fn: string; allowed: boolean }[]>`
      select p.oid::regprocedure::text as fn, has_function_privilege('anon', p.oid, 'execute') as allowed
      from pg_proc p
      where p.pronamespace = 'public'::regnamespace
        and p.proname in ('create_tenant', 'approve_product', 'create_storefront', 'publish_storefront', 'rollback_storefront',
                          'enqueue_product_analysis', 'link_ai_job_product')`;
    expect(rows.length).toBe(7);
    expect(rows.filter((r) => r.allowed).map((r) => r.fn)).toEqual([]);
  });

  it("cannot call privileged functions", async () => {
    await inRollback(sql, async (tx) => {
      const err = await sqlError(as(tx, "anon", (t) => t`select approve_product(${IDS.productA3Draft})`));
      expect(err.code).toBe("42501");
      const err2 = await sqlError(as(tx, "anon", (t) => t`select create_tenant('x')`));
      expect(err2.code).toBe("42501");
    });
  });
});
