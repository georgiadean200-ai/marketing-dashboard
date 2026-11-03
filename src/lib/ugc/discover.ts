import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MEDIA_FIELDS, graphFor, igCreds, type GraphGet, type IgMedia } from "@/lib/instagram/client";
import { canonicalPermalink, captionHash, fingerprintFor, normalizeHandle } from "./normalize";
import { scoreUgc, type CatalogueEntry } from "./score";

type Existing = { id: string; fingerprint: string; sources: string[]; caption: string; caption_hash: string | null; creator_handle: string };

/** Finds new tagged posts and processes queued caption @mentions for one brand's own Instagram account.
 *  Stores metadata and a short-lived preview link only; no third-party media is downloaded. */
export async function discoverBrand(brand: string, deps: { db: SupabaseClient; graph?: GraphGet; igUserId?: string; maxPages?: number }) {
  const db = deps.db;
  const creds = deps.graph ? null : igCreds(brand);
  const graph = deps.graph ?? graphFor(creds!);
  const igUserId = deps.igUserId ?? creds!.igUserId;
  const me = await graph<{ id: string; username: string }>(igUserId, { fields: "id,username" });
  const conn = await db.from("instagram_connections").upsert({ brand_id: brand, ig_user_id: me.id, username: me.username, status: "connected", last_error: null, updated_at: new Date().toISOString() }, { onConflict: "brand_id" });
  if (conn.error) throw new Error(`Could not save the Instagram connection: ${conn.error.message}`);

  const { data: prods } = await db.from("products").select("id,title,tags,kind,inventory").eq("brand_id", brand).eq("active", true).limit(5000);
  const catalogue = (prods ?? []) as CatalogueEntry[];
  const found: { m: IgMedia; source: "instagram_tag" | "instagram_mention" }[] = [];

  // Tagged posts: listable, newest first.
  let after: string | undefined;
  for (let page = 0; page < (deps.maxPages ?? 4); page++) {
    const r = await graph<{ data: IgMedia[]; paging?: { cursors?: { after?: string }; next?: string } }>(`${igUserId}/tags`, { fields: MEDIA_FIELDS, limit: "50", ...(after ? { after } : {}) });
    r.data.forEach((m) => found.push({ m, source: "instagram_tag" }));
    after = r.paging?.next ? r.paging.cursors?.after : undefined;
    if (!after) break;
  }
  // Caption @mentions: only the ones Meta sent to our webhook.
  const { data: events } = await db.from("ig_mention_events").select("id,media_id").eq("brand_id", brand).is("processed_at", null).limit(200);
  for (const ev of events ?? []) {
    try {
      const r = await graph<{ mentioned_media?: IgMedia }>(igUserId, { fields: `mentioned_media.media_id(${ev.media_id}){${MEDIA_FIELDS}}` });
      if (r.mentioned_media) found.push({ m: r.mentioned_media, source: "instagram_mention" });
      await db.from("ig_mention_events").update({ processed_at: new Date().toISOString(), error: null }).eq("id", ev.id);
    } catch (e) {
      await db.from("ig_mention_events").update({ error: e instanceof Error ? e.message.slice(0, 300) : "error" }).eq("id", ev.id);
    }
  }

  const fps = [...new Set(found.map(({ m }) => fingerprintFor({ permalink: m.permalink, externalId: m.id })).filter(Boolean))] as string[];
  const { data: rows } = fps.length ? await db.from("ugc_items").select("id,fingerprint,sources,caption,caption_hash,creator_handle").eq("brand_id", brand).in("fingerprint", fps) : { data: [] };
  const existing = new Map(((rows ?? []) as Existing[]).map((r) => [r.fingerprint, r]));
  let added = 0, refreshed = 0, duplicates = 0;
  const now = new Date().toISOString();
  for (const { m, source } of found) {
    const fp = fingerprintFor({ permalink: m.permalink, externalId: m.id });
    if (!fp) continue;
    const preview = m.media_type === "VIDEO" ? m.thumbnail_url ?? null : m.media_url ?? m.children?.data?.find((c) => c.media_url)?.media_url ?? m.thumbnail_url ?? null;
    const prior = existing.get(fp);
    if (prior) {
      const sources = [...new Set([...prior.sources, source])];
      await db.from("ugc_items").update({ external_id: m.id, preview_url: preview, preview_refreshed_at: now, sources,
        ...(prior.caption ? {} : { caption: m.caption ?? "" }), ...(prior.creator_handle ? {} : { creator_handle: normalizeHandle(m.username ?? "") }) }).eq("id", prior.id);
      prior.sources = sources; refreshed++;
      continue;
    }
    const handle = normalizeHandle(m.username ?? "");
    const hash = captionHash(handle, m.caption ?? "");
    let duplicateOf: string | null = null;
    if (hash) {
      const { data: twin } = await db.from("ugc_items").select("id").eq("brand_id", brand).eq("caption_hash", hash).limit(1).maybeSingle();
      duplicateOf = twin?.id ?? null;
    }
    const s = scoreUgc({ caption: m.caption ?? "", creator_handle: handle, media_type: m.media_type ?? "", preview_url: preview, posted_at: m.timestamp ?? null, sources: [source] }, catalogue);
    const ins = await db.from("ugc_items").insert({ brand_id: brand, fingerprint: fp, sources: [source], external_id: m.id,
      permalink: m.permalink ? canonicalPermalink(m.permalink) : "", creator_handle: handle, caption: m.caption ?? "", caption_hash: hash,
      media_type: m.media_type ?? "", preview_url: preview, preview_refreshed_at: now, posted_at: m.timestamp ?? null,
      relevance_score: s.score, relevance_reasons: s.reasons, product_matches: s.productMatches, duplicate_of: duplicateOf,
      status: duplicateOf ? "dismissed" : "new" }).select("id").single();
    if (ins.error) { if (ins.error.code === "23505") continue; throw new Error(`Could not save UGC: ${ins.error.message}`); }
    existing.set(fp, { id: ins.data.id, fingerprint: fp, sources: [source], caption: m.caption ?? "", caption_hash: hash, creator_handle: handle });
    if (duplicateOf) duplicates++; else added++;
  }
  await db.from("instagram_connections").update({ last_tags_sync_at: now, ...(events?.length ? { last_mention_at: now } : {}) }).eq("brand_id", brand);
  await db.rpc("log_event", { p_brand: brand, p_action: "UGC discovery", p_detail: `${added} new, ${refreshed} refreshed, ${duplicates} duplicates skipped`, p_agent: "ugc-discovery" });
  return { added, refreshed, duplicates, mentionsProcessed: events?.length ?? 0 };
}
