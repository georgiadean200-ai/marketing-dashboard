import { createHmac, timingSafeEqual } from "node:crypto";
import { adminClient } from "@/lib/supabase/admin";
import { fail, json } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Shopify product webhooks (create/update/delete). Signed with the brand's app client secret; each verified
 *  event schedules one de-duplicated sync of that brand's own store a few minutes later. */
export async function POST(req: Request) {
  const raw = await req.text();
  const shop = req.headers.get("x-shopify-shop-domain") ?? "";
  const sig = req.headers.get("x-shopify-hmac-sha256") ?? "";
  const brand = ["ttc", "cto"].find((b) => process.env[`SHOPIFY_${b.toUpperCase()}_SHOP`] === shop);
  const secret = brand ? process.env[`SHOPIFY_${brand.toUpperCase()}_CLIENT_SECRET`] : undefined;
  if (!brand || !secret) return fail("Unknown shop", 401);
  const want = createHmac("sha256", secret).update(raw, "utf8").digest("base64");
  if (sig.length !== want.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return fail("Bad signature", 401);
  await adminClient().rpc("enqueue_job", { p_type: "shopify.sync", p_brand: brand, p_payload: { reason: req.headers.get("x-shopify-topic") },
    p_dedupe: `sync-${brand}-webhook`, p_run_after: new Date(Date.now() + 3 * 60_000).toISOString() });
  return json({ ok: true });
}
