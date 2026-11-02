import "server-only";
import { randomUUID } from "node:crypto";
import { adminClient } from "@/lib/supabase/admin";
import { syncBrand } from "@/lib/shopify/sync";
import { runPlanner } from "@/lib/ai/planner";
import { supabaseStore } from "@/lib/ai/store";
import { model } from "@/lib/ai/anthropic";
import { env } from "@/lib/env";

type Job = { id: number; type: string; brand_id: string | null; payload: Record<string, unknown>; attempts: number };

async function handle(job: Job): Promise<unknown> {
  const db = adminClient();
  if (!job.brand_id) throw new Error("Job has no brand");
  if (job.type === "shopify.sync") return syncBrand(job.brand_id);
  if (job.type === "ai.plan") {
    const p = job.payload as { messages?: { role: "user" | "assistant"; content: string }[]; request?: string; userId?: string | null; forReview?: boolean; chat?: boolean };
    const messages = p.messages?.length ? p.messages : [{ role: "user" as const, content: p.request ?? "Prepare next week's content for approval." }];
    const result = await runPlanner({ store: await supabaseStore(db, job.brand_id), model: model(), modelName: env().ANTHROPIC_MODEL,
      messages, forReview: p.forReview ?? true, userId: p.userId ?? null });
    if (p.chat && p.userId) {
      await db.from("chat_messages").insert({ user_id: p.userId, brand_id: job.brand_id, role: "assistant", content: result.text || "Done.", created_ids: result.createdIds });
    }
    await db.rpc("log_event", { p_brand: job.brand_id, p_action: "AI plan finished", p_detail: `${result.createdIds.length} drafts saved, ${result.rejected.length} rejected by fact checks`, p_agent: "planner" });
    return result;
  }
  throw new Error(`No handler for ${job.type}`);
}

/** Claims and runs queued jobs. Safe to call from several places at once: each job is claimed by one worker. */
export async function runWorker(limit = 3): Promise<{ ran: number; failed: number }> {
  const db = adminClient();
  const workerId = `w-${randomUUID().slice(0, 8)}`;
  const { data: jobs, error } = await db.rpc("claim_jobs", { p_worker: workerId, p_limit: limit });
  if (error) throw new Error(`Could not claim jobs: ${error.message}`);
  let failed = 0;
  for (const job of (jobs ?? []) as Job[]) {
    try {
      const result = await handle(job);
      await db.rpc("finish_job", { p_id: job.id, p_ok: true, p_result: result as object });
    } catch (e) {
      failed++;
      await db.rpc("finish_job", { p_id: job.id, p_ok: false, p_error: e instanceof Error ? e.message.slice(0, 1000) : "Unknown error" });
    }
  }
  return { ran: (jobs ?? []).length, failed };
}
