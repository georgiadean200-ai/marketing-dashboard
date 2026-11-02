import { after } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { envStatus } from "@/lib/env";
import { runWorker } from "@/lib/jobs/worker";
import { fail, isCron, json } from "@/lib/http";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** Daily product refresh for every brand whose Shopify app is configured. Webhooks keep it current in between. */
export async function GET(req: Request) {
  if (!isCron(req)) return fail("Unauthorised", 401);
  const db = adminClient();
  const status = envStatus();
  const day = new Date().toISOString().slice(0, 10);
  const queued: string[] = [];
  for (const brand of ["ttc", "cto"]) {
    if (!status[brand === "ttc" ? "shopifyTtc" : "shopifyCto"]) continue;
    await db.rpc("enqueue_job", { p_type: "shopify.sync", p_brand: brand, p_payload: {}, p_dedupe: `sync-${brand}-${day}` });
    queued.push(brand);
  }
  after(() => runWorker(3));
  return json({ queued });
}
