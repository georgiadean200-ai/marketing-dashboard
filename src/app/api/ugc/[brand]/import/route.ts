import { z } from "zod";
import { userClient } from "@/lib/supabase/server";
import { parseLaterImport } from "@/lib/ugc/normalize";
import { dbError, fail, json } from "@/lib/http";

export const dynamic = "force-dynamic";
const Body = z.object({ text: z.string().min(1).max(200_000), source: z.enum(["later_import", "manual"]).default("later_import") });

/** Adds posts collected in Later (or found by hand) from pasted links or a CSV. Stores links and details only;
 *  existing posts are skipped, so importing the same list twice is harmless. */
export async function POST(req: Request, ctx: { params: Promise<{ brand: string }> }) {
  const { brand } = await ctx.params;
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return fail("Paste Instagram post links or a CSV");
  const { rows, errors } = parseLaterImport(body.data.text);
  if (!rows.length) return fail(errors[0] ?? "No Instagram post links found");
  const sb = await userClient();
  const { data, error } = await sb.from("ugc_items").upsert(rows.slice(0, 500).map((r) => ({ brand_id: brand, fingerprint: r.fingerprint, sources: [body.data.source],
    permalink: r.permalink, creator_handle: r.creator_handle, caption: r.caption, posted_at: r.posted_at, permission_evidence: "" })),
    { onConflict: "brand_id,fingerprint", ignoreDuplicates: true }).select("id");
  if (error) return fail(dbError(error), 403);
  return json({ added: data?.length ?? 0, alreadyHad: rows.length - (data?.length ?? 0), errors: errors.slice(0, 20) });
}
