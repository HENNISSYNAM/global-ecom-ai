import { after } from "next/server";
import { getSql } from "@/lib/db";
import { getJobForSeller } from "@/modules/ai/jobs";
import { drainAiJobs } from "@/modules/seller/runtime";
import { errorResponse, json, requireSeller, UUID_RE } from "../../_lib/respond";

export const maxDuration = 120;

export async function GET(_request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { actor, response } = await requireSeller();
  if (!actor) return response;
  const { jobId } = await params;
  if (!UUID_RE.test(jobId)) return json({ error: "Không tìm thấy lượt phân tích" }, 404);
  try {
    const job = await getJobForSeller(getSql(), actor, jobId);
    // Recovery without a separate worker: a queued job or one whose worker died is picked up on the next poll.
    if (job.runnable) after(() => drainAiJobs(1));
    return json(job);
  } catch (err) {
    return errorResponse(err);
  }
}
