// The AI marketing planner: a tool-using loop that can only search this brand's products, read its calendar
// and save drafts. Every draft is checked against the brand rules and Shopify facts before it is saved, and
// drafts never skip human approval.
import { CHANNELS, FORMATS, SERIES, brisbaneToIso } from "@/lib/content/constants";
import { avoidWordHits, copyText, factIssues, type FactProduct } from "@/lib/content/facts";

export type Brand = { id: string; name: string; short_name: string; guidelines: Record<string, unknown> };
export type PlannerProduct = FactProduct & { kind: string; inventory: number | null; url: string; vendor: string; lastFeatured: string | null; approvedAssetId: string | null };
export type DraftRow = {
  brand_id: string; title: string; series: string; channel: string; format: string; scheduled_at: string; caption: string;
  hashtags: string[]; product_ids: string[]; asset_ids: string[]; slides: { heading: string; body: string }[];
  shots: { shot: string; onScreenText: string; seconds: number }[]; brief: string; status: "AI Draft" | "Needs Review";
  created_by: string | null; created_by_agent: "planner";
};
export interface PlannerStore {
  brand: Brand;
  searchProducts(q: { query?: string; includeAccessories?: boolean; inStockOnly?: boolean; notFeaturedDays?: number; limit?: number }): Promise<{ total: number; products: PlannerProduct[] }>;
  productsByIds(ids: string[]): Promise<PlannerProduct[]>;
  catalogueTitles(): Promise<{ id: string; title: string }[]>;
  listContent(from: string, to: string): Promise<{ title: string; date: string; channel: string; format: string; series: string; status: string; products: string[] }[]>;
  insertDraft(row: DraftRow): Promise<{ id: string; status: string }>;
}
type Block = { type: string; text?: string; id?: string; name?: string; input?: unknown };
export interface ModelClient {
  create(params: { model: string; max_tokens: number; system: string; tools: unknown[]; messages: { role: "user" | "assistant"; content: unknown }[] }): Promise<{ content: Block[]; stop_reason: string | null }>;
}
export type PlannerResult = { text: string; createdIds: string[]; rejected: { title: string; problems: string[] }[]; toolCalls: number };

export function systemPrompt(b: Brand, now: Date): string {
  const g = b.guidelines as Record<string, string | Record<string, string>>;
  const cad = (g.cadence ?? {}) as Record<string, string>;
  return `You are the marketing planner inside TTC Marketing Studio, working for ${b.name}${g.tag ? ` (${g.tag})` : ""}.
Today is ${now.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Australia/Brisbane" })}, Brisbane time.

APPROVED BRAND GUIDELINES
Voice: ${g.voice ?? ""}
Audience: ${g.audience ?? ""}
Never use these words: ${g.avoid || "none"}.
Other rules: ${g.notes ?? ""}
Weekly structure: Monday = ${cad["1"] ?? "Inspiration"}, Wednesday = ${cad["3"] ?? "Tile of the Week"}, Friday = ${cad["5"] ?? "Product Feature"}.
Content series: ${SERIES.join(", ")}.
Channels and formats: ${JSON.stringify(FORMATS)}.

HOW TO WORK
1. Only feature products returned by list_products. They all belong to ${b.name}. Quote facts exactly as returned; never mention anything marked "not specified". Never state prices, stock or availability, and never invent sizes, finishes, slip ratings, uses or products.
2. Link products with productIds. Never type web addresses; product links are attached automatically.
3. Call list_content for the whole date range first so you don't clash with or repeat existing posts.
4. Save content with create_drafts, up to 7 complete drafts per call: title, series, channel, format, scheduledAt (YYYY-MM-DDTHH:MM Brisbane time, default 18:00, following the weekly structure), finished caption, hashtags, slides for carousels, a shot list for Reels and Stories, and a brief that starts with the concept, then the creative direction and which real product photos to use (never alter tile colour, texture or proportions).
5. For a month, search list_products several times with different looks to build a varied mix without repeating products, then cover every Monday, Wednesday and Friday, adding other series where they fit. Include campaign ideas in your reply when useful.
6. If a draft is rejected, fix exactly the listed problems and resubmit that draft.
7. You cannot approve, schedule or publish. No analytics are connected; never invent performance numbers.
8. Reply briefly in Australian English: one or two sentences and a compact list of what you created.`;
}

