import type { SupabaseClient } from "@supabase/supabase-js";
import { brisbaneToIso } from "@/lib/content/constants";

type Suggestion = { fit?: boolean; series?: string; format?: string; caption?: string; credit?: string; productIds?: string[]; suggestedDate?: string;
  opportunity?: string; why?: string; storyIdea?: string; productNotes?: string };

/** Add to Calendar: creates a draft for review from a UGC recommendation, as the signed-in user. Nothing is
 *  approved or scheduled, and the database refuses approval until the creator's permission is on file. */
export async function draftFromUgc(sb: SupabaseClient, id: string): Promise<{ contentId?: string; already?: boolean; error?: string; status?: number }> {
  const { data: u } = await sb.from("ugc_items").select("id,brand_id,creator_handle,permalink,suggestion,asset_id,permission_status,attribution").eq("id", id).maybeSingle();
  if (!u) return { error: "Not found", status: 404 };
  const s = (u.suggestion ?? {}) as Suggestion;
  if (!s.fit || !s.caption || !s.suggestedDate) return { error: "Generate a caption first", status: 409 };
  const { data: existing } = await sb.from("content_items").select("id").eq("ugc_id", id).eq("archived", false).limit(1).maybeSingle();
  if (existing) return { contentId: existing.id, already: true };
  const credit = u.permission_status === "Permission granted" && u.attribution ? u.attribution : s.credit ?? `📷 @${u.creator_handle}`;
  const brief = [`Concept: ${s.opportunity ?? "Customer content"}. ${s.why ?? ""}`.trim(), `Uses @${u.creator_handle}'s post: ${u.permalink}`,
    `Creator permission: ${u.permission_status}. Credit as "${credit}".`, s.productNotes ? `Product match notes (confirm before approving): ${s.productNotes}` : "",
    s.storyIdea ? `Story frames: ${s.storyIdea}` : "", "Use the creator's original image only; don't crop out or alter their work."].filter(Boolean).join("\n");
  const { data, error } = await sb.from("content_items").insert({ brand_id: u.brand_id, ugc_id: id, title: `${s.series ?? "Customer Projects"}: @${u.creator_handle}`,
    series: s.series ?? "Customer Projects", channel: "Instagram", format: s.format ?? "Single image",
    scheduled_at: brisbaneToIso(`${s.suggestedDate}T18:00`), caption: `${s.caption}\n\n${credit}`, hashtags: [], product_ids: s.productIds ?? [],
    asset_ids: u.asset_id ? [u.asset_id] : [], brief, status: "Needs Review" }).select("id").single();
  if (error) return { error: error.message, status: 403 };
  return { contentId: data.id };
}
