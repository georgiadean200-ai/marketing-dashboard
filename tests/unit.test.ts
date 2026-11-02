import { test } from "node:test";
import assert from "node:assert/strict";
import { mapProduct, type ShopifyNode } from "@/lib/shopify/map";
import { factIssues, avoidWordHits } from "@/lib/content/facts";
import { brisbaneToIso, isoToBrisbane } from "@/lib/content/constants";

// Synthetic product in the exact shape the TTC store returns (fields verified against the live store).
const node = (o: Partial<ShopifyNode> = {}): ShopifyNode => ({
  id: "gid://shopify/Product/101", title: "Testa Snow Honed", handle: "testa-snow-lappato-600-x-601", onlineStoreUrl: "https://shop.test/products/testa-snow",
  vendor: "Test Vendor", productType: "", tags: ["600 x 600", "Polished", "White", "TILES"], totalInventory: 120, updatedAt: "2026-10-01T00:00:00Z",
  description: "A refined porcelain tile with soft veining...", variants: { nodes: [{ title: "Default Title", sku: "T1", price: "32.95", inventoryQuantity: 120 }] },
  featuredMedia: { preview: { image: { url: "https://cdn.shop.test/t.jpg" } } },
  thickness: { value: "9.5mm" }, edge: { value: "Rectified Edge" }, slip: { value: "Not Applicable - Lappato" }, material: null, ...o,
});

test("mapping keeps Shopify facts and prefers the size tag over a wrong handle", () => {
  const p = mapProduct(node(), "ttc", "ttc.myshopify.com", "www.shop.test", "AUD", "sync-1");
  assert.equal(p.id, "shop-ttc-101");
  assert.equal(p.size, "600 × 600 mm");
  assert.equal(p.finish, "Honed"); // title wins over the contradictory "Polished" tag
  assert.deepEqual(p.specs, { thickness: "9.5mm", edge: "Rectified Edge", slipRating: "Not Applicable - Lappato" });
  assert.equal(p.price_label, "$32.95");
  assert.equal(p.availability, "In stock");
  assert.equal(p.url, "https://shop.test/products/testa-snow");
  assert.equal(p.description, "A refined porcelain tile with soft veining");
});
test("missing facts stay missing", () => {
  const p = mapProduct(node({ tags: [], handle: "no-size", title: "Testa Plain", totalInventory: null, thickness: null, edge: null, slip: null }), "ttc", "s", "h", "AUD", "x");
  assert.equal(p.size, ""); assert.deepEqual(p.specs, {}); assert.equal(p.availability, "Not tracked");
});
test("accessories are separated from tiles", () => {
  assert.equal(mapProduct(node({ title: "Grate Floor Drain Chrome 100mm" }), "ttc", "s", "h", "AUD", "x").kind, "accessory");
  assert.equal(mapProduct(node({ title: "Adhesive Notched Trowel 10mm" }), "ttc", "s", "h", "AUD", "x").kind, "accessory");
});
test("multi-variant products show a 'from' price and keep each variant", () => {
  const p = mapProduct(node({ variants: { nodes: [{ title: "Box", sku: "A", price: "40", inventoryQuantity: 1 }, { title: "Sample", sku: "B", price: "5", inventoryQuantity: 9 }] } }), "ttc", "s", "h", "AUD", "x");
  assert.equal(p.price_label, "From $5.00"); assert.equal(p.variants.length, 2);
});

const linked = [{ id: "shop-ttc-101", title: "Testa Snow Honed", size: "600 × 600 mm", finish: "Honed", colour: "White", specs: { thickness: "9.5mm", slipRating: "P4" }, tags: [], description: "" }];
const catalogue = [{ id: "shop-ttc-101", title: "Testa Snow Honed" }, { id: "shop-ttc-102", title: "Bora Ice Polished" }];
test("fact checks pass true statements", () => {
  assert.deepEqual(factIssues("Testa Snow Honed: 600 × 600 mm, 9.5mm thick, P4 rated.", linked, catalogue), []);
});
test("fact checks catch prices, stock, wrong sizes, wrong slip ratings, unlinked products and URLs", () => {
  const issues = factIssues("Only $19 and in stock! 900 × 900 mm, 10mm thick, R11. Also Bora Ice Polished. www.x.com", linked, catalogue);
  for (const bit of ["price", "stock", "900 × 900 mm", "10mm", "R11", "Bora Ice Polished", "web address"]) assert.ok(issues.some((i) => i.includes(bit)), bit);
});
test("off-brand words are detected per brand", () => {
  assert.deepEqual(avoidWordHits("A cheap deal today", "cheap, bargain, budget, deal"), ["cheap", "deal"]);
});
test("Brisbane wall-clock times round-trip", () => {
  assert.equal(brisbaneToIso("2026-11-23T18:00"), "2026-11-23T08:00:00.000Z");
  assert.equal(isoToBrisbane("2026-11-23T08:00:00.000Z"), "2026-11-23T18:00");
  assert.equal(brisbaneToIso("23/11/2026"), null);
});
