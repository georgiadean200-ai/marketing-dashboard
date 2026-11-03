import { after } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { igConfigured } from "@/lib/instagram/client";
import { runWorker } from "@/lib/jobs/worker";
import { fail, isCron, json } from "@/lib/http";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** Weekly (Monday 7 am Brisbane): find new creator content, then prepare recommendations for approval. */
export async function GET(req: Request) {
  if (!isCron(req)) return fail("Unauthorised", 401);
  const db = adminClient();
  const week = new Date().toISOString().slice(0, 10);
  const queued: string[] = [];
  for (const brand of ["ttc", "cto"]) {
    const { data: brandRow } = await db.from("brands").select("guidelines").eq("id", brand).maybeSingle();
    if ((brandRow?.guidelines as { automation?: { ugc?: boolean } } | null)?.automation?.ugc === false) continue;
    if (igConfigured(brand)) {
      await db.rpc("enqueue_job", { p_type: "ugc.discover", p_brand: brand, p_payload: { reason: "weekly" }, p_dedupe: `ugc-discover-${brand}-${week}` });
      queued.push(`${brand}:discover`);
    }
    await db.rpc("enqueue_job", { p_type: "ugc.recommend", p_brand: brand, p_payload: { weekly: true }, p_dedupe: `ugc-recommend-${brand}-${week}`,
      p_run_after: new Date(Date.now() + 10 * 60_000).toISOString() });
    queued.push(`${brand}:recommend`);
  }
  after(() => runWorker(2));
  return json({ queued });
}
