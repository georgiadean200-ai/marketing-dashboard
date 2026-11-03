import { after } from "next/server";
import { z } from "zod";
import { userClient } from "@/lib/supabase/server";
import { runWorker } from "@/lib/jobs/worker";
import { dbError, fail, json } from "@/lib/http";

export const maxDuration = 300;
export const dynamic = "force-dynamic";
const Body = z.object({ ids: z.array(z.string().max(64)).max(20).optional() }).optional();

/** Runs the recommendation agent on the strongest new posts, or on the posts given (Generate caption). */
export async function POST(req: Request, ctx: { params: Promise<{ brand: string }> }) {
  const { brand } = await ctx.params;
  const body = Body.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return fail("Invalid request");
  const sb = await userClient();
  const ids = body.data?.ids;
  const { data: jobId, error } = await sb.rpc("enqueue_job", { p_type: "ugc.recommend", p_brand: brand, p_payload: { ids: ids ?? null },
    p_dedupe: ids?.length ? null : `ugc-recommend-${brand}-manual` });
  if (error) return fail(dbError(error), 403);
  after(() => runWorker(1));
  return json({ jobId });
}
