import { userClient } from "@/lib/supabase/server";
import { draftFromUgc } from "@/lib/ugc/draft";
import { fail, json } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Add to Calendar from a UGC recommendation (creates a draft for review only). */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const r = await draftFromUgc(await userClient(), id);
  return r.error ? fail(r.error, r.status ?? 400) : json(r);
}
