"use server";
import { headers } from "next/headers";
import { z } from "zod";
import { userClient } from "@/lib/supabase/server";

/** Emails a sign-in link. Invite-only: unknown addresses get the same message and no account is created. */
export async function sendLink(_prev: { message: string }, form: FormData): Promise<{ message: string }> {
  const email = z.string().email().safeParse(String(form.get("email") ?? "").trim());
  if (!email.success) return { message: "Enter a valid email address." };
  const h = await headers();
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const sb = await userClient();
  await sb.auth.signInWithOtp({ email: email.data, options: { shouldCreateUser: false, emailRedirectTo: `${origin}/auth/callback` } });
  return { message: "If that address has access, a sign-in link is on its way. It expires in an hour." };
}
