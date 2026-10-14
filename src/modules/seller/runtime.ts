import "server-only";
import { getSql } from "@/lib/db";
import { runPendingJobs } from "@/modules/ai/jobs";
import { defaultVisionProvider } from "@/modules/ai/vision";
import { defaultStorage } from "@/modules/media/storage";

/** Process queued analysis jobs with the configured provider and storage. Errors are recorded on the job. */
export async function drainAiJobs(limit = 2): Promise<number> {
  try {
    return await runPendingJobs(getSql(), { storage: defaultStorage(), provider: defaultVisionProvider() }, limit);
  } catch (err) {
    console.error("ai job runner failed", err instanceof Error ? err.message : err);
    return 0;
  }
}
