import postgres from "postgres";
import { resetDatabase } from "../../scripts/lib/reset-db.mjs";
import { TEST_DATABASE_URL } from "./config";

export const IDS = {
  tenantA: "1a000000-0000-4000-8000-000000000001",
  tenantB: "1b000000-0000-4000-8000-000000000001",
  ownerA: "00000000-0000-4000-8000-0000000000a1",
  editorA: "00000000-0000-4000-8000-0000000000a2",
  viewerA: "00000000-0000-4000-8000-0000000000a3",
  ownerB: "00000000-0000-4000-8000-0000000000b1",
  productA1: "2a000000-0000-4000-8000-000000000001",
  productA2: "2a000000-0000-4000-8000-000000000002",
  productA3Draft: "2a000000-0000-4000-8000-000000000003",
  productB1: "2b000000-0000-4000-8000-000000000001",
  variantA1: "3a000000-0000-4000-8000-000000000001",
  variantA2: "3a000000-0000-4000-8000-000000000002",
} as const;

export function connect() {
  return postgres(TEST_DATABASE_URL, {
    prepare: false,
    onnotice: () => {},
    types: { bigint: postgres.BigInt },
    max: 4,
  });
}

export const resetTestDatabase = () => resetDatabase(TEST_DATABASE_URL);

type Tx = postgres.TransactionSql;
export type Who = "anon" | string;

const ROLLBACK = Symbol("rollback");

/** Runs fn in a transaction that is always rolled back, so tests never change the shared seed. */
export async function inRollback(sql: postgres.Sql, fn: (tx: Tx) => Promise<void>): Promise<void> {
  try {
    await sql.begin(async (tx) => {
      await fn(tx);
      throw ROLLBACK;
    });
  } catch (err) {
    if (err !== ROLLBACK) throw err;
  }
}

/**
 * Runs fn as a Supabase actor (anon or an authenticated user id) inside a savepoint, then returns to the owner role.
 * A failing statement only rolls back the savepoint, so a test can assert on errors and keep going.
 */
export async function as<T>(tx: Tx, who: Who, fn: (sp: Tx) => Promise<T>): Promise<T> {
  return (await tx.savepoint(async (sp) => {
    const claims = who === "anon" ? { role: "anon" } : { role: "authenticated", sub: who };
    await sp`select set_config('request.jwt.claims', ${JSON.stringify(claims)}, true)`;
    await sp.unsafe(who === "anon" ? "set local role anon" : "set local role authenticated");
    // On failure the savepoint rollback also reverts the role/claims set above.
    const result = await fn(sp);
    await sp.unsafe("reset role");
    await sp`select set_config('request.jwt.claims', '', true)`;
    return result;
  })) as T;
}

/** Asserts that fn fails with the given SQLSTATE and returns the error message. */
export async function sqlError(promise: Promise<unknown>): Promise<{ code: string; message: string }> {
  try {
    await promise;
  } catch (err) {
    const e = err as { code?: string; message?: string };
    return { code: e.code ?? "unknown", message: e.message ?? "" };
  }
  throw new Error("expected the statement to fail");
}
