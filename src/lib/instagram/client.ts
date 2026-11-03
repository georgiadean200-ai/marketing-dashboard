import "server-only";

// Official Instagram API (Graph API, "Instagram API with Facebook Login"). One Instagram professional account per
// brand, each with its own long-lived system-user token in server environment variables. Read-only use.
export type IgCreds = { igUserId: string; token: string; version: string };
export function igCreds(brand: string): IgCreds {
  const key = brand.toUpperCase().replace(/[^A-Z0-9]/g, "_");
  const igUserId = process.env[`META_${key}_IG_USER_ID`], token = process.env[`META_${key}_ACCESS_TOKEN`];
  if (!igUserId || !token) throw new Error(`Instagram is not connected for brand ${brand}`);
  return { igUserId, token, version: process.env.META_GRAPH_VERSION ?? "v25.0" };
}
export const igConfigured = (brand: string) => {
  const key = brand.toUpperCase();
  return Boolean(process.env[`META_${key}_IG_USER_ID`] && process.env[`META_${key}_ACCESS_TOKEN`]);
};

export type IgMedia = { id: string; caption?: string; media_type?: string; media_url?: string; thumbnail_url?: string; permalink?: string;
  timestamp?: string; username?: string; children?: { data: { media_url?: string; media_type?: string; thumbnail_url?: string }[] } };
export const MEDIA_FIELDS = "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,username,children{media_type,media_url,thumbnail_url}";

export type GraphGet = <T>(path: string, params: Record<string, string>) => Promise<T>;
export function graphFor(creds: IgCreds): GraphGet {
  return async <T>(path: string, params: Record<string, string>): Promise<T> => {
    const url = new URL(`https://graph.facebook.com/${creds.version}/${path}`);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    for (let attempt = 1; attempt <= 4; attempt++) {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${creds.token}` }, cache: "no-store" });
      const body = (await res.json().catch(() => ({}))) as { error?: { message: string; code?: number; is_transient?: boolean } } & T;
      if (res.ok && !body.error) return body;
      const e = body.error;
      if (res.status >= 500 || e?.is_transient || e?.code === 4 || e?.code === 17 || e?.code === 32) { await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt)); continue; }
      if (e?.code === 190) throw new Error("The Instagram access token has expired or was revoked; create a new one in Meta Business settings");
      throw new Error(`Instagram API: ${e?.message ?? `HTTP ${res.status}`}`);
    }
    throw new Error("Instagram API kept rate-limiting the request; it will be retried later");
  };
}
