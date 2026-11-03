import { test } from "node:test";
import assert from "node:assert/strict";
import { shortcodeFromUrl, fingerprintFor, captionHash, parseLaterImport, canonicalPermalink } from "@/lib/ugc/normalize";
import { scoreUgc, matchProducts } from "@/lib/ugc/score";
import { chooseDate, recommendUgc, type RecommenderStore, type UgcCandidate, type UgcSuggestion } from "@/lib/ugc/recommender";
import type { PlannerProduct } from "@/lib/ai/planner";

test("one fingerprint per post across every link form and source", () => {
  for (const u of ["https://www.instagram.com/p/C9xYz_12AB/", "https://instagram.com/reel/C9xYz_12AB/?igsh=abc", "https://m.instagram.com/jane.builds/p/C9xYz_12AB"])
    assert.equal(fingerprintFor({ permalink: u }), "ig:C9xYz_12AB", u);
  assert.equal(fingerprintFor({ externalId: "1789" }), "id:1789");
  assert.equal(shortcodeFromUrl("https://example.com/p/ABCDE"), null);
  assert.equal(canonicalPermalink("https://instagram.com/reel/C9xYz_12AB/?x=1"), "https://www.instagram.com/p/C9xYz_12AB/");
});
test("re-shared captions from the same creator are spotted as duplicates", () => {
  const a = captionHash("@Jane.Builds", "Our ensuite is finally finished! Bora Ice tiles #reno @thetilecollective");
  const b = captionHash("jane.builds", "our ensuite is finally finished!!  bora ice tiles #bathroom");
  assert.ok(a && a === b);
  assert.notEqual(a, captionHash("other.person", "Our ensuite is finally finished! Bora Ice tiles"));
  assert.equal(captionHash("x", "Love it"), null); // too short to judge
});
test("Later import accepts pasted links with handles, and CSV exports", () => {
  const links = parseLaterImport("https://www.instagram.com/p/AAA111/ @studio.co\nnot a link\nhttps://www.instagram.com/p/AAA111/\nhttps://instagram.com/reel/BBB222/");
  assert.equal(links.rows.length, 2); assert.equal(links.rows[0].creator_handle, "studio.co"); assert.equal(links.errors.length, 1);
  const csv = parseLaterImport(`URL,Username,Caption,Date\nhttps://www.instagram.com/p/CCC333/,@Jane.Builds,"Our new ensuite, finally!",14/10/2026`);
  assert.deepEqual([csv.rows[0].creator_handle, csv.rows[0].caption, csv.rows[0].posted_at?.slice(0, 10)], ["jane.builds", "Our new ensuite, finally!", "2026-10-14"]);
});
const cat = [{ id: "shop-ttc-1", title: "Bora Ice Polished", tags: [], kind: "tile", inventory: 10 }, { id: "shop-ttc-2", title: "Travertine Stone Ivory In Out", tags: [], kind: "tile", inventory: 10 },
  { id: "shop-ttc-9", title: "Grate Floor Drain Chrome", tags: [], kind: "accessory", inventory: 3 }];
test("relevance score rewards on-brand, recent, product-specific posts and explains why", () => {
  const strong = scoreUgc({ caption: "Before and after of our ensuite reno with Bora Ice Polished tiles", creator_handle: "smithbuilders", media_type: "CAROUSEL_ALBUM",
    preview_url: "https://x", posted_at: new Date().toISOString(), sources: ["instagram_tag"] }, cat);
  const weak = scoreUgc({ caption: "", creator_handle: "random", media_type: "VIDEO", preview_url: null, posted_at: "2024-01-01", sources: ["later_import"] }, cat);
  assert.ok(strong.score >= 85 && weak.score <= 10, `${strong.score} vs ${weak.score}`);
  assert.deepEqual(strong.productMatches, ["shop-ttc-1"]);
  assert.ok(strong.hints.includes("Before and After") && strong.hints.includes("Builder and Designer Features"));
  assert.ok(strong.reasons.length >= 5);
  assert.deepEqual(matchProducts("love the drain", cat), [], "accessories are never suggested");
  assert.deepEqual(matchProducts("Travertine Stone around the pool", cat), ["shop-ttc-2"], "range-name match");
});
test("dates: keep a free valid suggestion, otherwise next free slot; Monday Inspiration lands on a Monday", () => {
  const now = new Date("2026-11-10T00:00:00Z"); // Tue 10 Nov Brisbane
  assert.equal(chooseDate("2026-11-20", "Customer Projects", now, new Set()), "2026-11-20");
  assert.equal(chooseDate("2026-11-20", "Customer Projects", now, new Set(["2026-11-20"])), "2026-11-13");
  assert.equal(chooseDate("2026-11-18", "Monday Inspiration", now, new Set(["2026-11-16"])), "2026-11-23");
  assert.equal(chooseDate("2025-01-01", "Save This Space", now, new Set()), "2026-11-13");
});

