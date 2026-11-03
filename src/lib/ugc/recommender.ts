// UGC recommendation agent: reviews discovered posts and recommends the strongest opportunities, each with an
// original caption, verified products and a suggested date. It writes suggestions only; people decide what is used.
import { avoidWordHits, factIssues } from "@/lib/content/facts";
import type { Brand, PlannerProduct } from "@/lib/ai/planner";
import { OPPORTUNITY_TO_SERIES, UGC_OPPORTUNITIES, type Opportunity } from "./score";

export type UgcCandidate = { id: string; creator_handle: string; caption: string; media_type: string; preview_url: string | null; posted_at: string | null;
  permalink: string; relevance_score: number | null; relevance_reasons: string[]; product_matches: string[]; permission_status: string; attribution: string; sources: string[] };
export type UgcSuggestion = { fit: boolean; opportunity?: Opportunity; series?: string; format?: string; strength?: number; why: string; caption?: string;
  credit?: string; productIds?: string[]; productNotes?: string; suggestedDate?: string; storyIdea?: string; problems: string[]; model: string; at: string };
export interface RecommenderStore {
  brand: Brand;
  candidates(o: { limit: number; ids?: string[] }): Promise<UgcCandidate[]>;
  productsFor(c: UgcCandidate): Promise<PlannerProduct[]>;
  catalogueTitles(): Promise<{ id: string; title: string }[]>;
  takenDates(from: string, to: string): Promise<string[]>;
  save(id: string, s: UgcSuggestion): Promise<void>;
}
type Block = { type: string; name?: string; input?: unknown };
export interface RecModel { create(p: Record<string, unknown>): Promise<{ content: Block[] }> }

