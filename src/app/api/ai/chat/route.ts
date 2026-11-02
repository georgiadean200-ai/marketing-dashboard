import { after } from "next/server";
import { z } from "zod";
import { userClient } from "@/lib/supabase/server";
import { runWorker } from "@/lib/jobs/worker";
import { dbError, fail, json } from "@/lib/http";

export const maxDuration = 300;
export const dynamic = "force-dynamic";
const Body = z.object({ brand: z.string().regex(/^[a-z0-9-]{2,20}$/), message: z.string().min(1).max(4000) });

/** Saves the message, queues the planner as a background job, and returns the job id to poll. */
export async function POST(req: Request) {
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return fail("Invalid request");
  const sb = await userClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return fail("Sign in first", 401);
  const { brand, message } = body.data;
  const ins = await sb.from("chat_messages").insert({ brand_id: brand, role: "user", content: message });
  if (ins.error) return fail(dbError(ins.error), 403);
  const { data: history } = await sb.from("chat_messages").select("role,content").eq("brand_id", brand).order("id", { ascending: false }).limit(20);
  const messages = (history ?? []).reverse().map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
  // enqueue_job checks the caller's role in the database (Contributors and above).
  const { data: jobId, error } = await sb.rpc("enqueue_job", { p_type: "ai.plan", p_brand: brand,
    p_payload: { userId: user.id, chat: true, messages, forReview: /approv|review/i.test(message) } });
  if (error) return fail(dbError(error), 403);
  after(() => runWorker(1));
  return json({ jobId });
}
