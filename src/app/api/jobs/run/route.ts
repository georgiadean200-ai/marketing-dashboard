import { runWorker } from "@/lib/jobs/worker";
import { fail, isCron, json } from "@/lib/http";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isCron(req)) return fail("Unauthorised", 401);
  return json(await runWorker(5));
}
