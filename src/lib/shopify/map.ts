// Turns a Shopify Admin GraphQL product node into a product row. Only facts present in Shopify are kept:
// size comes from the size tag, then the title, then the URL handle; specs come from the store's custom fields.

export type ShopifyNode = {
  id: string; title: string; handle: string; onlineStoreUrl?: string | null; vendor?: string; productType?: string;
  tags?: string[]; totalInventory?: number | null; updatedAt?: string; description?: string;
  variants?: { nodes: { title: string; sku?: string | null; price: string; inventoryQuantity?: number | null }[] };
  featuredMedia?: { preview?: { image?: { url?: string } | null } | null } | null;
  [spec: string]: unknown;
};

export type ProductRow = {
  id: string; brand_id: string; shop_domain: string; shopify_gid: string; handle: string; title: string; vendor: string;
  product_type: string; tags: string[]; size: string; colour: string; finish: string; specs: Record<string, string>;
  kind: "tile" | "accessory"; variants: { title: string; sku: string; price: string; stock: number | null }[]; sku: string;
  price: number | null; price_label: string; currency: string; inventory: number | null; availability: string;
  description: string; url: string; online_store: boolean; shopify_image_url: string; shopify_updated_at: string | null;
  active: boolean; sync_id: string; synced_at: string;
};

export const ACCESSORY_RE = /\b(drains?|grates?|trowels?|adhesives?|grouts?|sealers?|sealants?|trims?|spacers?|primers?|membranes?|levell?ing|tools?|sponges?|floats?|cutters?|blades?|buckets?|waterproof\w*|silicones?|clips?|wedges?|mixers?|nippers?|flanges?|cleaners?|caulk\w*)\b/i;
const COLOURS = ["white","black","grey","gray","charcoal","beige","cream","ivory","sand","taupe","brown","walnut","oak","blue","navy","dark blue","green","sage","olive","pink","blush","terracotta","red","yellow","gold","brass","copper","silver","chrome","nickel","bronze","natural","multi"];
const FINISHES = ["matt","matte","gloss","glossy","polished","honed","lappato","satin","textured","structured","rustic","tumbled"];
const SIZE_RE = /(\d{2,4})\s*[x×]\s*(\d{2,4})(?:\s*[x×]\s*(\d{1,3}))?/i;
const SPEC_KEYS: Record<string, string> = { thickness: "thickness", edge: "edge", slip: "slipRating", material: "material", suitable: "suitableFor", soldPer: "soldPer", boxQty: "boxQty", grout: "grout" };
const cap = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

export function mapProduct(n: ShopifyNode, brand: string, shopDomain: string, publicHost: string, currency: string, syncId: string): ProductRow {
  const num = String(n.id).split("/").pop();
  const title = String(n.title ?? "").replace(/\s+/g, " ").trim();
  const tags = (n.tags ?? []).map(String);
  const sizeTag = tags.find((t) => /^\s*\d{2,4}\s*x\s*\d{2,4}\s*$/i.test(t));
  const m = (sizeTag ?? "").match(SIZE_RE) ?? title.match(SIZE_RE) ?? String(n.handle ?? "").replace(/-/g, " ").match(SIZE_RE);
  const size = m ? `${m[1]} × ${m[2]}${m[3] ? " × " + m[3] : ""} mm` : "";
  const low = ` ${title.toLowerCase()} `;
  const lowTags = tags.map((t) => t.toLowerCase());
  const colour = COLOURS.filter((c) => low.includes(" " + c + " ") || lowTags.includes(c)).slice(0, 3).map(cap).join(", ");
  const fromTitle = FINISHES.filter((f) => new RegExp("\\b" + f + "\\b", "i").test(title));
  const finishList = (fromTitle.length ? fromTitle : FINISHES.filter((f) => lowTags.includes(f))).map(cap);
  if (/\bin out\b/i.test(title)) finishList.push("In Out");
  if (/\bexternal\b/i.test(title)) finishList.push("External");
  const variants = (n.variants?.nodes ?? []).filter(Boolean);
  const prices = variants.map((v) => Number(v.price)).filter((x) => !Number.isNaN(x));
  const minPrice = prices.length ? Math.min(...prices) : null;
  const inv = typeof n.totalInventory === "number" ? n.totalInventory : null;
  const specs: Record<string, string> = {};
  for (const [alias, key] of Object.entries(SPEC_KEYS)) {
    const v = (n[alias] as { value?: string } | null | undefined)?.value;
    if (v != null && String(v).trim()) specs[key] = String(v).trim();
  }
  return {
    id: `shop-${brand}-${num}`, brand_id: brand, shop_domain: shopDomain, shopify_gid: String(n.id), handle: String(n.handle ?? ""),
    title, vendor: String(n.vendor ?? ""), product_type: String(n.productType ?? ""), tags, size, colour,
    finish: finishList.slice(0, 2).join(", "), specs, kind: ACCESSORY_RE.test(title) ? "accessory" : "tile",
    variants: variants.length > 1 ? variants.map((v) => ({ title: String(v.title), sku: String(v.sku ?? ""), price: String(v.price), stock: v.inventoryQuantity ?? null })) : [],
    sku: variants.length === 1 ? String(variants[0].sku ?? "") : "",
    price: minPrice, price_label: minPrice == null ? "" : `${variants.length > 1 ? "From " : ""}$${minPrice.toFixed(2)}`, currency,
    inventory: inv, availability: inv == null ? "Not tracked" : inv > 0 ? "In stock" : inv === 0 ? "Out of stock" : "Backorder or not tracked",
    description: String(n.description ?? "").replace(/\s*\.\.\.$|…$/, "").slice(0, 400),
    url: n.onlineStoreUrl ? String(n.onlineStoreUrl) : n.handle ? `https://${publicHost}/products/${n.handle}` : "",
    online_store: Boolean(n.onlineStoreUrl), shopify_image_url: String(n.featuredMedia?.preview?.image?.url ?? ""),
    shopify_updated_at: n.updatedAt ?? null, active: true, sync_id: syncId, synced_at: new Date().toISOString(),
  };
}
