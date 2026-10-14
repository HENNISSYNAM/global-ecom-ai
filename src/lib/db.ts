import "server-only";
import postgres from "postgres";

/**
 * Server-side Postgres access.
 *
 * Every request-scoped query runs inside a transaction that switches to the Supabase `anon` or `authenticated`
 * role and sets `request.jwt.claims`, so Row Level Security applies exactly as it does for PostgREST. The
 * connection user itself (table owner) bypasses RLS and is only used by `withPrivileged`, which callers must
 * pair with an explicit tenant/permission check.
 */

export type Sql = postgres.Sql;
export type Tx = postgres.TransactionSql;

export type Actor = { role: "anon" } | { role: "authenticated"; userId: string };

const globalForDb = globalThis as unknown as { __agriSql?: Sql };

export function getSql(): Sql {
  if (!globalForDb.__agriSql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    globalForDb.__agriSql = postgres(url, {
      max: 10,
      // Supabase's transaction pooler does not support prepared statements.
      prepare: false,
      types: { bigint: postgres.BigInt },
    });
  }
  return globalForDb.__agriSql;
}

export async function withActor<T>(sql: Sql, actor: Actor, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const claims =
    actor.role === "anon" ? { role: "anon" } : { role: "authenticated", sub: actor.userId, aud: "authenticated" };
  const result = await sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${JSON.stringify(claims)}, true)`;
    // Role names are constants, never user input.
    await tx.unsafe(actor.role === "anon" ? "set local role anon" : "set local role authenticated");
    return fn(tx);
  });
  return result as T;
}

/** Bypasses RLS. Use only from server code that has already verified tenant and action. */
export async function withPrivileged<T>(sql: Sql, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return (await sql.begin(fn)) as T;
}
