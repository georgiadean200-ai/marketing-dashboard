// End-to-end tests against a real PostgreSQL database built from the migrations.
// Run with a local Postgres: TEST_DATABASE_URL=postgres://user:pass@host/studio_it npm test
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { JSDOM } from "jsdom";
import { webcrypto } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { pgSupabase, resetDatabase, sqlAsOwner, closePool } from "./support/pg-supabase";
import { syncBrand, PRODUCTS_QUERY } from "@/lib/shopify/sync";
import { runPlanner, type ModelClient } from "@/lib/ai/planner";
import { supabaseStore } from "@/lib/ai/store";

const G = "00000000-0000-0000-0000-00000000000a", C = "00000000-0000-0000-0000-00000000000c";
const root = new URL("..", import.meta.url).pathname;
const migrations = readdirSync(`${root}supabase/migrations`).sort().map((f) => readFileSync(`${root}supabase/migrations/${f}`, "utf8"));
const service = pgSupabase({ uid: null, service: true }) as unknown as SupabaseClient;

// Synthetic Shopify pages in the shape the live TTC store returns.
const node = (i: number, title: string, tags: string[], inv = 20) => ({ id: `gid://shopify/Product/${i}`, title, handle: title.toLowerCase().replace(/\W+/g, "-"),
  onlineStoreUrl: `https://www.ttc.test/products/${i}`, vendor: "The Tile Collective", productType: "", tags, totalInventory: inv, updatedAt: "2026-10-01T00:00:00Z",
  description: `${title} porcelain tile...`, variants: { nodes: [{ title: "Default Title", sku: `S${i}`, price: "29.95", inventoryQuantity: inv }] },
  featuredMedia: { preview: { image: { url: `https://cdn.test/${i}.jpg` } } }, thickness: { value: "9.5mm" }, edge: null, slip: { value: "P4" }, material: null, suitable: null, soldPer: null, boxQty: null, grout: null });
function fakeShopify(shop: string, nodes: ReturnType<typeof node>[]) {
  return (async (_brand: string, query: string, vars: Record<string, unknown> = {}) => {
    if (!query.includes("products(")) return { shop: { name: "TTC Test", myshopifyDomain: shop, primaryDomain: { host: "www.ttc.test" }, currencyCode: "AUD" } };
    assert.equal(query, PRODUCTS_QUERY);
    const start = vars.after ? Number(vars.after) : 0, page = nodes.slice(start, start + 2);
    return { products: { pageInfo: { hasNextPage: start + 2 < nodes.length, endCursor: String(start + 2) }, nodes: page } };
  }) as never;
}

before(async () => {
  await resetDatabase([readFileSync(`${root}supabase/tests_local_stubs.sql`, "utf8"), ...migrations, readFileSync(`${root}supabase/seed.sql`, "utf8")]);
  await sqlAsOwner(`insert into auth.users(id,email,raw_user_meta_data) values ($1,'georgia@test','{"name":"Georgia Test"}'),($2,'con@test','{}')`, [G, C]);
  await sqlAsOwner(`insert into public.memberships values ($1,'ttc','admin',true,now()),($1,'cto','admin',true,now()),($2,'ttc','contributor',false,now())`, [G, C]);
});
const windows: { close(): void }[] = [];
after(async () => { windows.forEach((w) => w.close()); await closePool(); });

