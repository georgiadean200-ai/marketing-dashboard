// Fact checks shared by the AI planner (hard rejections) and the dashboard (warnings).
// Anything in the copy that looks like a fact must trace back to the linked products' Shopify data.

export type FactProduct = { id: string; title: string; size: string; finish: string; colour: string; specs: Record<string, string>; tags: string[]; description: string };

export const PRICE_RE = /\$\s?\d|\bAUD\s?\d|\d\s?(?:\/|per)\s?(?:m²|m2|sqm|square metre|sheet|box)\b/i;
export const STOCK_RE = /\b(in stock|out of stock|available now|limited stock|low stock|sold out|back in stock|selling fast|while stocks last|pre-?order|on sale now)\b/i;
const nums = (s: string) => s.match(/\d+(?:\.\d+)?/g) ?? [];
const reEsc = (s: string) => s.replace(/[.*+?^$(){}|[\]\\]/g, "\\$&");

export type Draftish = { title?: string; caption?: string; slides?: { heading?: string; body?: string }[]; shots?: { onScreenText?: string }[] };
export const copyText = (d: Draftish) =>
  [d.title ?? "", d.caption ?? "", ...(d.slides ?? []).map((s) => `${s.heading ?? ""} ${s.body ?? ""}`), ...(d.shots ?? []).map((s) => s.onScreenText ?? "")].join("\n");

export function factIssues(text: string, linked: FactProduct[], brandCatalogue: { id: string; title: string }[]): string[] {
  const out = new Set<string>();
  const specs = linked.map((p) => `${p.title} ${p.size} ${p.finish} ${p.colour} ${Object.values(p.specs).join(" ")} ${p.tags.join(" ")} ${p.description}`).join(" ");
  const specDims = linked.map((p) => nums(p.size).join("x")).join(" ");
  const specNums = new Set(nums(specs));
  if (PRICE_RE.test(text)) out.add("Mentions a price. Prices come from Shopify, not the copy.");
  if (STOCK_RE.test(text)) out.add("Mentions stock or availability. Confirm it in Shopify instead.");
  for (const d of text.match(/\b\d{2,4}(?:\s?[x×*]\s?\d{1,4}){1,2}\s?mm\b|\b\d{1,4}(?:\.\d+)?\s?mm\b/gi) ?? []) {
    const n = nums(d);
    const ok = n.length > 1 ? specDims.includes(n.join("x")) : n.length === 1 && specNums.has(n[0]!);
    if (!ok) out.add(`Mentions ${d.trim()}, which isn't in the linked product data.`);
  }
  for (const r of text.match(/\b(?:R(?:9|10|11|12|13)|P[1-5])\b/g) ?? []) {
    if (!new RegExp("\\b" + r + "\\b").test(specs)) out.add(`Mentions slip rating ${r}, which isn't in the linked product data.`);
  }
  const lowT = text.toLowerCase();
  const linkedIds = new Set(linked.map((p) => p.id));
  for (const p of brandCatalogue) {
    if (p.title.length < 5 || linkedIds.has(p.id) || !lowT.includes(p.title.toLowerCase())) continue;
    if (new RegExp("\\b" + reEsc(p.title) + "\\b", "i").test(text)) out.add(`Names ${p.title} but it isn't linked to the post.`);
  }
  if (/https?:\/\/|\bwww\./i.test(text)) out.add("Contains a web address. Product links are attached from the product library.");
  return [...out];
}

export function avoidWordHits(text: string, avoid: string): string[] {
  return avoid.split(",").map((w) => w.trim()).filter(Boolean).filter((w) => new RegExp("\\b" + reEsc(w) + "\\b", "i").test(text));
}
