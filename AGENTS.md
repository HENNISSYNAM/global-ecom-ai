<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Project rules (global-ecom-ai)

Multi-tenant platform where AI helps agricultural sellers create their own storefront. Read
`docs/reference/agri-commerce/` (start with `CLAUDE_START_HERE.md`) and `docs/decisions/` before changing code.

- Package manager: **npm** (lockfile committed). Node >= 22.
- Checks before pushing: `npm run typecheck`, `npm test` (needs a local Postgres, see README), `npm run build`.
- Database changes go in a new file under `supabase/migrations/`; never edit an applied migration once merged.
  `tests/db/supabase-shim.sql` is for local/tests only and must never be applied to Supabase.
- Every tenant-owned table: `tenant_id`, RLS enabled, explicit grants, composite FKs `(tenant_id, parent_id)`,
  `prevent_tenant_change` trigger. Add isolation tests for any new table.
- Never authorize with a `tenant_id` sent by the client. Derive the tenant from the row being accessed or from
  membership on the server. Privileged (RLS-bypassing) code must check tenant + role explicitly.
- Public pages read only the published storefront version (`catalog` snapshot); they never query catalog tables.
- Money: integer minor units (`bigint`), never floats. Quantities: `numeric` kept as strings end to end.
- Never invent seller facts (price, weight, origin, certification, capacity, ratings). Unknown = null + ask.
  Demo data must be labelled demo. No `Offer` with price 0 for "contact for price".
- Storefront layout is data: sections from the allowlist in `src/modules/storefront/sections.ts`. No raw HTML,
  scripts or styles from sellers or the AI.
