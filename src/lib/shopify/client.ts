import "server-only";
import { env, shopifyCreds } from "@/lib/env";
import { adminClient } from "@/lib/supabase/admin";

type TokenRow = { access_token: string; expires_at: string };

/** Admin API token for one brand's store via the client credentials grant (Dev Dashboard apps owned by the
 *  same organisation as the store). Tokens last about 24 hours; cached in a table only the server can read. */
export async function accessToken(brand: string, force = false): Promise<string> {
  const db = adminClient();
  if (!force) {
    const { data } = await db.from("shopify_tokens").select("access_token, expires_at").eq("brand_id", brand).maybeSingle<TokenRow>();
    if (data && new Date(data.expires_at).getTime() - Date.now() > 10 * 60_000) return data.access_token;
  }
  const { shop, clientId, clientSecret } = shopifyCreds(brand);
  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Shopify refused the app credentials for ${brand} (HTTP ${res.status}). Check the app is installed on ${shop}.`);
  const body = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) throw new Error("Shopify did not return an access token");
  const expires = new Date(Date.now() + (body.expires_in ?? 86_399) * 1000).toISOString();
  const saved = await db.from("shopify_tokens").upsert({ brand_id: brand, access_token: body.access_token, expires_at: expires }, { onConflict: "brand_id" });
  if (saved.error) throw new Error(`Could not cache the Shopify token: ${saved.error.message}`);
  return body.access_token;
}

type GqlResponse<T> = { data?: T; errors?: { message: string; extensions?: { code?: string } }[]; extensions?: { cost?: { throttleStatus?: { currentlyAvailable: number; restoreRate: number } } } };

/** Read-only Admin GraphQL call with throttling and token-refresh handling. */
export async function shopifyQuery<T>(brand: string, query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const { shop } = shopifyCreds(brand);
  const version = env().SHOPIFY_API_VERSION;
  let token = await accessToken(brand);
  for (let attempt = 1; attempt <= 5; attempt++) {
    const res = await fetch(`https://${shop}/admin/api/${version}/graphql.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
      body: JSON.stringify({ query, variables }),
      cache: "no-store",
    });
    if (res.status === 401 && attempt === 1) { token = await accessToken(brand, true); continue; }
    if (res.status === 429 || res.status >= 500) { await sleep(1000 * 2 ** attempt); continue; }
    if (!res.ok) throw new Error(`Shopify Admin API error ${res.status}`);
    const body = (await res.json()) as GqlResponse<T>;
    if (body.errors?.some((e) => e.extensions?.code === "THROTTLED")) {
      const t = body.extensions?.cost?.throttleStatus;
      await sleep(t ? Math.max(1000, (1000 * 600) / Math.max(1, t.restoreRate)) : 2000 * attempt);
      continue;
    }
    if (body.errors?.length) throw new Error(`Shopify: ${body.errors.map((e) => e.message).join("; ")}`);
    if (!body.data) throw new Error("Shopify returned no data");
    return body.data;
  }
  throw new Error("Shopify kept throttling the request; it will be retried later");
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
