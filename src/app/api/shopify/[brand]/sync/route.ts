import { after } from "next/server";
import { userClient } from "@/lib/supabase/server";
import { runWorker } from "@/lib/jobs/worker";
import { dbError, fail, json } from "@/lib/http";

export const maxDuration = 300;
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ brand: string }> };

/** Connection status for one brand's store. */
export async function GET(_req: Request, ctx: Ctx) {
  const { brand } = await ctx.params;
  const sb = await userClient();
  const { data } = await sb.from("shopify_connections").select("shop_domain,public_domain,shop_name,status,last_sync_at,product_count,last_error").eq("brand_id", brand).maybeSingle();
  return json({ connection: data });
}

/** Queues a product import for one brand (Approvers and above, checked in the database). */
export async function POST(_req: Request, ctx: Ctx) {
  const { brand } = await ctx.params;
  const sb = await userClient();
  const { data: jobId, error } = await sb.rpc("enqueue_job", { p_type: "shopify.sync", p_brand: brand, p_payload: {}, p_dedupe: `sync-${brand}-manual` });
  if (error) return fail(dbError(error), 403);
  after(() => runWorker(1));
  return json({ jobId });
}
