import "server-only";
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

export const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
export const fail = (message: string, status = 400) => json({ error: message }, status);

/** Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. */
export function isCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const got = req.headers.get("authorization") ?? "";
  if (!secret || secret.length < 24) return false;
  const want = `Bearer ${secret}`;
  return got.length === want.length && timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

/** Turns database permission errors into readable messages. */
export function dbError(e: { message?: string; code?: string } | null): string {
  if (!e) return "Unknown error";
  if (e.code === "42501") return e.message?.replace(/^.*?:\s*/, "") || "You don't have permission to do that.";
  return e.message ?? "Database error";
}
