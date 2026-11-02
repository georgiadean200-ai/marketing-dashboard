import { userClient } from "@/lib/supabase/server";
import { fail, json } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Job status for the signed-in user (row level security limits it to their brands). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) return fail("Bad job id");
  const sb = await userClient();
  const { data } = await sb.from("jobs").select("id,type,status,attempts,last_error,result,updated_at").eq("id", Number(id)).maybeSingle();
  return data ? json(data) : fail("Not found", 404);
}