const ymd = (d: Date) => new Date(d.getTime() + 10 * 3600_000).toISOString().slice(0, 10); // Brisbane date
const addDays = (s: string, n: number) => { const d = new Date(`${s}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const weekday = (s: string) => new Date(`${s}T00:00:00Z`).getUTCDay();

/** Picks a free date: the suggested one if valid, otherwise the next free Monday/Wednesday/Friday
 *  (or the opportunity's own weekday, e.g. Monday for Monday Inspiration). */
export function chooseDate(suggested: string | undefined, opp: Opportunity, now: Date, taken: Set<string>): string {
  const today = ymd(now), first = addDays(today, 1), last = addDays(today, 60);
  const wanted = OPPORTUNITY_TO_SERIES[opp].weekday;
  const ok = (d: string) => d >= first && d <= last && !taken.has(d) && (wanted == null || weekday(d) === wanted);
  if (suggested && /^\d{4}-\d{2}-\d{2}$/.test(suggested) && ok(suggested)) return suggested;
  for (let d = addDays(today, 2); d <= last; d = addDays(d, 1)) {
    if (taken.has(d)) continue;
    if (wanted != null ? weekday(d) === wanted : [1, 3, 5].includes(weekday(d))) return d;
  }
  return addDays(today, 7);
}

const TOOL = {
  name: "record_recommendation",
  description: "Record your recommendation for this creator post.",
  input_schema: { type: "object", required: ["fit", "why"], properties: {
    fit: { type: "boolean", description: "Is this a strong, on-brand opportunity worth sharing?" },
    opportunity: { type: "string", enum: [...UGC_OPPORTUNITIES] },
    strength: { type: "integer", minimum: 1, maximum: 5 },
    why: { type: "string", description: "One or two sentences on why (or why not)." },
    caption: { type: "string", description: "An original caption in the brand's voice. Do not copy the creator's caption, do not include their handle or a credit line (added automatically), and do not state any product fact that isn't in the verified product list." },
    productIds: { type: "array", items: { type: "string" }, description: "Only ids from the verified product list that this post genuinely appears to feature." },
    productNotes: { type: "string", description: "What makes you think these products match, and how sure you are." },
    suggestedDate: { type: "string", description: "YYYY-MM-DD" },
    storyIdea: { type: "string", description: "For Instagram Stories: the frames and sticker idea." } } },
};

export async function recommendUgc(args: { store: RecommenderStore; model: RecModel; modelName: string; now?: Date; limit?: number; ids?: string[] }) {
  const now = args.now ?? new Date();
  const b = args.store.brand, g = b.guidelines as Record<string, string>;
  const cands = await args.store.candidates({ limit: args.limit ?? 12, ids: args.ids });
  const titles = await args.store.catalogueTitles();
  const taken = new Set(await args.store.takenDates(ymd(now), addDays(ymd(now), 61)));
  const out: { id: string; suggestion: UgcSuggestion }[] = [];
  const system = `You review Instagram posts that customers, designers, builders and creators made featuring ${b.name}, and recommend which to share.
Brand voice: ${g.voice ?? ""}
Audience: ${g.audience ?? ""}
Never use these words: ${g.avoid || "none"}. Australian English.
Opportunity types: ${UGC_OPPORTUNITIES.join("; ")}.
Rules: judge the image and caption honestly; mark fit false for anything off-brand, low quality, not clearly featuring tiles, or showing a competitor. Product matches are suggestions for a person to confirm: only use ids from the verified list, and say how confident you are. Never invent prices, stock, sizes or specifications. Write an original caption; never reuse the creator's words except a short quote marked as theirs.`;
  for (const c of cands) {
    const products = await args.store.productsFor(c);
    const list = products.map((p) => ({ id: p.id, name: p.title, size: p.size || "not specified", finish: p.finish || "not specified", colour: p.colour || "not specified", specs: p.specs }));
    const text = `Creator: @${c.creator_handle || "unknown"}
Posted: ${c.posted_at ? ymd(new Date(c.posted_at)) : "unknown"}   Source: ${c.sources.join(", ")}   Media: ${c.media_type || "unknown"}
Their caption: """${c.caption.slice(0, 1500)}"""
Relevance signals: ${c.relevance_reasons.join("; ") || "none"}
Verified products from ${b.name}'s Shopify catalogue (only these may be used): ${JSON.stringify(list)}
Dates already taken on the calendar: ${[...taken].slice(0, 40).join(", ") || "none"}. Today is ${ymd(now)}.`;
    const content: unknown[] = [{ type: "text", text }];
    if (c.preview_url) content.unshift({ type: "image", source: { type: "url", url: c.preview_url } });
    let input: Record<string, unknown> | null = null;
    for (const withImage of c.preview_url ? [true, false] : [false]) {
      try {
        const res = await args.model.create({ model: args.modelName, max_tokens: 1500, system, tools: [TOOL], tool_choice: { type: "tool", name: TOOL.name },
          messages: [{ role: "user", content: withImage ? content : content.filter((x) => (x as { type: string }).type === "text") }] });
        input = (res.content.find((x) => x.type === "tool_use")?.input ?? null) as Record<string, unknown> | null;
        if (input) break;
      } catch (e) { if (!withImage) throw e; } // the preview link may have expired; try again from the caption alone
    }
    const base = { model: args.modelName, at: now.toISOString(), problems: [] as string[] };
    if (!input || input.fit !== true) {
      const s: UgcSuggestion = { ...base, fit: false, why: String(input?.why ?? "Not a strong fit.") };
      await args.store.save(c.id, s); out.push({ id: c.id, suggestion: s }); continue;
    }
    const opp = (UGC_OPPORTUNITIES as readonly string[]).includes(String(input.opportunity)) ? (input.opportunity as Opportunity) : "Customer Projects";
    const allowed = new Map(products.map((p) => [p.id, p]));
    const chosen = ((input.productIds as string[] | undefined) ?? []).filter((id) => allowed.has(id));
    const dropped = ((input.productIds as string[] | undefined) ?? []).filter((id) => !allowed.has(id));
    const caption = String(input.caption ?? "").replace(/\n*📷.*$/s, "").trim();
    const problems = [...factIssues(caption, chosen.map((id) => allowed.get(id)!), titles), ...avoidWordHits(caption, String(g.avoid ?? "")).map((w) => `Uses off-brand word "${w}"`)];
    if (dropped.length) problems.push(`Ignored ${dropped.length} product suggestion(s) not in the verified catalogue`);
    const credit = c.permission_status === "Permission granted" && c.attribution ? c.attribution : `📷 @${c.creator_handle}`;
    const date = chooseDate(input.suggestedDate as string | undefined, opp, now, taken);
    taken.add(date);
    const s: UgcSuggestion = { ...base, fit: true, opportunity: opp, series: OPPORTUNITY_TO_SERIES[opp].series, format: OPPORTUNITY_TO_SERIES[opp].format,
      strength: Math.max(1, Math.min(5, Number(input.strength) || 3)), why: String(input.why ?? ""),
      caption: problems.some((p) => !p.startsWith("Ignored")) ? undefined : caption, credit, productIds: chosen,
      productNotes: String(input.productNotes ?? ""), suggestedDate: date, storyIdea: input.storyIdea ? String(input.storyIdea) : undefined, problems };
    await args.store.save(c.id, s);
    out.push({ id: c.id, suggestion: s });
  }
  return out;
}
