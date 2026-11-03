import { after } from "next/server";
import { userClient } from "@/lib/supabase/server";
import { runWorker } from "@/lib/jobs/worker";
import { dbError, fail, json } from "@/lib/http";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** Checks Instagram for new tagged posts and queued mentions (Approvers and above, checked in the database). */
export async function POST(_req: Request, ctx: { params: Promise<{ brand: string }> }) {
  const { brand } = await ctx.params;
  const sb = await userClient();
  const { data: jobId, error } = await sb.rpc("enqueue_job", { p_type: "ugc.discover", p_brand: brand, p_payload: {}, p_dedupe: `ugc-discover-${brand}-manual` });
  if (error) return fail(dbError(error), 403);
  after(() => runWorker(1));
  return json({ jobId });
}
