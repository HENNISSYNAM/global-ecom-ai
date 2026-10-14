import { cookies } from "next/headers";
import { DEV_USER_COOKIE, devAuthEnabled } from "@/lib/auth";

/** Development only (DEV_AUTH=1, no Supabase Auth, not production): sign in as a seeded local user. */
export async function POST(request: Request) {
  if (!devAuthEnabled()) return new Response("not found", { status: 404 });
  const form = await request.formData();
  const id = String(form.get("userId") ?? "");
  const store = await cookies();
  if (/^[0-9a-f-]{36}$/.test(id)) store.set(DEV_USER_COOKIE, id, { httpOnly: true, sameSite: "lax", path: "/" });
  else store.delete(DEV_USER_COOKIE);
  return Response.redirect(new URL("/ban-hang", request.url), 303);
}
