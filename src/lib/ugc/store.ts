import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseStore } from "@/lib/ai/store";
import { brisbaneToIso, isoToBrisbane } from "@/lib/content/constants";
import type { RecommenderStore, UgcCandidate } from "./recommender";

const LOOKS = ["travertine", "terrazzo", "subway", "herringbone", "marble", "timber", "hexagon", "zellige", "concrete", "mosaic", "fluted", "stone", "carrara"];

/** Database access for the recommender, pinned to one brand. Skips anything used, dismissed, duplicated,
 *  already on the calendar, or recommended in the last four weeks (unless specific posts are requested). */
export async function ugcStore(db: SupabaseClient, brandId: string): Promise<RecommenderStore> {
  const products = await supabaseStore(db, brandId);
  return {
    brand: products.brand,
    async candidates({ limit, ids }) {
      let q = db.from("ugc_items").select("id,creator_handle,caption,media_type,preview_url,posted_at,permalink,relevance_score,relevance_reasons,product_matches,permission_status,attribution,sources,last_recommended_at,status,duplicate_of")
        .eq("brand_id", brandId);
      if (ids?.length) q = q.in("id", ids);
      const { data } = await q.order("relevance_score", { ascending: false }).limit(ids?.length ? ids.length : 400);
      const { data: used } = await db.from("content_items").select("ugc_id").eq("brand_id", brandId).neq("archived", true);
      const onCalendar = new Set((used ?? []).map((r: { ugc_id: string | null }) => r.ugc_id).filter(Boolean));
      const cutoff = Date.now() - 28 * 86_400_000;
      return ((data ?? []) as (UgcCandidate & { last_recommended_at: string | null; status: string; duplicate_of: string | null })[])
        .filter((u) => ids?.length || (!["used", "dismissed"].includes(u.status) && !u.duplicate_of && !onCalendar.has(u.id)
          && u.permission_status !== "Permission declined" && (!u.last_recommended_at || new Date(u.last_recommended_at).getTime() < cutoff)))
        .slice(0, limit);
    },
    async productsFor(c) {
      const byMatch = await products.productsByIds(c.product_matches);
      const looks = LOOKS.filter((w) => c.caption.toLowerCase().includes(w)).slice(0, 2);
      const extra = [];
      for (const w of looks) extra.push(...(await products.searchProducts({ query: w, inStockOnly: true, limit: 8 })).products);
      const all = new Map([...byMatch, ...extra].map((p) => [p.id, p]));
      return [...all.values()].slice(0, 15);
    },
    catalogueTitles: () => products.catalogueTitles(),
    async takenDates(from, to) {
      const { data } = await db.from("content_items").select("scheduled_at").eq("brand_id", brandId).eq("archived", false)
        .gte("scheduled_at", brisbaneToIso(`${from}T00:00`)!).lte("scheduled_at", brisbaneToIso(`${to}T23:59`)!);
      return [...new Set((data ?? []).map((r: { scheduled_at: string }) => isoToBrisbane(r.scheduled_at).slice(0, 10)))];
    },
    async save(id, s) {
      const { data: cur } = await db.from("ugc_items").select("times_recommended").eq("id", id).single();
      const { error } = await db.from("ugc_items").update({ suggestion: s, last_recommended_at: new Date().toISOString(),
        times_recommended: (cur?.times_recommended ?? 0) + 1, ...(s.fit ? { status: "recommended" } : {}) }).eq("id", id);
      if (error) throw new Error(`Could not save recommendation: ${error.message}`);
    },
  };
}
