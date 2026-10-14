import { NextResponse } from "next/server";
import { DomainError } from "@/lib/errors";
import { currentActor } from "@/lib/auth";

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const STATUS: Record<DomainError["code"], number> = { invalid: 400, forbidden: 403, not_found: 404, conflict: 409 };

export function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export function errorResponse(err: unknown) {
  if (err instanceof DomainError) {
    // Only placeholder notes are echoed back (the seller's own draft text); other details stay server-side.
    const pending = (err.details as { pending?: unknown } | undefined)?.pending;
    return json({ error: err.message, code: err.code, ...(Array.isArray(pending) ? { details: { pending: pending.slice(0, 5) } } : {}) }, STATUS[err.code]);
  }
  console.error("seller api error", err instanceof Error ? err.message : err);
  return json({ error: "Có lỗi xảy ra, vui lòng thử lại." }, 500);
}

/** Signed-in seller or a 401 response. */
export async function requireSeller() {
  const actor = await currentActor();
  if (actor.role !== "authenticated") return { actor: null, response: json({ error: "Cần đăng nhập" }, 401) } as const;
  return { actor, response: null } as const;
}