test("Shopify sync imports one store, keeps it isolated, and never deletes history", async () => {
  const creds = { shop: "ttc-test.myshopify.com", clientId: "x", clientSecret: "y" };
  const nodes = [node(1, "Testa Ice Polished 600 x 600", ["600 x 600"]), node(2, "Testa Sand Matte", [], 0), node(3, "Grate Floor Drain Chrome", [])];
  const r1 = await syncBrand("ttc", { db: service, creds, query: fakeShopify(creds.shop, nodes) });
  assert.deepEqual(r1, { count: 3, tiles: 2, deactivated: 0 });
  const rows = await sqlAsOwner(`select id, size, kind, url, specs from public.products order by id`);
  assert.equal(rows[0].id, "shop-ttc-1"); assert.equal(rows[0].size, "600 × 600 mm"); assert.equal(rows[2].kind, "accessory");
  assert.deepEqual(rows[0].specs, { thickness: "9.5mm", slipRating: "P4" });
  const r2 = await syncBrand("ttc", { db: service, creds, query: fakeShopify(creds.shop, nodes.slice(0, 2)) });
  assert.equal(r2.deactivated, 1);
  assert.equal((await sqlAsOwner(`select active from public.products where id='shop-ttc-3'`))[0].active, false);
  await assert.rejects(syncBrand("ttc", { db: service, creds: { ...creds, shop: "other.myshopify.com" }, query: fakeShopify("other.myshopify.com", nodes) }), /locked to ttc-test/);
  await assert.rejects(syncBrand("cto", { db: service, creds, query: fakeShopify(creds.shop, nodes) }), /already linked to brand ttc/);
  await assert.rejects(syncBrand("ttc", { db: service, creds, query: fakeShopify("wrong.myshopify.com", nodes) }), /reach wrong.myshopify.com/);
});

test("AI planner saves fact-checked drafts for review through the real database", async () => {
  let step = 0;
  const model: ModelClient = { async create() {
    step++;
    if (step === 1) return { stop_reason: "tool_use", content: [{ type: "tool_use", id: "a", name: "list_products", input: { query: "testa" } }] };
    if (step === 2) return { stop_reason: "tool_use", content: [{ type: "tool_use", id: "b", name: "create_drafts", input: { drafts: [
      { title: "Tile of the Week: Testa Ice Polished", series: "Tile of the Week", channel: "Instagram", format: "Single image", scheduledAt: "2027-01-13T18:00",
        caption: "Testa Ice Polished: 600 × 600 mm, 9.5mm thick, P4.", brief: "Concept: light.", productIds: ["shop-ttc-1"] },
      { title: "Wrong", series: "Inspiration", channel: "Instagram", format: "Single image", scheduledAt: "2027-01-11T18:00", caption: "Testa Ice Polished in stock now", brief: "c", productIds: ["shop-ttc-1"] }] } }] };
    return { stop_reason: "end_turn", content: [{ type: "text", text: "Done." }] };
  } };
  const r = await runPlanner({ store: await supabaseStore(service, "ttc"), model, modelName: "m", messages: [{ role: "user", content: "plan" }], forReview: true, userId: G });
  assert.equal(r.createdIds.length, 1); assert.equal(r.rejected.length, 1);
  const [row] = await sqlAsOwner(`select status, created_by_agent, created_by from public.content_items where id=$1`, [r.createdIds[0]]);
  assert.deepEqual(row, { status: "Needs Review", created_by_agent: "planner", created_by: G });
  const [log] = await sqlAsOwner(`select actor_agent from public.audit_log where content_id=$1 and action='AI draft created'`, [r.createdIds[0]]);
  assert.equal(log.actor_agent, "planner");
});

