import { z } from "zod";
import { userClient } from "@/lib/supabase/server";
import { complete } from "@/lib/ai/anthropic";
import { fail, json } from "@/lib/http";

export const maxDuration = 60;
export const dynamic = "force-dynamic";
const Body = z.object({ brand: z.string().regex(/^[a-z0-9-]{2,20}$/), mode: z.enum(["text", "json"]), prompt: z.string().min(1).max(60_000) });

/** Single-shot writing help for the content studio and campaign planner (Contributors and above). */
export async function POST(req: Request) {
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return fail("Invalid request");
  const sb = await userClient();
  const { data: allowed } = await sb.rpc("has_role", { p_brand: body.data.brand, p_min: "contributor" });
  if (!allowed) return fail("Contributors and above can use AI writing", 403);
  try {
    return json(await complete(body.data.prompt, body.data.mode));
  } catch (e) {
    const code = (e as { code?: string }).code;
    return fail(code === "invalid_json" ? "invalid_json" : "The AI request didn't complete", 502);
  }
}
