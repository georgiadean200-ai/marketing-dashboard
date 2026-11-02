import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { userClient } from "@/lib/supabase/server";

/** Completes sign-in from the emailed link (PKCE code or token hash). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const sb = await userClient();
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const { error } = code ? await sb.auth.exchangeCodeForSession(code)
    : tokenHash && type ? await sb.auth.verifyOtp({ token_hash: tokenHash, type }) : { error: new Error("missing") };
  return NextResponse.redirect(new URL(error ? "/login?error=link" : "/studio", url.origin));
}
