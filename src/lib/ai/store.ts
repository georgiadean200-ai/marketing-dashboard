import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isoToBrisbane, brisbaneToIso } from "@/lib/content/constants";
import type { Brand, DraftRow, PlannerProduct, PlannerStore } from "./planner";

type ProductRecord = { id: string; title: string; size: string; finish: string; colour: string; specs: Record<string, string>; tags: string[];
  description: string; kind: string; inventory: number | null; url: string; vendor: string };
const COLS = "id,title,size,finish,colour,specs,tags,description,kind,inventory,url,vendor";

/** The planner's only window into the database: every query is pinned to one brand. */
export async function supabaseStore(db: SupabaseClient, brandId: string): Promise<PlannerStore> {
  const { data: brand, error } = await db.from("brands").select("id,name,short_name,guidelines").eq("id", brandId).single<Brand>();
  if (error || !brand) throw new Error(`Unknown brand ${brandId}`);
  let titles: { id: string; title: string }[] | null = null;
  let featured: Map<string, string> | null = null;
  const lastFeatured = async () => {
    if (featured) return featured;
    const { data } = await db.from("content_items").select("product_ids,scheduled_at").eq("brand_id", brandId).in("status", ["Approved", "Scheduled", "Published"]);
    featured = new Map();
    for (const r of data ?? []) for (const id of r.product_ids as string[]) {
      const d = isoToBrisbane(r.scheduled_at); if (d && (!featured.has(id) || featured.get(id)! < d)) featured.set(id, d);
    }
    return featured;
  };
  const enrich = async (rows: ProductRecord[]): Promise<PlannerProduct[]> => {
    const ids = rows.map((r) => r.id);
    const { data: assets } = ids.length ? await db.from("assets").select("id,product_id").eq("brand_id", brandId).eq("approved", true).in("product_id", ids) : { data: [] };
    const f = await lastFeatured();
    return rows.map((r) => ({ ...r, specs: r.specs ?? {}, tags: r.tags ?? [], lastFeatured: f.get(r.id) ?? null,
      approvedAssetId: (assets ?? []).find((a: { product_id: string }) => a.product_id === r.id)?.id ?? null }));
  };
  return {
    brand,
    async searchProducts(q) {
      let query = db.from("products").select(COLS).eq("brand_id", brandId).eq("active", true).limit(5000);
      if (!q.includeAccessories) query = query.eq("kind", "tile");
      const { data } = await query;
      const words = (q.query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
      const f = await lastFeatured();
      const cutoff = q.notFeaturedDays ? Date.now() - q.notFeaturedDays * 86_400_000 : null;
      const hits = ((data ?? []) as ProductRecord[]).filter((p) =>
        (!q.inStockOnly || p.inventory == null || p.inventory > 0) &&
        words.every((w) => `${p.title} ${p.size} ${p.colour} ${p.finish} ${p.vendor} ${(p.tags ?? []).join(" ")}`.toLowerCase().includes(w)) &&
        (!cutoff || !f.get(p.id) || new Date(brisbaneToIso(f.get(p.id)!)!).getTime() < cutoff));
      return { total: hits.length, products: await enrich(hits.slice(0, q.limit ?? 30)) };
    },
    async productsByIds(ids) {
      if (!ids.length) return [];
      const { data } = await db.from("products").select(COLS).eq("brand_id", brandId).in("id", ids);
      return enrich((data ?? []) as ProductRecord[]);
    },
    async catalogueTitles() {
      if (titles) return titles;
      const { data } = await db.from("products").select("id,title").eq("brand_id", brandId).eq("active", true).limit(5000);
      titles = (data ?? []) as { id: string; title: string }[];
      return titles;
    },
    async listContent(from, to) {
      const start = brisbaneToIso(`${from}T00:00`), end = brisbaneToIso(`${to}T23:59`);
      if (!start || !end) return [];
      const { data } = await db.from("content_items").select("title,scheduled_at,channel,format,series,status,product_ids")
        .eq("brand_id", brandId).eq("archived", false).gte("scheduled_at", start).lte("scheduled_at", end).order("scheduled_at");
      return (data ?? []).map((r) => ({ title: r.title, date: isoToBrisbane(r.scheduled_at), channel: r.channel, format: r.format, series: r.series, status: r.status, products: r.product_ids }));
    },
    async insertDraft(row: DraftRow) {
      const { data, error } = await db.from("content_items").insert(row).select("id,status").single();
      if (error) throw new Error(`Could not save draft: ${error.message}`);
      return data as { id: string; status: string };
    },
  };
}
