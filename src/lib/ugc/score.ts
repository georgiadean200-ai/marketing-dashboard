// Brand relevance scoring for discovered UGC. Deterministic and explainable; the AI agent adds judgement on top.

export const UGC_OPPORTUNITIES = ["Monday Inspiration", "Save This Space", "Customer Projects", "Builder and Designer Features",
  "Before and After", "Product Features", "Instagram Stories"] as const;
export type Opportunity = (typeof UGC_OPPORTUNITIES)[number];
/** Which content series and format each opportunity becomes on the calendar. */
export const OPPORTUNITY_TO_SERIES: Record<Opportunity, { series: string; format: string; weekday?: number }> = {
  "Monday Inspiration": { series: "Inspiration", format: "Single image", weekday: 1 },
  "Save This Space": { series: "Save This Space", format: "Carousel" },
  "Customer Projects": { series: "Customer Projects", format: "Single image" },
  "Builder and Designer Features": { series: "Builder and Designer Features", format: "Carousel" },
  "Before and After": { series: "Before and After", format: "Carousel" },
  "Product Features": { series: "Product Feature", format: "Single image", weekday: 5 },
  "Instagram Stories": { series: "Customer Projects", format: "Story" },
};

export type CatalogueEntry = { id: string; title: string; tags: string[]; kind: string; inventory: number | null };
export type UgcForScoring = { caption: string; creator_handle: string; media_type: string; preview_url: string | null; posted_at: string | null; sources: string[] };

const SPACE_WORDS = /\b(bathroom|ensuite|kitchen|splashback|laundry|powder room|alfresco|patio|pool|outdoor|entry|hallway|living|floor(?:ing)?|feature wall|shower|vanity|fireplace)\b/i;
const TILE_WORDS = /\b(tiles?|tiling|tiled|porcelain|mosaic|terrazzo|travertine|zellige|subway|herringbone|grout|marble look|stone look)\b/i;
const PROJECT_WORDS = /\b(reno|renovation|renovated|new build|build|built|project|finished|complete[d]?|transformation|makeover|our home|dream home)\b/i;
const BEFORE_AFTER = /\b(before (?:and|&) after|before\s*\/\s*after|swipe to see|the before|from this to)\b/i;
const TRADE_HANDLE = /(build|builder|construct|homes|reno|tiling|tiler|carpentry|projects)/i;
const DESIGN_HANDLE = /(design|interior|studio|stylist|styling|architect|decor)/i;

/** Text-based product matches only: a catalogue product is suggested when its name (or its range name) appears
 *  in the caption. Suggestions must be confirmed by a person before use. */
export function matchProducts(caption: string, catalogue: CatalogueEntry[], max = 5): string[] {
  const text = ` ${caption.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ")} `;
  const hits = new Map<string, number>();
  for (const p of catalogue) {
    if (p.kind === "accessory") continue;
    const name = p.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    if (name.length >= 5 && text.includes(` ${name} `)) { hits.set(p.id, 3); continue; }
    const range = name.split(" ").slice(0, 2).join(" ");
    if (range.length >= 6 && text.includes(` ${range} `)) hits.set(p.id, Math.max(hits.get(p.id) ?? 0, 1));
  }
  return [...hits.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map(([id]) => id);
}

export function scoreUgc(u: UgcForScoring, catalogue: CatalogueEntry[], now = new Date()) {
  const reasons: string[] = [];
  let score = 20;
  const cap = u.caption ?? "";
  const products = matchProducts(cap, catalogue);
  if (products.length) { score += 25; reasons.push(`Names ${products.length === 1 ? "a product" : products.length + " products"} from the catalogue`); }
  if (TILE_WORDS.test(cap)) { score += 12; reasons.push("Talks about tiles"); }
  if (SPACE_WORDS.test(cap)) { score += 10; reasons.push("Shows a finished space"); }
  if (PROJECT_WORDS.test(cap)) { score += 8; reasons.push("Real project or renovation"); }
  if (BEFORE_AFTER.test(cap)) { score += 6; reasons.push("Before and after"); }
  if (TRADE_HANDLE.test(u.creator_handle)) { score += 6; reasons.push("Builder or trade account"); }
  if (DESIGN_HANDLE.test(u.creator_handle)) { score += 6; reasons.push("Designer or stylist account"); }
  if (u.sources.includes("instagram_tag")) { score += 5; reasons.push("Tagged the brand in the image"); }
  if (["IMAGE", "CAROUSEL_ALBUM"].includes(u.media_type)) score += 4;
  if (!u.preview_url) { score -= 10; reasons.push("No preview available (video with licensed audio, or added by link)"); }
  if (u.posted_at) {
    const days = (now.getTime() - new Date(u.posted_at).getTime()) / 86_400_000;
    if (days <= 30) { score += 8; reasons.push("Posted in the last month"); } else if (days > 365) { score -= 12; reasons.push("Over a year old"); }
  }
  if (cap.trim().length < 15) { score -= 8; reasons.push("Little or no caption"); }
  const hints: Opportunity[] = [];
  if (BEFORE_AFTER.test(cap)) hints.push("Before and After");
  if (TRADE_HANDLE.test(u.creator_handle) || DESIGN_HANDLE.test(u.creator_handle)) hints.push("Builder and Designer Features");
  if (PROJECT_WORDS.test(cap)) hints.push("Customer Projects");
  if (products.length) hints.push("Product Features");
  if (SPACE_WORDS.test(cap)) hints.push("Save This Space");
  return { score: Math.max(0, Math.min(100, score)), reasons, productMatches: products, hints };
}
