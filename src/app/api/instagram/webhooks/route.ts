import { createHmac, timingSafeEqual } from "node:crypto";
import { adminClient } from "@/lib/supabase/admin";
import { fail, json } from "@/lib/http";

export const dynamic = "force-dynamic";
const brandFor = (igUserId: string) => ["ttc", "cto"].find((b) => process.env[`META_${b.toUpperCase()}_IG_USER_ID`] === igUserId);

/** Meta's verification handshake when subscribing the webhook. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const token = process.env.META_WEBHOOK_VERIFY_TOKEN;
  if (token && u.searchParams.get("hub.mode") === "subscribe" && u.searchParams.get("hub.verify_token") === token) {
    return new Response(u.searchParams.get("hub.challenge") ?? "", { status: 200 });
  }
  return fail("Forbidden", 403);
}

/** Caption and comment @mentions. Meta doesn't store these, so each is queued for the next discovery run. */
export async function POST(req: Request) {
  const raw = await req.text();
  const secret = process.env.META_APP_SECRET;
  const sig = req.headers.get("x-hub-signature-256") ?? "";
  if (!secret) return fail("Not configured", 503);
  const want = "sha256=" + createHmac("sha256", secret).update(raw, "utf8").digest("hex");
  if (sig.length !== want.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return fail("Bad signature", 401);
  const body = JSON.parse(raw) as { entry?: { id: string; changes?: { field: string; value?: { media_id?: string; comment_id?: string } }[] }[] };
  const db = adminClient();
  const brands = new Set<string>();
  for (const e of body.entry ?? []) {
    const brand = brandFor(e.id);
    if (!brand) continue;
    for (const ch of e.changes ?? []) {
      if (ch.field !== "mentions" || !ch.value?.media_id) continue;
      await db.from("ig_mention_events").upsert({ brand_id: brand, media_id: ch.value.media_id, comment_id: ch.value.comment_id ?? null },
        { onConflict: "brand_id,media_id,comment_id", ignoreDuplicates: true });
      brands.add(brand);
    }
  }
  for (const b of brands) await db.rpc("enqueue_job", { p_type: "ugc.discover", p_brand: b, p_payload: { reason: "mention" },
    p_dedupe: `ugc-discover-${b}-webhook`, p_run_after: new Date(Date.now() + 5 * 60_000).toISOString() });
  return json({ ok: true });
}