export function toolDefinitions() {
  return [
    { name: "list_products", description: "Search this brand's product catalogue (only this brand's). Returns exact Shopify facts.",
      input_schema: { type: "object", properties: { query: { type: "string" }, includeAccessories: { type: "boolean" }, inStockOnly: { type: "boolean" }, notFeaturedDays: { type: "number" }, limit: { type: "number" } } } },
    { name: "list_content", description: "Existing posts for this brand between two dates (YYYY-MM-DD, inclusive).",
      input_schema: { type: "object", properties: { from: { type: "string" }, to: { type: "string" } }, required: ["from", "to"] } },
    { name: "create_drafts", description: "Save 1 to 7 complete drafts to the calendar. Each is checked against the brand rules and product data; rejected drafts come back with the problems to fix.",
      input_schema: { type: "object", required: ["drafts"], properties: { drafts: { type: "array", maxItems: 7, items: { type: "object",
        required: ["title", "series", "channel", "format", "scheduledAt", "caption", "brief"],
        properties: { title: { type: "string" }, series: { type: "string", enum: [...SERIES] }, channel: { type: "string", enum: CHANNELS }, format: { type: "string" },
          scheduledAt: { type: "string" }, caption: { type: "string" }, hashtags: { type: "array", items: { type: "string" } }, productIds: { type: "array", items: { type: "string" } },
          slides: { type: "array", items: { type: "object", properties: { heading: { type: "string" }, body: { type: "string" } } } },
          shots: { type: "array", items: { type: "object", properties: { shot: { type: "string" }, onScreenText: { type: "string" }, seconds: { type: "number" } } } },
          brief: { type: "string" } } } } } } },
  ];
}

type DraftInput = { title?: string; series?: string; channel?: string; format?: string; scheduledAt?: string; caption?: string; hashtags?: string[];
  productIds?: string[]; slides?: { heading?: string; body?: string }[]; shots?: { shot?: string; onScreenText?: string; seconds?: number }[]; brief?: string };

