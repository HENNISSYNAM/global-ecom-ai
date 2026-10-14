import { timingSafeEqual } from "node:crypto";
import { drainAiJobs } from "@/modules/seller/runtime";

export const maxDuration = 300;

/** Recovery sweep for analysis jobs (Vercel Cron sends `Authorization: Bearer $CRON_SECRET`). */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (!secret || given.length !== expected.length || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
    return new Response("unauthorized", { status: 401 });
  }
  const processed = await drainAiJobs(5);
  return Response.json({ processed }, { headers: { "Cache-Control": "no-store" } });
}
