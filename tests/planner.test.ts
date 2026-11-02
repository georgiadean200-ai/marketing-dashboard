import { test } from "node:test";
import assert from "node:assert/strict";
import { runPlanner, type PlannerStore, type PlannerProduct, type DraftRow, type ModelClient } from "@/lib/ai/planner";

const P = (id: string, title: string, o: Partial<PlannerProduct> = {}): PlannerProduct => ({ id, title, size: "600 × 600 mm", finish: "Polished", colour: "White",
  specs: { thickness: "9.5mm" }, tags: [], description: "", kind: "tile", inventory: 50, url: `https://shop.test/${id}`, vendor: "", lastFeatured: null, approvedAssetId: null, ...o });
function memoryStore() {
  const products = [P("shop-ttc-1", "Testa Ice Polished", { approvedAssetId: "asset-1" }), P("shop-ttc-2", "Testa Sand Matte", { finish: "Matte", inventory: 0 })];
  const saved: DraftRow[] = [];
  const store: PlannerStore = {
    brand: { id: "ttc", name: "The Tile Collective", short_name: "TTC", guidelines: { avoid: "cheap, bargain", cadence: { "1": "Inspiration" } } },
    async searchProducts(q) { const r = products.filter((p) => !q.inStockOnly || (p.inventory ?? 1) > 0); return { total: r.length, products: r }; },
    async productsByIds(ids) { return products.filter((p) => ids.includes(p.id)); },
    async catalogueTitles() { return products.map((p) => ({ id: p.id, title: p.title })); },
    async listContent() { return []; },
    async insertDraft(row) { saved.push(row); return { id: `c-${saved.length}`, status: row.status }; },
  };
  return { store, saved };
}
// Scripted model: plans, gets one draft rejected, fixes it, then answers.
function scriptedModel(drafts: unknown[][]): ModelClient & { calls: unknown[] } {
  let i = 0; const calls: unknown[] = [];
  return { calls, async create(p) {
    calls.push(structuredClone(p));
    const step = i++;
    if (step === 0) return { stop_reason: "tool_use", content: [{ type: "tool_use", id: "t0", name: "list_products", input: {} }] };
    if (step <= drafts.length) return { stop_reason: "tool_use", content: [{ type: "tool_use", id: `t${step}`, name: "create_drafts", input: { drafts: drafts[step - 1] } }] };
    return { stop_reason: "end_turn", content: [{ type: "text", text: "Saved your posts for approval." }] };
  } };
}
const now = new Date("2026-11-02T00:00:00Z");
const base = { title: "Tile of the Week: Testa Ice Polished", series: "Tile of the Week", channel: "Instagram", format: "Single image", scheduledAt: "2026-11-25T18:00",
  caption: "Tile of the Week: Testa Ice Polished. A 600 × 600 mm tile, 9.5mm thick.", brief: "Concept: light.", productIds: ["shop-ttc-1"], hashtags: ["#TheTileCollective", "tiles"] };

test("planner saves valid drafts for approval, rejects invented facts, and accepts the fix", async () => {
  const { store, saved } = memoryStore();
  const bad = { ...base, title: "Bad", caption: "Testa Ice Polished, just $19.95 and 10mm thick!" };
  const model = scriptedModel([[base, bad], [{ ...bad, caption: "Testa Ice Polished in 600 × 600 mm." }]]);
  const r = await runPlanner({ store, model, modelName: "m", messages: [{ role: "user", content: "Plan next week for approval" }], forReview: true, userId: "u1", now });
  assert.equal(saved.length, 2);
  assert.equal(r.rejected.length, 1);
  assert.ok(r.rejected[0].problems.some((p) => p.includes("price")) && r.rejected[0].problems.some((p) => p.includes("10mm")));
  assert.ok(saved.every((d) => d.status === "Needs Review" && d.created_by === "u1" && d.created_by_agent === "planner"));
  assert.deepEqual(saved[0].asset_ids, ["asset-1"]); // approved product photo attached automatically
  assert.deepEqual(saved[0].hashtags, ["thetilecollective", "tiles"]);
  assert.equal(saved[0].scheduled_at, "2026-11-25T08:00:00.000Z");
  assert.equal(r.text, "Saved your posts for approval.");
});
test("planner cannot use another brand's products or past dates", async () => {
  const { store, saved } = memoryStore();
  const model = scriptedModel([[{ ...base, productIds: ["shop-cto-9"] }, { ...base, scheduledAt: "2026-10-01T18:00" }, { ...base, caption: "A cheap option." }]]);
  const r = await runPlanner({ store, model, modelName: "m", messages: [{ role: "user", content: "x" }], forReview: false, userId: null, now });
  assert.equal(saved.length, 0);
  assert.ok(r.rejected[0].problems.some((p) => p.includes("unknown productIds")));
  assert.ok(r.rejected[1].problems.some((p) => p.includes("past")));
  assert.ok(r.rejected[2].problems.some((p) => p.includes("off-brand")));
});
test("in-stock filter and the system prompt carry the brand rules", async () => {
  const { store } = memoryStore();
  const model = scriptedModel([]);
  await runPlanner({ store, model, modelName: "m", messages: [{ role: "user", content: "x" }], forReview: false, userId: null, now });
  const first = model.calls[0] as { system: string; tools: { name: string }[] };
  assert.match(first.system, /Never use these words: cheap, bargain/);
  assert.match(first.system, /Never state prices, stock or availability/);
  assert.deepEqual(first.tools.map((t) => t.name), ["list_products", "list_content", "create_drafts"]);
  const second = model.calls[1] as { messages: { content: unknown }[] };
  const toolResult = JSON.stringify(second.messages.at(-1)?.content);
  assert.ok(toolResult.includes("Testa Ice Polished") && !toolResult.includes("Testa Sand Matte")); // out of stock excluded
});
test("draft limit per request is enforced", async () => {
  const { store, saved } = memoryStore();
  const many = Array.from({ length: 7 }, (_, i) => ({ ...base, title: `Post ${i}`, scheduledAt: `2026-12-0${i + 1}T18:00` }));
  const r = await runPlanner({ store, model: scriptedModel([many]), modelName: "m", messages: [{ role: "user", content: "x" }], forReview: false, userId: null, now, maxDrafts: 3 });
  assert.equal(saved.length, 3); assert.equal(r.rejected.length, 4);
});