const P = (id: string, title: string): PlannerProduct => ({ id, title, size: "600 × 600 mm", finish: "Polished", colour: "White", specs: {}, tags: [], description: "",
  kind: "tile", inventory: 5, url: "", vendor: "", lastFeatured: null, approvedAssetId: null });
function memStore(cands: UgcCandidate[]) {
  const saved = new Map<string, UgcSuggestion>();
  const store: RecommenderStore = {
    brand: { id: "ttc", name: "The Tile Collective", short_name: "TTC", guidelines: { avoid: "cheap, bargain" } },
    candidates: async ({ limit }) => cands.slice(0, limit), productsFor: async () => [P("shop-ttc-1", "Bora Ice Polished")],
    catalogueTitles: async () => [{ id: "shop-ttc-1", title: "Bora Ice Polished" }, { id: "shop-ttc-2", title: "Travertine Stone Ivory In Out" }],
    takenDates: async () => ["2026-11-13"], save: async (id, s) => { saved.set(id, s); },
  };
  return { store, saved };
}
const cand = (o: Partial<UgcCandidate> = {}): UgcCandidate => ({ id: "u1", creator_handle: "jane.builds", caption: "Our ensuite with Bora Ice", media_type: "IMAGE",
  preview_url: "https://scontent.cdninstagram.com/x.jpg", posted_at: "2026-11-01T00:00:00Z", permalink: "https://www.instagram.com/p/AAA/", relevance_score: 80,
  relevance_reasons: [], product_matches: ["shop-ttc-1"], permission_status: "Permission not requested", attribution: "", sources: ["instagram_tag"], ...o });
const model = (inputs: Record<string, unknown>[], seen: unknown[] = []) => { let i = 0; return { seen, async create(p: Record<string, unknown>) { seen.push(p); return { content: [{ type: "tool_use", name: "record_recommendation", input: inputs[i++] }] }; } }; };

test("recommender: original caption, verified products only, credit line added, free date chosen", async () => {
  const { store, saved } = memStore([cand()]);
  const seen: unknown[] = [];
  await recommendUgc({ store, modelName: "m", now: new Date("2026-11-10T00:00:00Z"), model: model([{ fit: true, opportunity: "Customer Projects", strength: 4, why: "Beautiful finished ensuite.",
    caption: "Soft light, polished stone. A calm ensuite in Bora Ice Polished.", productIds: ["shop-ttc-1", "shop-ttc-77"], suggestedDate: "2026-11-13" }], seen) });
  const s = saved.get("u1")!;
  assert.equal(s.fit, true); assert.deepEqual(s.productIds, ["shop-ttc-1"]);
  assert.ok(s.problems.some((p) => p.includes("not in the verified catalogue")));
  assert.equal(s.credit, "📷 @jane.builds"); assert.equal(s.series, "Customer Projects");
  assert.notEqual(s.suggestedDate, "2026-11-13", "taken date avoided");
  const req = seen[0] as { messages: { content: { type: string }[] }[]; tool_choice: { name: string } };
  assert.equal(req.messages[0].content[0].type, "image", "the agent looks at the preview image");
  assert.equal(req.tool_choice.name, "record_recommendation");
});
test("recommender holds back captions that invent facts, and records poor fits without recommending", async () => {
  const { store, saved } = memStore([cand(), cand({ id: "u2" })]);
  await recommendUgc({ store, modelName: "m", model: model([
    { fit: true, opportunity: "Product Features", caption: "Bora Ice Polished, now only $19 and in stock!", productIds: ["shop-ttc-1"] },
    { fit: false, why: "Shows a competitor's tiles." }]) });
  assert.equal(saved.get("u1")!.caption, undefined);
  assert.ok(saved.get("u1")!.problems.some((p) => p.includes("price")));
  assert.equal(saved.get("u2")!.fit, false);
});
test("recommender uses the recorded credit line once permission is granted", async () => {
  const { store, saved } = memStore([cand({ permission_status: "Permission granted", attribution: "Photo: @jane.builds (Jane Smith Builds)" })]);
  await recommendUgc({ store, modelName: "m", model: model([{ fit: true, opportunity: "Instagram Stories", caption: "Inside Jane's new ensuite.", productIds: [] }]) });
  assert.equal(saved.get("u1")!.credit, "Photo: @jane.builds (Jane Smith Builds)");
  assert.equal(saved.get("u1")!.format, "Story");
});
test("if the preview link has expired, the agent retries from the caption alone", async () => {
  const { store, saved } = memStore([cand()]);
  let calls = 0;
  await recommendUgc({ store, modelName: "m", model: { async create(p: Record<string, unknown>) {
    calls++; const first = (p.messages as { content: { type: string }[] }[])[0].content[0].type;
    if (first === "image") throw new Error("Could not fetch image");
    return { content: [{ type: "tool_use", name: "record_recommendation", input: { fit: true, opportunity: "Save This Space", caption: "A calm space.", productIds: [] } }] };
  } } });
  assert.equal(calls, 2); assert.equal(saved.get("u1")!.fit, true);
});
