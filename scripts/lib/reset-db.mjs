// Recreates a LOCAL database from the Supabase shim + migrations (+ optional demo seed).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

const root = new URL("../..", import.meta.url).pathname;

export async function resetDatabase(connectionString, { seed = true } = {}) {
  const url = new URL(connectionString);
  if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
    throw new Error(`Refusing to reset non-local database host ${url.hostname}`);
  }
  const dbName = url.pathname.slice(1);
  if (!/^[a-z0-9_]+$/.test(dbName)) throw new Error(`unexpected database name ${dbName}`);
  const opts = {
    host: url.hostname,
    port: Number(url.port || 5432),
    username: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    onnotice: () => {},
  };

  const admin = postgres({ ...opts, database: "postgres" });
  await admin.unsafe(`drop database if exists ${dbName} with (force)`);
  await admin.unsafe(`create database ${dbName}`);
  await admin.end();

  const files = [
    join(root, "tests/db/supabase-shim.sql"),
    ...readdirSync(join(root, "supabase/migrations")).sort().map((f) => join(root, "supabase/migrations", f)),
    ...(seed ? [join(root, "supabase/seed.sql")] : []),
  ];
  const sql = postgres({ ...opts, database: dbName });
  try {
    for (const file of files) await sql.unsafe(readFileSync(file, "utf8"));
  } finally {
    await sql.end();
  }
  return files.map((f) => f.slice(root.length));
}
