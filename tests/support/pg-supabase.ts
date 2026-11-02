// Test double for supabase-js that runs every query against a real PostgreSQL database, inside a transaction
// that impersonates a signed-in user (role `authenticated` + JWT subject) or server code (`service_role`).
// Row level security, triggers and permissions are therefore the real ones from the migrations.
import pg from "pg";

// Return values the way Supabase's REST API does (JSON): timestamps as ISO strings, bigint/numeric as numbers.
for (const oid of [1184, 1114]) pg.types.setTypeParser(oid, (v: string) => new Date(v.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00")).toISOString());
pg.types.setTypeParser(1082, (v: string) => v);
pg.types.setTypeParser(20, (v: string) => Number(v));
pg.types.setTypeParser(1700, (v: string) => Number(v));
export const PG_URL = process.env.TEST_DATABASE_URL ?? "postgres://postgres:testpw@127.0.0.1:5432/studio_it";
let pool: pg.Pool | null = null;
export const getPool = () => (pool ??= new pg.Pool({ connectionString: PG_URL, max: 4 }));
export async function closePool() { await pool?.end(); pool = null; }

type ColType = Record<string, Record<string, string>>;
let types: ColType | null = null;
let procs: Record<string, { retset: boolean; ret: string }> | null = null;
let pkeys: Record<string, string> = {};
async function meta() {
  if (types && procs) return;
  const p = getPool();
  const c = await p.query(`select table_name, column_name, data_type from information_schema.columns where table_schema='public'`);
  types = {}; for (const r of c.rows) (types[r.table_name] ??= {})[r.column_name] = r.data_type;
  const k = await p.query(`select tc.table_name, string_agg(kcu.column_name, ',' order by kcu.ordinal_position) cols from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
    where tc.table_schema='public' and tc.constraint_type='PRIMARY KEY' group by tc.table_name`);
  pkeys = Object.fromEntries(k.rows.map((r) => [r.table_name, r.cols]));
  const f = await p.query(`select proname, proretset, format_type(prorettype, null) ret from pg_proc where pronamespace='public'::regnamespace`);
  procs = {}; for (const r of f.rows) procs[r.proname] = { retset: r.proretset, ret: r.ret };
}
type Who = { uid: string | null; service: boolean };
async function run<T>(who: Who, sql: string, params: unknown[]): Promise<{ rows: T[]; rowCount: number }> {
  const c = await getPool().connect();
  try {
    await c.query("begin");
    if (who.service) {
      await c.query("set local role service_role");
      await c.query("select set_config('request.jwt.claim.role','service_role',true), set_config('request.jwt.claim.sub','',true)");
    } else {
      await c.query("set local role authenticated");
      await c.query("select set_config('request.jwt.claim.role','authenticated',true), set_config('request.jwt.claim.sub',$1,true)", [who.uid ?? ""]);
    }
    const r = await c.query(sql, params);
    await c.query("commit");
    return { rows: r.rows as T[], rowCount: r.rowCount ?? 0 };
  } catch (e) { await c.query("rollback"); throw e; } finally { c.release(); }
}
const ident = (s: string) => { if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw new Error(`bad identifier ${s}`); return `"${s}"`; };

class Query implements PromiseLike<{ data: unknown; error: unknown; count?: number | null }> {
  private op: "select" | "insert" | "upsert" | "update" | "delete" = "select";
  private cols = "*"; private filters: [string, string, unknown][] = []; private orders: string[] = [];
  private lim?: number; private off?: number; private one: "" | "single" | "maybe" = ""; private returning = false;
  private rows: Record<string, unknown>[] = []; private patch: Record<string, unknown> = {}; private conflict = "";
  private countOnly = false;
  constructor(private who: Who, private table: string) {}
  select(cols = "*", opts?: { count?: string; head?: boolean }) {
    if (this.op === "select") { this.cols = cols; if (opts?.head) this.countOnly = true; } else this.returning = true;
    return this;
  }
  insert(r: Record<string, unknown> | Record<string, unknown>[]) { this.op = "insert"; this.rows = Array.isArray(r) ? r : [r]; return this; }
  upsert(r: Record<string, unknown> | Record<string, unknown>[], o?: { onConflict?: string }) { this.op = "upsert"; this.rows = Array.isArray(r) ? r : [r]; this.conflict = o?.onConflict ?? ""; return this; }
  update(p: Record<string, unknown>) { this.op = "update"; this.patch = p; return this; }
  delete() { this.op = "delete"; return this; }
  eq(c: string, v: unknown) { this.filters.push([c, "=", v]); return this; }
  neq(c: string, v: unknown) { this.filters.push([c, "<>", v]); return this; }
  gte(c: string, v: unknown) { this.filters.push([c, ">=", v]); return this; }
  lte(c: string, v: unknown) { this.filters.push([c, "<=", v]); return this; }
  in(c: string, v: unknown[]) { this.filters.push([c, "in", v]); return this; }
  order(c: string, o?: { ascending?: boolean }) { this.orders.push(`${ident(c)} ${o?.ascending === false ? "desc" : "asc"}`); return this; }
  limit(n: number) { this.lim = n; return this; }
  range(a: number, b: number) { this.off = a; this.lim = b - a + 1; return this; }
  single() { this.one = "single"; return this; }
  maybeSingle() { this.one = "maybe"; return this; }
  then<A, B>(res?: ((v: { data: unknown; error: unknown; count?: number | null }) => A | PromiseLike<A>) | null, rej?: ((e: unknown) => B | PromiseLike<B>) | null) {
    return this.exec().then(res, rej);
  }
  private val(col: string, v: unknown, params: unknown[]) {
    const t = types![this.table]?.[col];
    if (t === "jsonb") { params.push(JSON.stringify(v)); return `$${params.length}::jsonb`; }
    if (t === "ARRAY") { params.push(v); return `$${params.length}::text[]`; }
    params.push(v); return `$${params.length}`;
  }
  private where(params: unknown[]) {
    if (!this.filters.length) return "";
    return " where " + this.filters.map(([c, op, v]) => {
      if (op === "in") { params.push(v); return `${ident(c)} = any($${params.length})`; }
      params.push(v); return `${ident(c)} ${op} $${params.length}`;
    }).join(" and ");
  }
  private async exec() {
    await meta();
    const params: unknown[] = [];
    const cols = this.cols === "*" ? "*" : this.cols.split(",").map((c) => ident(c.trim())).join(", ");
    let sql: string;
    try {
      if (this.op === "select") {
        sql = this.countOnly ? `select count(*)::int as n from public.${ident(this.table)}${this.where(params)}`
          : `select ${cols} from public.${ident(this.table)}${this.where(params)}${this.orders.length ? " order by " + this.orders.join(", ") : ""}${this.lim != null ? ` limit ${this.lim}` : ""}${this.off ? ` offset ${this.off}` : ""}`;
      } else if (this.op === "insert" || this.op === "upsert") {
        const keys = [...new Set(this.rows.flatMap((r) => Object.keys(r)))];
        const values = this.rows.map((r) => "(" + keys.map((k) => (k in r ? this.val(k, r[k], params) : "default")).join(", ") + ")").join(", ");
        sql = `insert into public.${ident(this.table)} (${keys.map(ident).join(", ")}) values ${values}`;
        if (this.op === "upsert") sql += ` on conflict (${(this.conflict || pkeys[this.table]!).split(",").map((c) => ident(c.trim())).join(", ")}) do update set ${keys.map((k) => `${ident(k)} = excluded.${ident(k)}`).join(", ")}`;
        sql += " returning *";
      } else if (this.op === "update") {
        const sets = Object.entries(this.patch).map(([k, v]) => `${ident(k)} = ${this.val(k, v, params)}`).join(", ");
        sql = `update public.${ident(this.table)} set ${sets}${this.where(params)} returning *`;
      } else sql = `delete from public.${ident(this.table)}${this.where(params)} returning *`;
      const r = await run<Record<string, unknown>>(this.who, sql, params);
      if (this.countOnly) return { data: null, error: null, count: (r.rows[0] as { n: number }).n };
      let data: unknown = this.op === "select" || this.returning ? r.rows : null;
      if (this.one) {
        if (this.one === "single" && r.rows.length !== 1) return { data: null, error: { message: `expected 1 row, got ${r.rows.length}`, code: "PGRST116" } };
        data = r.rows[0] ?? null;
      }
      return { data, error: null, count: null };
    } catch (e) {
      const err = e as { message: string; code?: string };
      return { data: null, error: { message: err.message, code: err.code } };
    }
  }
}

export function pgSupabase(who: Who) {
  const files = new Map<string, unknown>();
  return {
    from: (t: string) => new Query(who, t),
    async rpc(fn: string, args: Record<string, unknown> = {}) {
      await meta();
      const p = procs![fn]; if (!p) return { data: null, error: { message: `no function ${fn}` } };
      const params: unknown[] = [];
      const list = Object.entries(args).map(([k, v]) => {
        if (v !== null && typeof v === "object") { params.push(JSON.stringify(v)); return `${ident(k)} => $${params.length}::jsonb`; }
        params.push(v); return `${ident(k)} => $${params.length}`;
      }).join(", ");
      try {
        const sql = p.retset ? `select * from public.${ident(fn)}(${list})` : `select public.${ident(fn)}(${list}) as r`;
        const r = await run<{ r?: unknown }>(who, sql, params);
        return { data: p.retset ? r.rows : p.ret === "void" ? null : r.rows[0]?.r ?? null, error: null };
      } catch (e) { const err = e as { message: string; code?: string }; return { data: null, error: { message: err.message, code: err.code } }; }
    },
    storage: { from: () => ({
      upload: async (path: string, f: unknown) => { files.set(path, f); return { data: { path }, error: null }; },
      createSignedUrls: async (paths: string[]) => ({ data: paths.map((p) => ({ path: p, signedUrl: `https://storage.test/${p}?token=x` })), error: null }),
      remove: async (paths: string[]) => { paths.forEach((p) => files.delete(p)); return { data: null, error: null }; },
    }) },
    channel: () => { const ch = { on: () => ch, subscribe: () => ch }; return ch; },
    auth: { getUser: async () => ({ data: { user: who.uid ? { id: who.uid } : null } }) },
    _files: files,
  };
}

/** Recreates the test database from the real migrations, with local stand-ins for Supabase's auth and storage. */
export async function resetDatabase(sqlFiles: string[]) {
  const admin = new pg.Client({ connectionString: PG_URL.replace(/\/[^/]+$/, "/postgres") });
  await admin.connect();
  const name = new URL(PG_URL).pathname.slice(1);
  await admin.query(`drop database if exists ${ident(name)} with (force)`);
  await admin.query(`create database ${ident(name)}`);
  await admin.end();
  const c = new pg.Client({ connectionString: PG_URL });
  await c.connect();
  for (const sql of sqlFiles) await c.query(sql);
  await c.end();
  types = null; procs = null;
}
export async function sqlAsOwner(sql: string, params: unknown[] = []) { return (await getPool().query(sql, params)).rows; }
