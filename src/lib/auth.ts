import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Actor } from "./db";

/**
 * Who is calling, verified on the server.
 *
 * Production: the Supabase Auth session cookie, verified with `auth.getClaims()` (JWT signature check against the
 * project's keys). Development without Supabase: an explicit dev login (DEV_AUTH=1) that picks one of the seeded
 * local users. It is refused whenever NODE_ENV is production or Supabase Auth is configured.
 */

export const DEV_USER_COOKIE = "dev_user";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function supabaseAuthConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return !!(env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function devAuthEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.NODE_ENV !== "production" && env.DEV_AUTH === "1" && !supabaseAuthConfigured(env);
}

export async function supabaseServerClient() {
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Called from a Server Component: cookies are read-only there; the proxy refreshes the session.
        }
      },
    },
  });
}

export async function currentActor(): Promise<Actor> {
  if (supabaseAuthConfigured()) {
    const supabase = await supabaseServerClient();
    const { data, error } = await supabase.auth.getClaims();
    const sub = data?.claims?.sub;
    if (error || typeof sub !== "string" || !UUID_RE.test(sub)) return { role: "anon" };
    return { role: "authenticated", userId: sub };
  }
  if (devAuthEnabled()) {
    const id = (await cookies()).get(DEV_USER_COOKIE)?.value;
    if (id && UUID_RE.test(id)) return { role: "authenticated", userId: id };
  }
  return { role: "anon" };
}
