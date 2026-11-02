import "server-only";
import { z } from "zod";

// Validated lazily so `next build` works without secrets; any route that needs a value fails clearly instead.
const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
  SUPABASE_SECRET_KEY: z.string().min(20),
  ANTHROPIC_API_KEY: z.string().min(20),
  ANTHROPIC_MODEL: z.string().min(3).default("claude-sonnet-5-5"),
  CRON_SECRET: z.string().min(24),
  SHOPIFY_API_VERSION: z.string().regex(/^\d{4}-\d{2}$/).default("2026-07"),
  NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
});
export type ServerEnv = z.infer<typeof schema>;

let cached: ServerEnv | null = null;
export function env(): ServerEnv {
  if (cached) return cached;
  const parsed = schema.safeParse({
    ...process.env,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY,
  });
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Server configuration is incomplete: ${missing}`);
  }
  cached = parsed.data;
  return cached;
}

/** Which settings are present, as booleans only, for the health page. Never returns values. */
export function envStatus(): Record<string, boolean> {
  const has = (k: string) => Boolean(process.env[k]);
  return {
    supabaseUrl: has("NEXT_PUBLIC_SUPABASE_URL"),
    supabasePublishableKey: has("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") || has("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    supabaseSecretKey: has("SUPABASE_SECRET_KEY") || has("SUPABASE_SERVICE_ROLE_KEY"),
    anthropicKey: has("ANTHROPIC_API_KEY"),
    cronSecret: has("CRON_SECRET"),
    shopifyTtc: has("SHOPIFY_TTC_SHOP") && has("SHOPIFY_TTC_CLIENT_ID") && has("SHOPIFY_TTC_CLIENT_SECRET"),
    shopifyCto: has("SHOPIFY_CTO_SHOP") && has("SHOPIFY_CTO_CLIENT_ID") && has("SHOPIFY_CTO_CLIENT_SECRET"),
  };
}

export type ShopifyCreds = { shop: string; clientId: string; clientSecret: string };
/** Each brand has its own Shopify app credentials; there is no shared token between stores. */
export function shopifyCreds(brand: string): ShopifyCreds {
  const key = brand.toUpperCase().replace(/[^A-Z0-9]/g, "_");
  const shop = process.env[`SHOPIFY_${key}_SHOP`];
  const clientId = process.env[`SHOPIFY_${key}_CLIENT_ID`];
  const clientSecret = process.env[`SHOPIFY_${key}_CLIENT_SECRET`];
  if (!shop || !clientId || !clientSecret) throw new Error(`Shopify is not configured for brand ${brand}`);
  if (!/^[a-z0-9-]+\.myshopify\.com$/.test(shop)) throw new Error(`SHOPIFY_${key}_SHOP must be the store's .myshopify.com domain`);
  return { shop, clientId, clientSecret };
}
