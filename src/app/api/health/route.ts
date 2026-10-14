import { diagnoseDatabase } from "@/lib/db-diagnostics";

export const dynamic = "force-dynamic";

/** Deployment self-check. Reports which settings are present and why the database fails — never their values. */
export async function GET() {
  const env = process.env;
  const db = await diagnoseDatabase();
  const present = (k: string) => Boolean(env[k]);
  return Response.json(
    {
      ok: db.ok,
      database: db,
      env: {
        DATABASE_URL: present("DATABASE_URL"),
        SITE_URL: present("SITE_URL"),
        NEXT_PUBLIC_SUPABASE_URL: present("NEXT_PUBLIC_SUPABASE_URL"),
        NEXT_PUBLIC_SUPABASE_ANON_KEY: present("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
        SUPABASE_SERVICE_ROLE_KEY: present("SUPABASE_SERVICE_ROLE_KEY"),
        AI_BASE_URL: present("AI_BASE_URL"),
        AI_API_KEY: present("AI_API_KEY"),
        AI_MODEL: present("AI_MODEL"),
        CRON_SECRET: present("CRON_SECRET"),
      },
    },
    { status: db.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
