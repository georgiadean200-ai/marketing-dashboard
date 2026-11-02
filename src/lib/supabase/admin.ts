import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

/** Server-only client with the secret key, for background jobs and integrations. Bypasses row level security,
 *  but not the database triggers: approvals, audit log and brand isolation still apply. Never import in client code. */
export function adminClient() {
  const e = env();
  return createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
