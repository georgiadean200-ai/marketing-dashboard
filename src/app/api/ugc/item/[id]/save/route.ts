import { randomUUID } from "node:crypto";
import { userClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { fail, json } from "@/lib/http";

export const maxDuration = 60;
export const dynamic = "force-dynamic";
const META_CDN = /(^|\.)(cdninstagram\.com|fbcdn\.net)$/i;

/** Save to Content Library: copies the creator's image into private storage ONLY after permission is granted for
 *  social use. The database refuses the copy otherwise. The saved image still needs normal image approval. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sb = await userClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return fail("Sign in first", 401);
  const { data: u } = await sb.from("ugc_items").select("id,brand_id,preview_url,creator_handle,asset_id,product_matches,media_type").eq("id", id).maybeSingle();
  if (!u) return fail("Not found", 404);
  const { data: canEdit } = await sb.rpc("has_role", { p_brand: u.brand_id, p_min: "contributor" });
  if (!canEdit) return fail("Contributors and above can save media", 403);
  const { data: ok } = await sb.rpc("ugc_permission_ok", { p_ugc: id });
  if (!ok) return fail("Record the creator's permission (including social use) before saving their media", 403);
  if (u.asset_id) return json({ assetId: u.asset_id, already: true });
  if (!u.preview_url) return fail("No downloadable media from Instagram for this post (videos with licensed audio aren't provided). Ask the creator to send the file and upload it in the media library.", 409);
  const src = new URL(u.preview_url);
  if (src.protocol !== "https:" || !META_CDN.test(src.hostname)) return fail("Unexpected media host", 400);
  const res = await fetch(src, { cache: "no-store" });
  if (!res.ok) return fail("The Instagram preview link has expired. Run 'Check for new content' to refresh it, then try again.", 409);
  const type = res.headers.get("content-type") ?? "image/jpeg";
  if (!/^image\/|^video\//.test(type)) return fail("Unexpected media type", 400);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > 25 * 1024 * 1024) return fail("File too large", 413);
  const admin = adminClient();
  const ext = type.includes("png") ? "png" : type.startsWith("video/") ? "mp4" : "jpg";
  const path = `${u.brand_id}/ugc-${id}-${randomUUID().slice(0, 8)}.${ext}`;
  const up = await admin.storage.from("media").upload(path, buf, { contentType: type, upsert: false });
  if (up.error) return fail(`Upload failed: ${up.error.message}`, 500);
  const { data: asset, error } = await admin.from("assets").insert({ brand_id: u.brand_id, storage_path: path, file_name: `@${u.creator_handle} ${id}.${ext}`,
    content_type: type, ugc_id: id, product_id: u.product_matches?.[0] ?? null, uploaded_by: user.id }).select("id").single();
  if (error) { await admin.storage.from("media").remove([path]); return fail(error.message, 403); }
  await admin.from("ugc_items").update({ asset_id: asset.id }).eq("id", id);
  await admin.rpc("log_event", { p_brand: u.brand_id, p_action: "UGC saved to library", p_detail: `@${u.creator_handle} (permission on file)`, p_agent: "ugc-discovery" });
  return json({ assetId: asset.id });
}
