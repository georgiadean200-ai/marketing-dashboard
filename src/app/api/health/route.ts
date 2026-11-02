import { envStatus } from "@/lib/env";
import { adminClient } from "@/lib/supabase/admin";
import { currentUser } from "@/lib/supabase/server";
import { fail, json } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Setup check for signed-in staff: which settings are present (never their values) and whether the database
 *  recognises the server key as server code. */
export async function GET() {
  if (!(await currentUser())) return fail("Sign in first", 401);
  const settings = envStatus();
  let database = "not checked", serverKeyRecognised = false, brands = 0;
  if (settings.supabaseSecretKey) {
    try {
      const db = adminClient();
      const { count } = await db.from("brands").select("id", { count: "exact", head: true });
      brands = count ?? 0;
      const { data } = await db.rpc("whoami");
      serverKeyRecognised = Boolean((data as { service?: boolean } | null)?.service);
      database = "reachable";
    } catch (e) { database = e instanceof Error ? e.message : "unreachable"; }
  }
  return json({ settings, database, brands, serverKeyRecognised });
}
