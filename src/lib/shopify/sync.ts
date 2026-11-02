import "server-only";
import { randomUUID } from "node:crypto";
import { adminClient } from "@/lib/supabase/admin";
import { shopifyCreds, type ShopifyCreds } from "@/lib/env";
import type { SupabaseClient } from "@supabase/supabase-js";
import { shopifyQuery } from "./client";
import { mapProduct, type ShopifyNode, type ProductRow } from "./map";

const SHOP_QUERY = `{ shop { name myshopifyDomain primaryDomain { host } currencyCode } }`;
// Same fields the studio prototype imported, verified against the real TTC store.
export const PRODUCTS_QUERY = `query ($first: Int!, $after: String) {
  products(first: $first, after: $after, query: "status:active", sortKey: ID) {
    pageInfo { hasNextPage endCursor }
    nodes { id title handle onlineStoreUrl vendor productType tags totalInventory updatedAt description(truncateAt: 400)
      variants(first: 10) { nodes { title sku price inventoryQuantity } }
      featuredMedia { preview { image { url } } }
      thickness: metafield(namespace: "custom", key: "thickness") { value }
      edge: metafield(namespace: "custom", key: "edge") { value }
      slip: metafield(namespace: "custom", key: "slip_rating") { value }
      material: metafield(namespace: "custom", key: "material") { value }
      suitable: metafield(namespace: "custom", key: "suitable_for") { value }
      soldPer: metafield(namespace: "custom", key: "sold_per") { value }
      boxQty: metafield(namespace: "custom", key: "box_qty") { value }
      grout: metafield(namespace: "custom", key: "recommended_grout") { value } } } }`;

type ShopInfo = { shop: { name: string; myshopifyDomain: string; primaryDomain: { host: string }; currencyCode: string } };
type ProductsPage = { products: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: ShopifyNode[] } };

/** Imports every active product from one brand's own store. Products that disappear from Shopify are marked
 *  inactive rather than deleted, so existing posts keep their history. Nothing is filled in that Shopify lacks. */
export async function syncBrand(brand: string, deps: { db?: SupabaseClient; query?: typeof shopifyQuery; creds?: ShopifyCreds } = {}): Promise<{ count: number; tiles: number; deactivated: number }> {
  const db = deps.db ?? adminClient();
  const query = deps.query ?? shopifyQuery;
  const { shop } = deps.creds ?? shopifyCreds(brand);
  const info = await query<ShopInfo>(brand, SHOP_QUERY);
  if (info.shop.myshopifyDomain !== shop) throw new Error(`Credentials for ${brand} reach ${info.shop.myshopifyDomain}, not ${shop}`);

  const { data: existing } = await db.from("shopify_connections").select("shop_domain").eq("brand_id", brand).maybeSingle();
  if (existing && existing.shop_domain !== shop) throw new Error(`${brand} is locked to ${existing.shop_domain}; refusing to import from ${shop}`);
  const { data: other } = await db.from("shopify_connections").select("brand_id").eq("shop_domain", shop).neq("brand_id", brand).maybeSingle();
  if (other) throw new Error(`${shop} is already linked to brand ${other.brand_id}`);
  const link = await db.from("shopify_connections").upsert({ brand_id: brand, shop_domain: shop, public_domain: info.shop.primaryDomain.host,
    shop_name: info.shop.name, currency: info.shop.currencyCode, status: "connected", last_error: null }, { onConflict: "brand_id" });
  if (link.error) throw new Error(`Could not save the store connection: ${link.error.message}`);

  const syncId = randomUUID();
  let after: string | null = null, count = 0, tiles = 0;
  do {
    const page: ProductsPage = await query<ProductsPage>(brand, PRODUCTS_QUERY, { first: 100, after });
    const rows: ProductRow[] = page.products.nodes.map((n) => mapProduct(n, brand, shop, info.shop.primaryDomain.host, info.shop.currencyCode, syncId));
    if (rows.length) {
      const { error } = await db.from("products").upsert(rows, { onConflict: "id" });
      if (error) throw new Error(`Saving products failed: ${error.message}`);
    }
    count += rows.length; tiles += rows.filter((r) => r.kind === "tile").length;
    after = page.products.pageInfo.hasNextPage ? page.products.pageInfo.endCursor : null;
  } while (after);

  const { data: gone, error: goneErr } = await db.from("products").update({ active: false }).eq("brand_id", brand).neq("sync_id", syncId).eq("active", true).select("id");
  if (goneErr) throw new Error(`Could not mark removed products: ${goneErr.message}`);
  await db.from("shopify_connections").update({ last_sync_at: new Date().toISOString(), last_sync_id: syncId, product_count: count, status: "connected" }).eq("brand_id", brand);
  await db.rpc("log_event", { p_brand: brand, p_action: "Shopify import", p_detail: `${count} products (${tiles} tiles) from ${shop}`, p_agent: "shopify-sync" });
  return { count, tiles, deactivated: gone?.length ?? 0 };
}