// ── The original dashboard, unchanged, running on the adapter against the real database ──
async function openStudio(uid: string, roles: Record<string, string>) {
  const bundle = readFileSync(`${root}public/studio/studio.js`, "utf8");
  const dom = new JSDOM(`<!doctype html><html><body><div id="app"><aside class="side" id="side"></aside><div class="main" id="main"><div id="banners"></div><header class="top" id="top"></header><main class="view" id="view" tabindex="-1"></main></div></div><div class="scrim" id="scrim"></div><div id="modal" hidden></div><div id="toast"></div><input type="file" id="fileIn" hidden></body></html>`,
    { runScripts: "dangerously", pretendToBeVisual: true, url: "https://studio.test/studio#approvals" });
  const w = dom.window as unknown as Record<string, unknown> & Window & typeof globalThis;
  windows.push(dom.window);
  const errors: string[] = [];
  w.addEventListener("error", (e) => errors.push(String((e as ErrorEvent).error?.stack ?? (e as ErrorEvent).message)));
  Object.assign(w, { requestAnimationFrame: (f: () => void) => setTimeout(f, 0), __sb: pgSupabase({ uid, service: false }),
    __STUDIO__: { user: { id: uid, name: "Georgia Test" }, roles, canPublish: {} } });
  if (!w.crypto?.randomUUID) Object.defineProperty(w, "crypto", { value: webcrypto });
  w.fetch = (async (url: string) => new Response(JSON.stringify(String(url).includes("/api/shopify/") ? { connection: { shop_domain: "ttc-test.myshopify.com", shop_name: "TTC Test" } } : {}), { status: 200 })) as typeof fetch;
  const script = w.document.createElement("script"); script.textContent = bundle; w.document.body.appendChild(script); // loaded like a browser does
  const S = (expr: string) => w.eval(expr);
  for (let i = 0; i < 80 && S("S.mode") !== "live"; i++) await sleep(50);
  await sleep(100);
  const click = async (sel: string) => { const el = w.document.querySelector(sel) as HTMLElement | null; if (!el) throw new Error(`missing ${sel}`); el.dispatchEvent(new w.MouseEvent("click", { bubbles: true })); await sleep(200); };
  const confirm = async (text?: string) => { await sleep(50); const m = w.document.querySelector("#modal") as HTMLElement; if (m.hidden) return false; if (text != null) (w.document.querySelector("#mi") as HTMLTextAreaElement).value = text; await click('#modal [data-m="1"]'); await sleep(250); return true; };
  return { w, S, click, confirm, errors, toast: () => w.document.querySelector("#toast")!.textContent ?? "" };
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const db = async (sql: string, p: unknown[] = []) => (await sqlAsOwner(sql, p))[0];

test("dashboard: create → approve → edit invalidates → re-approve → schedule, all enforced by the database", async () => {
  const g = await openStudio(G, { ttc: "admin", cto: "admin" });
  assert.equal(g.S("S.mode"), "live");
  assert.equal(g.S("products('ttc').length"), 2, "only active TTC products");
  assert.ok(g.S("S.items.some(i=>i.createdBy==='ai')"), "AI draft from the planner is visible");
  g.S(`openStudio(newItem({fields:{title:"Inspiration: Testa Ice Polished",caption:"Testa Ice Polished in 600 × 600 mm.",productIds:["shop-ttc-1"]}}))`);
  await sleep(100);
  await g.click('[data-a="submit"]'); await sleep(300);
  const created = await db(`select id, status, created_by from public.content_items where title='Inspiration: Testa Ice Polished'`);
  assert.equal(created.status, "Needs Review"); assert.equal(created.created_by, G);
  g.S("S.queueTab='waiting'"); await g.click('[data-a="go"][data-p="approvals"]').catch(() => {}); g.S("render()");
  await g.click(`[data-a="approve"][data-id="${created.id}"]`); await sleep(400);
  const ap = await db(`select c.status, c.client_fingerprint, a.client_fingerprint as afp from public.content_items c join public.approvals a on a.id=c.approval_id where c.id=$1`, [created.id]);
  assert.equal(ap.status, "Approved"); assert.ok(ap.client_fingerprint && ap.client_fingerprint === ap.afp);
  await sleep(400);
  assert.equal(g.S(`verified(S.items.find(i=>i.id==="${created.id}"))`), true, "dashboard verifies the approval after reload");
  g.S(`openStudio(S.items.find(i=>i.id==="${created.id}"))`); await sleep(100);
  const ta = g.w.document.querySelector('[data-f="caption"]') as HTMLTextAreaElement;
  ta.value += " Edited."; ta.dispatchEvent(new g.w.Event("input", { bubbles: true }));
  await g.click('[data-a="save"]'); await g.confirm(); await sleep(300);
  assert.deepEqual(await db(`select status, approval_id from public.content_items where id=$1`, [created.id]), { status: "Needs Review", approval_id: null });
  await g.S(`approve("${created.id}")`); await sleep(400);
  const pending = g.S(`markScheduled("${created.id}")`); // opens a confirmation dialog
  await g.confirm(); await pending; await sleep(300);
  assert.equal((await db(`select status from public.content_items where id=$1`, [created.id])).status, "Scheduled");
  assert.equal((await db(`select state from public.publishing_jobs where content_id=$1`, [created.id])).state, "manual");
  assert.deepEqual(g.errors, []);
});

test("dashboard as a Contributor: cannot approve, schedule, force statuses or approve images", async () => {
  const c = await openStudio(C, { ttc: "contributor" });
  assert.equal(c.S("S.canApprove"), false);
  const id = (await db(`select id from public.content_items where status='Needs Review' limit 1`)).id;
  c.S("S.page='approvals';S.queueTab='waiting';render()");
  assert.ok([...c.w.document.querySelectorAll('[data-a="approve"]')].every((b) => (b as HTMLButtonElement).disabled), "approve buttons disabled");
  const forced = await c.S(`SB.rpc("approve_content",{p_content:"${id}"})`);
  assert.match(forced.error.message, /Only approvers/);
  const direct = await c.S(`SB.from("content_items").update({status:"Approved"}).eq("id","${id}")`);
  assert.match(direct.error.message, /approval workflow/);
  const sched = await c.S(`SB.rpc("mark_scheduled_manual",{p_content:"${id}"})`);
  assert.ok(sched.error);
  await c.S(`handleFiles([new File(["x"],"tile.jpg",{type:"image/jpeg"})],"media","shop-ttc-1")`); await sleep(300);
  const asset = await db(`select id, approved, product_id, uploaded_by from public.assets where file_name='tile.jpg'`);
  assert.deepEqual([asset.approved, asset.product_id, asset.uploaded_by], [false, "shop-ttc-1", C]);
  const tick = await c.S(`SB.from("assets").update({approved:true}).eq("id","${asset.id}")`);
  assert.match(tick.error.message, /Only approvers can approve images/);
  const del = await c.S(`SB.from("audit_log").delete().eq("brand_id","ttc").select("id")`);
  assert.ok(del.error || del.data.length === 0, "audit rows cannot be deleted");
  assert.ok(Number((await db(`select count(*)::int n from public.audit_log`)).n) > 5);
  assert.equal(c.S("S.items.some(i=>i.brand==='cto')"), false, "no access to the other brand's content");
  assert.ok((await db(`select ok from public.verify_audit_chain()`)).ok, "audit hash chain intact");
  assert.deepEqual(c.errors, []);
});

test("dashboard: every page and every non-destructive button works on the new backend", async () => {
  const g = await openStudio(G, { ttc: "admin", cto: "admin" });
  const pages = g.S("Object.keys(PAGES)") as string[];
  const skip = new Set(["clearDemo", "pause", "sendChat", "prompt", "approve", "reject", "changes", "markSched", "markPub", "markFail", "retry", "mediaDel", "archive",
    "upload", "approveCamp", "campToCal", "submitAll", "submitOne", "aiGen", "aiRewrite", "aiCamp", "saveBrand", "save", "submit", "saveCamp", "dupe", "shopImport"]);
  let clicks = 0;
  const broken: string[] = [];
  for (const p of pages) {
    g.w.location.hash = p; await sleep(80);
    if (!g.w.document.querySelector("#view")!.textContent!.trim()) broken.push("empty page " + p);
    const n = g.w.document.querySelectorAll("#view [data-a], #top [data-a]").length;
    for (let i = 0; i < n; i++) {
      g.w.location.hash = p; g.S("S.edit=null;S.pop='';render()"); await sleep(10);
      const el = [...g.w.document.querySelectorAll("#view [data-a], #top [data-a]")][i] as HTMLButtonElement | undefined;
      if (!el || el.disabled || skip.has(el.dataset.a!)) continue;
      const before = g.errors.length;
      el.dispatchEvent(new g.w.MouseEvent("click", { bubbles: true })); await sleep(60);
      const m = g.w.document.querySelector("#modal") as HTMLElement;
      if (!m.hidden) (m.querySelector('[data-m="0"]') as HTMLElement).click();
      if (g.errors.length > before) broken.push(`${p}:${el.dataset.a}`);
      clicks++;
    }
  }
  assert.deepEqual(broken, [], broken.join(", "));
  assert.ok(clicks > 80, `only ${clicks} clicks`);
  assert.deepEqual(g.errors, []);
});

// Runs only when pointed at a real artifact export: ARTIFACT_EXPORT_DIR=./artifact-export LIVE_PRODUCTS=./products.json
test("artifact import moves real posts, leaves demo data behind, and is safe to re-run", { skip: !process.env.ARTIFACT_EXPORT_DIR }, async () => {
  const { importArtifact } = await import("@/lib/migrate/artifact");
  const { mapProduct } = await import("@/lib/shopify/map");
  const dir = process.env.ARTIFACT_EXPORT_DIR!;
  const live = JSON.parse(readFileSync(process.env.LIVE_PRODUCTS!, "utf8"));
  await sqlAsOwner(`delete from public.products where brand_id='ttc'`).catch(() => {});
  await sqlAsOwner(`update public.shopify_connections set shop_domain='thetilecollective.myshopify.com' where brand_id='ttc'`);
  const rows = live.nodes.map((n: never) => mapProduct(n, "ttc", "thetilecollective.myshopify.com", live.shop.host, "AUD", "live"));
  assert.equal((await service.from("products").upsert(rows, { onConflict: "id" })).error, null);
  const dry = await importArtifact(dir, service, { apply: false });
  assert.equal(dry.skippedDemo, 16);
  assert.ok(dry.posts.every((p) => p.result.startsWith("would import")), JSON.stringify(dry.posts));
  assert.equal((await db(`select count(*)::int n from public.content_items where id like 'ai-ttc-real-%'`)).n, 0, "dry run writes nothing");
  const run = await importArtifact(dir, service, { apply: true });
  assert.equal(run.posts.filter((p) => p.result.startsWith("imported")).length, 3, JSON.stringify(run.posts));
  const imported = await sqlAsOwner(`select id, status, created_by_agent, product_ids, scheduled_at from public.content_items where id like 'ai-ttc-real-%' order by id`);
  assert.ok(imported.every((r) => r.status === "Needs Review" && r.created_by_agent === "planner" && r.product_ids.length === 1));
  assert.equal(new Date(imported[0].scheduled_at).toISOString(), "2026-11-23T08:00:00.000Z"); // 6 pm Brisbane kept
  assert.equal(run.auditImported, 4);
  assert.equal((await db(`select count(*)::int n from public.content_items where id like 'demo-%'`)).n, 0, "no demo posts migrated");
  const again = await importArtifact(dir, service, { apply: true });
  assert.ok(again.posts.every((p) => p.result.startsWith("already in Supabase")));
  assert.equal(again.auditImported, 0, "re-run adds no duplicate activity");
  assert.ok((await db(`select ok from public.verify_audit_chain()`)).ok);
});

// ───────── UGC Discovery ─────────
test("UGC: discovery merges tags and mentions, spots duplicates, refreshes previews, and keeps brands apart", async () => {
  const { discoverBrand } = await import("@/lib/ugc/discover");
  const tile = (await db(`select title from public.products where brand_id='ttc' and active and kind='tile' order by id limit 1`)).title as string;
  const media = (id: string, code: string, user: string, caption: string, o: Record<string, unknown> = {}) => ({ id, caption, media_type: "IMAGE",
    media_url: `https://scontent.cdninstagram.com/${id}.jpg`, permalink: `https://www.instagram.com/p/${code}/`, timestamp: "2026-11-01T02:00:00+0000", username: user, ...o });
  let previewVersion = 1;
  const graph = (async (path: string, params: Record<string, string>) => {
    if (path === "1784" && params.fields === "id,username") return { id: "1784", username: "thetilecollective" };
    if (path === "1784/tags") return { data: [
      media("m1", "AAA111", "Jane.Builds", `Our ensuite reno is finished! ${tile} looks amazing #reno`, { media_url: `https://scontent.cdninstagram.com/m1-v${previewVersion}.jpg` }),
      media("m2", "AAA999", "jane.builds", `Our ensuite reno is finished! ${tile} looks amazing #bathroom`),
      media("m3", "VID123", "smith.designs", "New kitchen splashback reveal", { media_type: "VIDEO", media_url: undefined, thumbnail_url: "https://scontent.cdninstagram.com/v.jpg" })] };
    if (params.fields?.startsWith("mentioned_media.media_id(m4)")) return { mentioned_media: media("m4", "AAA111", "jane.builds", `Our ensuite reno is finished! ${tile} looks amazing`) };
    throw new Error(`unexpected ${path} ${JSON.stringify(params)}`);
  }) as never;
  await sqlAsOwner(`insert into public.ig_mention_events(brand_id, media_id) values ('ttc','m4')`);
  const r1 = await discoverBrand("ttc", { db: service, graph, igUserId: "1784" });
  assert.deepEqual(r1, { added: 2, refreshed: 1, duplicates: 1, mentionsProcessed: 1 }); // m4 is the same post as m1
  const rows = await sqlAsOwner(`select fingerprint, sources, creator_handle, status, duplicate_of, relevance_score, product_matches, preview_url from public.ugc_items where brand_id='ttc' order by fingerprint`);
  const a = rows.find((r) => r.fingerprint === "ig:AAA111")!;
  assert.deepEqual(a.sources.sort(), ["instagram_mention", "instagram_tag"]);
  assert.equal(a.creator_handle, "jane.builds"); assert.ok(a.relevance_score >= 60); assert.ok(a.product_matches.length >= 1);
  assert.ok(rows.find((r) => r.fingerprint === "ig:AAA999")!.duplicate_of, "re-shared copy marked as duplicate");
  assert.equal(rows.find((r) => r.fingerprint === "ig:VID123")!.preview_url, "https://scontent.cdninstagram.com/v.jpg", "video uses its thumbnail");
  previewVersion = 2;
  const r2 = await discoverBrand("ttc", { db: service, graph, igUserId: "1784" });
  assert.equal(r2.added, 0); assert.equal(r2.mentionsProcessed, 0);
  assert.match((await db(`select preview_url from public.ugc_items where fingerprint='ig:AAA111'`)).preview_url, /m1-v2/, "expired preview links refreshed");
  const cto = pgSupabase({ uid: "00000000-0000-0000-0000-0000000000ff", service: false }) as unknown as SupabaseClient;
  assert.equal(((await cto.from("ugc_items").select("id")).data ?? []).length, 0, "someone without TTC access sees no TTC UGC");
});

test("UGC: Later import, AI recommendation, add to calendar, and permission gating end to end", async () => {
  const { parseLaterImport } = await import("@/lib/ugc/normalize");
  const { recommendUgc } = await import("@/lib/ugc/recommender");
  const { ugcStore } = await import("@/lib/ugc/store");
  const { draftFromUgc } = await import("@/lib/ugc/draft");
  const contributor = pgSupabase({ uid: C, service: false }) as unknown as SupabaseClient;
  const { rows } = parseLaterImport("https://www.instagram.com/p/AAA111/ @jane.builds\nhttps://www.instagram.com/p/LATER77/ @studio.interiors");
  const ins = await contributor.from("ugc_items").upsert(rows.map((r) => ({ brand_id: "ttc", fingerprint: r.fingerprint, sources: ["later_import"], permalink: r.permalink, creator_handle: r.creator_handle })),
    { onConflict: "brand_id,fingerprint", ignoreDuplicates: true }).select("id");
  assert.equal(ins.error, null); assert.equal(ins.data!.length, 1, "post already found via Instagram is not imported twice");

  const target = (await db(`select id from public.ugc_items where fingerprint='ig:AAA111'`)).id as string;
  const tileId = (await db(`select product_matches[1] p from public.ugc_items where id=$1`, [target])).p as string;
  const fake = { async create() { return { content: [{ type: "tool_use", name: "record_recommendation", input: { fit: true, opportunity: "Customer Projects", strength: 5,
    why: "A finished ensuite that shows the tile beautifully.", caption: "A calm, finished ensuite from our community.", productIds: [tileId], suggestedDate: "2027-02-12" } }] }; } };
  const store = await ugcStore(service, "ttc");
  const recs = await recommendUgc({ store, model: fake, modelName: "m", now: new Date("2027-02-01T00:00:00Z"), ids: [target] });
  assert.equal(recs[0].suggestion.fit, true);
  assert.equal((await db(`select status from public.ugc_items where id=$1`, [target])).status, "recommended");
  assert.equal((await (await ugcStore(service, "ttc")).candidates({ limit: 10 })).some((c) => c.id === target), false, "not re-recommended within four weeks");

  const draft = await draftFromUgc(contributor, target);
  assert.ok(draft.contentId, JSON.stringify(draft));
  const row = await db(`select status, ugc_id, caption, product_ids from public.content_items where id=$1`, [draft.contentId]);
  assert.equal(row.status, "Needs Review"); assert.equal(row.ugc_id, target);
  assert.match(row.caption, /📷 @jane\.builds$/); assert.deepEqual(row.product_ids, [tileId]);
  assert.equal((await draftFromUgc(contributor, target)).already, true, "adding twice doesn't duplicate the draft");

  // Through the real dashboard: quality check flags missing permission, approval is refused, then allowed once granted.
  const g = await openStudio(G, { ttc: "admin", cto: "admin" });
  g.w.location.hash = "ugc"; await sleep(150);
  assert.ok(g.w.document.querySelector('.nav[data-p="ugc"]'), "UGC Discovery is in the sidebar");
  assert.match(g.w.document.querySelector("#view")!.textContent!, /@jane\.builds/);
  assert.ok(g.S(`qc(S.items.find(i=>i.id==="${draft.contentId}")).some(x=>x.l==="error"&&/permission/.test(x.m))`), "studio flags the missing permission");
  const refused = await g.S(`SB.rpc("approve_content",{p_content:"${draft.contentId}"})`);
  assert.match(refused.error.message, /without current permission/);
  const saveBtn = g.w.document.querySelector(`[data-a="ugcSave"][data-id="${target}"]`) as HTMLButtonElement;
  assert.ok(saveBtn.disabled, "Save to Content Library is disabled until permission is granted");
  await g.click(`[data-a="ugcPerm"][data-id="${target}"]`);
  (g.w.document.querySelector("#pm-status") as HTMLSelectElement).value = "Permission granted";
  (g.w.document.querySelector("#pm-evidence") as HTMLTextAreaElement).value = "Instagram DM reply 11 Nov 2026: \"Yes, happy for you to share with credit\"";
  (g.w.document.querySelector('.pm-scope[value="organic_social"]') as HTMLInputElement).checked = true;
  await g.click('#modal [data-m="1"]'); await sleep(400);
  const perm = await db(`select permission_status, usage_scope, attribution, permission_recorded_by from public.ugc_items where id=$1`, [target]);
  assert.deepEqual([perm.permission_status, perm.usage_scope, perm.attribution, perm.permission_recorded_by], ["Permission granted", ["organic_social"], "📷 @jane.builds", G]);
  assert.equal((await db(`select count(*)::int n from public.ugc_permission_events where ugc_id=$1`, [target])).n, 1);
  await g.S(`LOADERS.ugc_items().then(render)`); await sleep(200);
  assert.ok(!g.S(`qc(S.items.find(i=>i.id==="${draft.contentId}")).some(x=>/permission/.test(x.m))`), "permission warning cleared");
  await g.S(`approve("${draft.contentId}")`); await sleep(400);
  assert.equal((await db(`select status from public.content_items where id=$1`, [draft.contentId])).status, "Approved");

  // A Contributor can mark permission requested but not record the creator's decision.
  const c = await openStudio(C, { ttc: "contributor" });
  const other = (await db(`select id from public.ugc_items where fingerprint='ig:VID123'`)).id as string;
  const asked = await c.S(`SB.from("ugc_items").update({permission_status:"Permission requested",permission_requested_via:"Instagram DM"}).eq("id","${other}")`);
  assert.equal(asked.error, null);
  const grant = await c.S(`SB.from("ugc_items").update({permission_status:"Permission granted",permission_evidence:"they said yes",usage_scope:["organic_social"],attribution:"x"}).eq("id","${other}")`);
  assert.match(grant.error.message, /Only approvers/);
  assert.deepEqual([...g.errors, ...c.errors], []);
});
