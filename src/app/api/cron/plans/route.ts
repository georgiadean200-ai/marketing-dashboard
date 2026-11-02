import { after } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { runWorker } from "@/lib/jobs/worker";
import { fail, isCron, json } from "@/lib/http";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** Runs daily; on Thursdays (Brisbane) it prepares next week's posts, and on the third Thursday next month's plan.
 *  Everything it creates goes to the approval queue. A brand can switch either off in its guidelines (automation). */
export async function GET(req: Request) {
  if (!isCron(req)) return fail("Unauthorised", 401);
  const now = new Date(Date.now() + 10 * 3600_000); // Brisbane wall-clock
  if (now.getUTCDay() !== 4) return json({ skipped: "Plans run on Thursdays" });
  const db = adminClient();
  const { data: brands } = await db.from("brands").select("id,guidelines");
  const monday = new Date(now); monday.setUTCDate(now.getUTCDate() + 4);
  const weekOf = monday.toISOString().slice(0, 10);
  const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const monthName = nextMonth.toLocaleDateString("en-AU", { month: "long", year: "numeric", timeZone: "UTC" });
  const queued: string[] = [];
  for (const b of brands ?? []) {
    const auto = ((b.guidelines as Record<string, unknown>)?.automation ?? {}) as { weekly?: boolean; monthly?: boolean };
    const { count } = await db.from("shopify_connections").select("brand_id", { count: "exact", head: true }).eq("brand_id", b.id).eq("status", "connected");
    if (!count) continue; // never plan from a brand without real products
    if (auto.weekly !== false) {
      await db.rpc("enqueue_job", { p_type: "ai.plan", p_brand: b.id, p_dedupe: `week-${b.id}-${weekOf}`,
        p_payload: { forReview: true, request: `Prepare the week starting Monday ${weekOf}: one post for each of Monday, Wednesday and Friday following the weekly structure, using varied in-stock products. Save them for approval.` } });
      queued.push(`${b.id}:week`);
    }
    if (auto.monthly !== false && now.getUTCDate() >= 15 && now.getUTCDate() <= 21) {
      await db.rpc("enqueue_job", { p_type: "ai.plan", p_brand: b.id, p_dedupe: `month-${b.id}-${nextMonth.toISOString().slice(0, 7)}`,
        p_payload: { forReview: true, request: `Plan all content for ${monthName}: cover every Monday, Wednesday and Friday, add other series where they fit, and suggest one campaign idea. Save the posts for approval.` } });
      queued.push(`${b.id}:month`);
    }
  }
  after(() => runWorker(2));
  return json({ queued });
}
