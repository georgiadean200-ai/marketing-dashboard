import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/** Supabase client acting as the signed-in user. Every query runs under row level security. */
export async function userClient() {
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try { list.forEach(({ name, value, options }) => store.set(name, value, options)); } catch { /* called from a Server Component */ }
      },
    },
  });
}

/** The signed-in user and their role in each brand, or null. */
export async function currentUser() {
  const sb = await userClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data: memberships } = await sb.from("memberships").select("brand_id, role, can_publish").eq("user_id", user.id);
  const { data: profile } = await sb.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
  const roles: Record<string, string> = {};
  const canPublish: Record<string, boolean> = {};
  (memberships ?? []).forEach((m: { brand_id: string; role: string; can_publish: boolean }) => { roles[m.brand_id] = m.role; canPublish[m.brand_id] = m.can_publish; });
  return { id: user.id, email: user.email ?? "", name: profile?.display_name ?? "", roles, canPublish };
}
