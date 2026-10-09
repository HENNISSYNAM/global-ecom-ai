import { z } from "zod";
import type { ChatProvider, ChatReply } from "./provider";
import type { PublishedStorefront } from "@/modules/storefront/public-read";

/** Validates and bounds what a visitor can send. History lives in the browser; nothing is stored server-side yet. */
export const chatRequestSchema = z
  .object({
    messages: z
      .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(1000) }).strict())
      .min(1)
      .max(20),
  })
  .strict()
  .refine((r) => r.messages.at(-1)?.role === "user", "the last message must come from the user")
  .refine((r) => r.messages[0]?.role === "user", "the conversation must start with the user");

export type ChatRequest = z.infer<typeof chatRequestSchema>;

export async function answer(provider: ChatProvider, store: PublishedStorefront, request: ChatRequest): Promise<ChatReply> {
  // Keep the most recent turns only, still starting on a user turn.
  let turns = request.messages.slice(-12);
  while (turns.length && turns[0]!.role !== "user") turns = turns.slice(1);
  return provider.reply(store, turns);
}

/** Fixed-window limiter per key. In-memory, so it is per server instance — enough for the pilot, not for scale. */
export function createRateLimiter(limit: number, windowMs: number) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (key: string, now = Date.now()): boolean => {
    const entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      if (hits.size > 10_000) for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
      return true;
    }
    entry.count += 1;
    return entry.count <= limit;
  };
}
