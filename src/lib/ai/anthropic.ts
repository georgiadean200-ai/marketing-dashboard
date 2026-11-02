import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";
import type { ModelClient } from "./planner";

let client: Anthropic | null = null;
function sdk() { return (client ??= new Anthropic({ apiKey: env().ANTHROPIC_API_KEY, maxRetries: 3 })); }

export const model = (): ModelClient => ({
  create: (p) => sdk().messages.create(p as Parameters<Anthropic["messages"]["create"]>[0]) as unknown as ReturnType<ModelClient["create"]>,
});

/** Single-shot generation for the studio's "Generate with AI", rewrite and campaign buttons. */
export async function complete(prompt: string, mode: "text" | "json"): Promise<{ text?: string; data?: unknown }> {
  const res = await sdk().messages.create({
    model: env().ANTHROPIC_MODEL, max_tokens: 4000,
    system: mode === "json" ? "Reply with only valid JSON. No preamble and no code fences." : "Reply with only the requested text.",
    messages: [{ role: "user", content: prompt }],
  });
  const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
  if (mode === "text") return { text };
  const clean = text.replace(/^```(?:json)?\s*|\s*```$/g, "");
  try { return { data: JSON.parse(clean) }; } catch { throw Object.assign(new Error("The AI reply wasn't valid JSON"), { code: "invalid_json" }); }
}
