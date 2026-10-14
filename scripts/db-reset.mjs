// Recreates the LOCAL development database: Supabase shim + migrations + demo seed.
// Usage: npm run db:reset [-- --no-seed]. Refuses to touch anything that is not on localhost.
import { resetDatabase } from "./lib/reset-db.mjs";

const url = process.env.DATABASE_URL ?? "postgres://agri:agri@localhost:5432/agri_dev";
const applied = await resetDatabase(url, { seed: !process.argv.includes("--no-seed") });
for (const f of applied) console.log(`applied ${f}`);