export async function validateDraft(a: DraftInput, store: PlannerStore, now: Date, opts: { forReview: boolean; userId: string | null }): Promise<{ row?: DraftRow; problems: string[] }> {
  const problems: string[] = [];
  const channel = CHANNELS.includes(a.channel ?? "") ? a.channel! : "";
  if (!channel) problems.push(`channel must be one of ${CHANNELS.join(", ")}`);
  const format = channel && FORMATS[channel].includes(a.format ?? "") ? a.format! : channel ? FORMATS[channel][0] : "";
  const iso = brisbaneToIso(a.scheduledAt ?? "");
  if (!iso) problems.push("scheduledAt must be YYYY-MM-DDTHH:MM"); else if (new Date(iso) < now) problems.push("scheduledAt is in the past");
  if (!a.title?.trim()) problems.push("title is required");
  if (!a.caption?.trim()) problems.push("caption is required");
  if (!a.brief?.trim()) problems.push("brief is required");
  const ids = [...new Set(a.productIds ?? [])];
  const linked = await store.productsByIds(ids);
  const unknown = ids.filter((id) => !linked.some((p) => p.id === id));
  if (unknown.length) problems.push(`unknown productIds for ${store.brand.name}: ${unknown.join(", ")}; use ids from list_products`);
  const slides = format === "Carousel" ? (a.slides ?? []).map((s) => ({ heading: String(s.heading ?? ""), body: String(s.body ?? "") })) : [];
  const shots = format === "Reel" || format === "Story" ? (a.shots ?? []).map((s) => ({ shot: String(s.shot ?? ""), onScreenText: String(s.onScreenText ?? ""), seconds: Number(s.seconds) || 0 })) : [];
  if (format === "Carousel" && slides.length < 2) problems.push("carousels need 2 or more slides");
  if ((format === "Reel" || format === "Story") && !shots.length) problems.push("Reels and Stories need a shot list");
  const text = copyText({ title: a.title, caption: a.caption, slides, shots });
  const avoid = avoidWordHits(text, String((store.brand.guidelines as Record<string, unknown>).avoid ?? ""));
  if (avoid.length) problems.push(`uses off-brand words: ${avoid.join(", ")}`);
  problems.push(...factIssues(text, linked, await store.catalogueTitles()));
  if (problems.length) return { problems };
  return { problems, row: {
    brand_id: store.brand.id, title: a.title!.trim().slice(0, 140), series: SERIES.includes(a.series as never) ? a.series! : "Inspiration",
    channel, format, scheduled_at: iso!, caption: a.caption!.trim(),
    hashtags: [...new Set((a.hashtags ?? []).map((h) => String(h).replace(/^#/, "").replace(/[^\p{L}\p{N}_]/gu, "").toLowerCase()).filter(Boolean))].slice(0, 30),
    product_ids: linked.map((p) => p.id), asset_ids: [...new Set(linked.map((p) => p.approvedAssetId).filter((x): x is string => Boolean(x)))],
    slides, shots, brief: a.brief!.trim(), status: opts.forReview ? "Needs Review" : "AI Draft", created_by: opts.userId, created_by_agent: "planner" } };
}

export async function runPlanner(args: { store: PlannerStore; model: ModelClient; modelName: string; messages: { role: "user" | "assistant"; content: string }[];
  forReview: boolean; userId: string | null; now?: Date; maxDrafts?: number; maxTurns?: number; onProgress?: (msg: string) => void }): Promise<PlannerResult> {
  const now = args.now ?? new Date();
  const maxDrafts = args.maxDrafts ?? 60;
  const convo: { role: "user" | "assistant"; content: unknown }[] = args.messages.map((m) => ({ role: m.role, content: m.content }));
  const createdIds: string[] = [];
  const rejected: { title: string; problems: string[] }[] = [];
  let toolCalls = 0;
  for (let turn = 0; turn < (args.maxTurns ?? 30); turn++) {
    const res = await args.model.create({ model: args.modelName, max_tokens: 8000, system: systemPrompt(args.store.brand, now), tools: toolDefinitions(), messages: convo });
    convo.push({ role: "assistant", content: res.content });
    const uses = res.content.filter((b) => b.type === "tool_use");
    if (res.stop_reason !== "tool_use" || !uses.length) {
      return { text: res.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("\n").trim(), createdIds, rejected, toolCalls };
    }
    const results: unknown[] = [];
    for (const u of uses) {
      toolCalls++;
      let out: unknown;
      try {
        const input = (u.input ?? {}) as Record<string, unknown>;
        if (u.name === "list_products") {
          args.onProgress?.("Searching products");
          const r = await args.store.searchProducts({ query: String(input.query ?? ""), includeAccessories: Boolean(input.includeAccessories), inStockOnly: input.inStockOnly !== false,
            notFeaturedDays: typeof input.notFeaturedDays === "number" ? input.notFeaturedDays : undefined, limit: Math.min(60, Math.max(1, Number(input.limit) || 30)) });
          out = { brand: args.store.brand.name, totalMatches: r.total, products: r.products.map((p) => ({ id: p.id, name: p.title, type: p.kind, size: p.size || "not specified",
            colour: p.colour || "not specified", finish: p.finish || "not specified", specs: p.specs, tags: p.tags.slice(0, 8), description: p.description,
            inStock: p.inventory == null ? null : p.inventory > 0, hasApprovedPhoto: Boolean(p.approvedAssetId), lastFeatured: p.lastFeatured ?? "never" })) };
        } else if (u.name === "list_content") {
          out = await args.store.listContent(String(input.from ?? ""), String(input.to ?? ""));
        } else if (u.name === "create_drafts") {
          const created: { id: string; title: string; status: string }[] = [];
          const rej: { title: string; problems: string[] }[] = [];
          for (const d of ((input.drafts ?? []) as DraftInput[]).slice(0, 7)) {
            if (createdIds.length >= maxDrafts) { rej.push({ title: d.title ?? "", problems: [`limit of ${maxDrafts} drafts per request reached`] }); continue; }
            const v = await validateDraft(d, args.store, now, { forReview: args.forReview, userId: args.userId });
            if (!v.row) { rej.push({ title: d.title ?? "", problems: v.problems }); continue; }
            const saved = await args.store.insertDraft(v.row);
            createdIds.push(saved.id); created.push({ id: saved.id, title: v.row.title, status: saved.status });
            args.onProgress?.(`Saved “${v.row.title}”`);
          }
          rejected.push(...rej);
          out = { created, rejected: rej };
        } else out = { error: `Unknown tool ${u.name}` };
      } catch (e) { out = { error: e instanceof Error ? e.message : "Tool failed" }; }
      results.push({ type: "tool_result", tool_use_id: u.id, content: JSON.stringify(out) });
    }
    convo.push({ role: "user", content: results });
  }
  return { text: "I stopped before finishing because the request needed too many steps. The drafts saved so far are in your calendar.", createdIds, rejected, toolCalls };
}
