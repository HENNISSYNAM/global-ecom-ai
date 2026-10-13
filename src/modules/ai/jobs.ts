import { withActor, withPrivileged, type Actor, type Sql } from "@/lib/db";
import { DomainError, fromPgError } from "@/lib/errors";
import type { ObjectStorage } from "@/modules/media/storage";
import { sanitizeDraft, type ProductDraft } from "./product-draft";
import type { VisionProvider } from "./vision";

/**
 * Background analysis jobs.
 *
 * - Claim: one job at a time with `for update skip locked`; a lease marks it running. A job whose lease expired
 *   (worker crashed or timed out) becomes claimable again.
 * - Fencing: completion and failure only apply while the job is still running under the same attempt number.
 * - Retry: exponential backoff; after `max_attempts` the job is dead and the seller can enqueue it again.
 *
 * Callers: the upload route (right after the response), the status route when it sees a runnable job, the cron
 * route and `npm run worker`. All use the owner connection; each step only touches the claimed job's tenant.
 */

export const LEASE_SECONDS = 180;

type ClaimedJob = {
  id: string;
  tenant_id: string;
  attempts: number;
  max_attempts: number;
  seller_note: string | null;
};

export async function claimNextJob(sql: Sql): Promise<ClaimedJob | null> {
  return withPrivileged(sql, async (tx) => {
    // Jobs that ran out of attempts while running (lease expired on the last attempt) are dead.
    await tx`
      update public.ai_jobs
      set status = 'dead', lease_until = null, finished_at = now(),
          last_error = coalesce(last_error, 'worker stopped before finishing')
      where status = 'running' and lease_until < now() and attempts >= max_attempts
    `;
    const rows = await tx<ClaimedJob[]>`
      update public.ai_jobs j
      set status = 'running', attempts = j.attempts + 1,
          lease_until = now() + make_interval(secs => ${LEASE_SECONDS})
      where j.id = (
        select id from public.ai_jobs
        where ((status = 'queued' and run_after <= now()) or (status = 'running' and lease_until < now()))
          and attempts < max_attempts
        order by run_after
        for update skip locked
        limit 1
      )
      returning j.id, j.tenant_id, j.attempts, j.max_attempts, j.seller_note
    `;
    return rows[0] ?? null;
  });
}

/** Stores the result if this worker still holds the job. Returns false when a newer attempt owns it. */
export async function completeJob(
  sql: Sql,
  job: { id: string; attempts: number },
  result: { output: ProductDraft; provider: string; model: string; promptVersion: string; usage: Record<string, number> | null },
): Promise<boolean> {
  const rows = await withPrivileged(sql, (tx) => tx`
    update public.ai_jobs
    set status = 'succeeded', output = ${tx.json(result.output as never)}, provider = ${result.provider},
        model = ${result.model}, prompt_version = ${result.promptVersion},
        usage = ${result.usage ? tx.json(result.usage) : null}, lease_until = null, last_error = null, finished_at = now()
    where id = ${job.id} and status = 'running' and attempts = ${job.attempts}
    returning id
  `);
  return rows.length === 1;
}

export async function failJob(sql: Sql, job: { id: string; attempts: number }, error: string): Promise<void> {
  const message = error.slice(0, 500);
  await withPrivileged(sql, (tx) => tx`
    update public.ai_jobs
    set status = case when attempts >= max_attempts then 'dead'::public.ai_job_status else 'queued' end,
        run_after = now() + make_interval(secs => least(600, 20 * power(3, attempts - 1))),
        lease_until = null,
        last_error = ${message},
        finished_at = case when attempts >= max_attempts then now() else null end
    where id = ${job.id} and status = 'running' and attempts = ${job.attempts}
  `);
}

export async function processJob(
  sql: Sql,
  job: ClaimedJob,
  deps: { storage: ObjectStorage; provider: VisionProvider },
): Promise<"succeeded" | "failed" | "stale"> {
  try {
    const assets = await withPrivileged(sql, (tx) => tx<{ id: string; bucket: string; object_key: string; mime_type: string }[]>`
      select a.id, a.bucket, a.object_key, a.mime_type
      from public.ai_job_assets ja
      join public.assets a on a.tenant_id = ja.tenant_id and a.id = ja.asset_id
      where ja.job_id = ${job.id} and ja.tenant_id = ${job.tenant_id}
      order by ja.position
    `);
    if (!assets.length) throw new Error("job has no photos");
    const images = await Promise.all(
      assets.map(async (a) => ({
        assetId: a.id,
        mimeType: a.mime_type,
        data: await deps.storage.get(a.bucket as "tenant-private", a.object_key),
      })),
    );
    const { raw, usage } = await deps.provider.analyzeProductImages(images, job.seller_note);
    const output = sanitizeDraft(raw, assets.map((a) => a.id), { mock: deps.provider.isMock });
    const ok = await completeJob(sql, job, {
      output,
      provider: deps.provider.name,
      model: deps.provider.model,
      promptVersion: deps.provider.promptVersion,
      usage,
    });
    return ok ? "succeeded" : "stale";
  } catch (err) {
    await failJob(sql, job, err instanceof Error ? err.message : "unknown error");
    return "failed";
  }
}

/** Drains up to `limit` runnable jobs. Safe to call concurrently from several places. */
export async function runPendingJobs(
  sql: Sql,
  deps: { storage: ObjectStorage; provider: VisionProvider },
  limit = 3,
): Promise<number> {
  let done = 0;
  for (let i = 0; i < limit; i++) {
    const job = await claimNextJob(sql);
    if (!job) break;
    await processJob(sql, job, deps);
    done++;
  }
  return done;
}

export type SellerJobView = {
  id: string;
  tenantId: string;
  status: "queued" | "running" | "succeeded" | "dead";
  attempts: number;
  lastError: string | null;
  provider: string | null;
  draft: ProductDraft | null;
  productId: string | null;
  assetIds: string[];
  runnable: boolean;
};

/** The seller's view of a job. RLS limits it to members of the job's tenant. */
export async function getJobForSeller(sql: Sql, actor: Actor, jobId: string): Promise<SellerJobView> {
  try {
    return await withActor(sql, actor, async (tx) => {
      const rows = await tx<{
        id: string;
        tenant_id: string;
        status: SellerJobView["status"];
        attempts: number;
        last_error: string | null;
        provider: string | null;
        output: ProductDraft | null;
        product_id: string | null;
        asset_ids: string[] | null;
        runnable: boolean;
      }[]>`
        select j.id, j.tenant_id, j.status, j.attempts, j.last_error, j.provider, j.output, j.product_id,
          (select array_agg(ja.asset_id order by ja.position) from public.ai_job_assets ja where ja.job_id = j.id) as asset_ids,
          ((j.status = 'queued' and j.run_after <= now()) or (j.status = 'running' and j.lease_until < now())) as runnable
        from public.ai_jobs j
        where j.id = ${jobId}
      `;
      const r = rows[0];
      if (!r) throw new DomainError("not_found", "Không tìm thấy lượt phân tích");
      return {
        id: r.id,
        tenantId: r.tenant_id,
        status: r.status,
        attempts: r.attempts,
        // Provider errors are already reduced to a status code; keep them short for the seller.
        lastError: r.last_error ? r.last_error.slice(0, 200) : null,
        provider: r.provider,
        draft: r.output,
        productId: r.product_id,
        assetIds: r.asset_ids ?? [],
        runnable: r.runnable,
      };
    });
  } catch (err) {
    throw fromPgError(err) ?? err;
  }
}
