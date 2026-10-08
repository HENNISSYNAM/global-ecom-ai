import { afterAll, describe, expect, it } from "vitest";
import { as, connect, IDS, inRollback, sqlError } from "../db/helpers";

const sql = connect();
afterAll(() => sql.end());

const objectIn = (tenant: string, file = "goc/anh.jpg") => `${tenant}/${file}`;

describe("storage policies", () => {
  it("editors upload only into their own tenant folder in the private bucket", async () => {
    await inRollback(sql, async (tx) => {
      await as(tx, IDS.editorA, (t) => t`insert into storage.objects (bucket_id, name) values ('tenant-private', ${objectIn(IDS.tenantA)})`);

      const cross = await sqlError(
        as(tx, IDS.editorA, (t) => t`insert into storage.objects (bucket_id, name) values ('tenant-private', ${objectIn(IDS.tenantB)})`),
      );
      expect(cross.code).toBe("42501");

      const malformed = await sqlError(
        as(tx, IDS.editorA, (t) => t`insert into storage.objects (bucket_id, name) values ('tenant-private', 'not-a-uuid/anh.jpg')`),
      );
      expect(malformed.code).toBe("42501");

      const publicBucket = await sqlError(
        as(tx, IDS.editorA, (t) => t`insert into storage.objects (bucket_id, name) values ('tenant-public', ${objectIn(IDS.tenantA)})`),
      );
      expect(publicBucket.code).toBe("42501");

      const viewer = await sqlError(
        as(tx, IDS.viewerA, (t) => t`insert into storage.objects (bucket_id, name) values ('tenant-private', ${objectIn(IDS.tenantA, "v.jpg")})`),
      );
      expect(viewer.code).toBe("42501");
    });
  });

  it("private objects are readable by members only", async () => {
    await inRollback(sql, async (tx) => {
      await tx`insert into storage.objects (bucket_id, name) values ('tenant-private', ${objectIn(IDS.tenantA)})`;
      expect((await as(tx, IDS.viewerA, (t) => t`select name from storage.objects`)).length).toBe(1);
      expect((await as(tx, IDS.ownerB, (t) => t`select name from storage.objects`)).length).toBe(0);
      expect((await as(tx, "anon", (t) => t`select name from storage.objects`)).length).toBe(0);
      const deleted = await as(tx, IDS.ownerB, (t) => t`delete from storage.objects returning name`);
      expect(deleted.length).toBe(0);
    });
  });
});

describe("asset records", () => {
  const asset = (tenant: string, key: string) => ({
    tenant_id: tenant,
    kind: "product_image",
    bucket: "tenant-private",
    object_key: key,
    mime_type: "image/jpeg",
    byte_size: 1024,
    sha256: "a".repeat(64),
    uploaded_by: IDS.editorA,
  });

  it("object keys must live under the owning tenant's folder", async () => {
    await inRollback(sql, async (tx) => {
      const err = await sqlError(as(tx, IDS.editorA, (t) => t`insert into assets ${t(asset(IDS.tenantA, objectIn(IDS.tenantB)))}`));
      expect(err.code).toBe("23514");
      await as(tx, IDS.editorA, (t) => t`insert into assets ${t(asset(IDS.tenantA, objectIn(IDS.tenantA)))}`);
    });
  });

  it("clients cannot create public or pre-approved assets", async () => {
    await inRollback(sql, async (tx) => {
      const err = await sqlError(
        as(tx, IDS.editorA, (t) => t`insert into assets ${t({ ...asset(IDS.tenantA, objectIn(IDS.tenantA)), review_status: "approved" })}`),
      );
      expect(err.code).toBe("42501");
    });
  });

  it("public assets must be approved and stored in the public bucket", async () => {
    await inRollback(sql, async (tx) => {
      const err = await sqlError(
        tx`insert into assets ${tx({ ...asset(IDS.tenantA, objectIn(IDS.tenantA)), visibility: "public" })}`,
      );
      expect(err.code).toBe("23514");
    });
  });
});
