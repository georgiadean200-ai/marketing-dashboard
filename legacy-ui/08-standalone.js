
/* ═════════ Standalone adapter ═════════
   Runs the same dashboard on Supabase and this app's own server instead of the Claude Artifact runtime.
   Only data, AI and Shopify plumbing is replaced here; every screen, style and interaction above is unchanged.
   Permissions are enforced by the database (row level security and triggers), not by this file. */
const SB = window.__sb || null, BOOT = window.__STUDIO__ || {};
const RANK = { viewer: 0, contributor: 1, approver: 2, admin: 3 };
Object.defineProperty(S, "canApprove", { configurable: true, get() { return (RANK[BOOT.roles?.[S.brand]] ?? -1) >= 2; }, set() {} });
const isoLocal = (iso) => iso ? new Date(new Date(iso).getTime() + 36e6).toISOString().slice(0, 16) : "";
const localIso = (s) => s ? new Date(s + ":00+10:00").toISOString() : null;
const CLIENT_STATUSES = ["Idea", "AI Draft", "Needs Review"];
const LOGGED_BY_CLIENT = ["Brand guidelines updated", "Image uploaded", "Demo data removed", "Campaign ideas added"];

async function api(path, body) {
  const r = await fetch(path, { method: body ? "POST" : "GET", credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || "Request failed"), { code: j.error === "invalid_json" ? "invalid_json" : "http", status: r.status });
  return j;
}
const sbMsg = (e) => (e && e.message) ? e.message.replace(/^.*?ERROR:\s*/, "") : "Couldn't save. Check your connection and try again.";

// ── Row ↔ dashboard object mapping ──
const toItem = (r) => ({ id: r.id, brand: r.brand_id, campaignId: r.campaign_id || "", title: r.title, series: r.series, channel: r.channel, format: r.format,
  scheduledAt: isoLocal(r.scheduled_at), caption: r.caption, hashtags: r.hashtags || [], productIds: r.product_ids || [], mediaIds: r.asset_ids || [],
  slides: r.slides || [], shots: r.shots || [], brief: r.brief, direction: r.direction, status: r.status, reviewNote: r.review_note,
  approvalId: r.approval_id, approvedFingerprint: r.client_fingerprint, publishStatus: r.publish_status, publishedAt: isoLocal(r.published_at),
  archived: r.archived, demo: r.demo, revision: r.revision, ugcId: r.ugc_id || null, createdBy: r.created_by_agent ? "ai" : (r.created_by || ""), createdAt: r.created_at, updatedAt: r.updated_at });
const fromItem = (it) => ({ brand_id: it.brand, campaign_id: it.campaignId || null, title: it.title || "", series: it.series || "", channel: it.channel, format: it.format,
  scheduled_at: localIso(it.scheduledAt), caption: it.caption || "", hashtags: it.hashtags || [], product_ids: it.productIds || [], asset_ids: it.mediaIds || [],
  slides: it.slides || [], shots: it.shots || [], brief: it.brief || "", direction: it.direction || "", review_note: it.reviewNote || "", archived: !!it.archived,
  ...(CLIENT_STATUSES.includes(it.status) ? { status: it.status } : {}) });
const toApproval = (r) => ({ id: r.id, contentId: r.content_id, brand: r.brand_id, title: r.snapshot?.title || "", fingerprint: r.client_fingerprint,
  snapshot: { channel: r.snapshot?.channel, scheduledAt: isoLocal(r.snapshot?.scheduled_at) }, approvedBy: r.approved_by || "", approvedAt: r.approved_at, demo: r.demo });
const toAudit = (r) => ({ id: String(r.id), at: r.at, actor: r.actor || "system", actorKind: r.actor_agent ? "ai" : "person", action: r.action,
  contentId: r.content_id || "", title: (S.items.find((i) => i.id === r.content_id) || {}).title || r.detail, brand: r.brand_id || S.brand, detail: r.content_id ? r.detail : "" });
const CAMP_KEYS = ["objective", "audience", "messaging", "creative", "social", "email", "kpis", "schedule"];
const toCampaign = (r) => ({ ...(r.details || {}), id: r.id, brand: r.brand_id, name: r.name, status: r.status, productIds: r.product_ids || [],
  start: r.starts_on || "", end: r.ends_on || "", budget: r.budget ?? "", updatedAt: r.updated_at });
const fromCampaign = (c) => ({ brand_id: c.brand, name: c.name || "", status: c.status || "Proposal", product_ids: c.productIds || [],
  starts_on: c.start || null, ends_on: c.end || null, budget: c.budget === "" || c.budget == null ? null : Number(c.budget),
  details: Object.fromEntries(CAMP_KEYS.filter((k) => c[k] != null).map((k) => [k, c[k]])) });
const toProduct = (r) => ({ id: r.id, brand: r.brand_id, source: "shopify", gid: r.shopify_gid, handle: r.handle, name: r.title, collection: r.product_type || r.vendor,
  vendor: r.vendor, tags: r.tags || [], size: r.size, colour: r.colour, finish: r.finish, specs: r.specs || {}, kind: r.kind, variants: r.variants || [], sku: r.sku,
  price: r.price_label, stock: r.inventory, availability: r.availability, desc: r.description, url: r.url, onlineStore: r.online_store,
  shopifyImage: r.shopify_image_url, updatedAt: r.shopify_updated_at, archived: !r.active });

// ── Loading and live updates ──
async function all(q) { const out = []; for (let from = 0; ; from += 1000) { const { data, error } = await q().range(from, from + 999); if (error) throw error; out.push(...data); if (data.length < 1000) return out; } }
const LOADERS = {
  brands: async () => { const { data } = await SB.from("brands").select("id,guidelines"); const g = {}; (data || []).forEach((b) => g[b.id] = b.guidelines || {}); S.guidelines = g; },
  content_items: async () => { S.items = (await all(() => SB.from("content_items").select("*").order("id"))).map(toItem); },
  approvals: async () => { S.approvals = (await all(() => SB.from("approvals").select("*").order("approved_at"))).map(toApproval); },
  audit_log: async () => { const { data } = await SB.from("audit_log").select("*").order("id", { ascending: false }).limit(150); S.audit = (data || []).map(toAudit); },
  campaigns: async () => { const { data } = await SB.from("campaigns").select("*"); S.campaigns = (data || []).map(toCampaign); },
  settings: async () => { const { data } = await SB.from("settings").select("paused").maybeSingle(); S.settings = { paused: !!data?.paused }; },
  assets: async () => {
    const { data } = await SB.from("assets").select("*").order("created_at", { ascending: false });
    const rows = data || [], urls = {};
    if (rows.length) { const { data: signed } = await SB.storage.from("media").createSignedUrls(rows.map((r) => r.storage_path), 3600); (signed || []).forEach((s) => urls[s.path] = s.signedUrl); }
    S.media = rows.map((r) => ({ id: r.id, brand: r.brand_id, name: r.file_name, approved: r.approved, productId: r.product_id || "", url: urls[r.storage_path] || "", storagePath: r.storage_path, uploadedAt: r.created_at }));
  },
  shopify_connections: async () => {
    const { data: conns } = await SB.from("shopify_connections").select("*");
    const stores = {}, docs = [], inactive = [];
    for (const c of conns || []) {
      const key = normDomain(c.public_domain || c.shop_domain);
      const rows = await all(() => SB.from("products").select("*").eq("brand_id", c.brand_id).order("id"));
      const active = rows.filter((r) => r.active).map(toProduct);
      inactive.push(...rows.filter((r) => !r.active).map(toProduct));
      stores[c.brand_id] = { id: c.brand_id, key, name: c.shop_name || c.shop_domain, domain: c.public_domain, count: c.product_count ?? active.length,
        tiles: active.filter((p) => p.kind === "tile").length, lastSyncAt: c.last_sync_at, partial: false, status: c.status, lastError: c.last_error };
      docs.push({ id: c.brand_id + "-000", brand: c.brand_id, storeKey: key, items: active });
    }
    S.stores = stores; S.catalogDocs = docs; S.products = inactive; S.catVer++;
  },
};
const timers = {};
function refresh(table) { clearTimeout(timers[table]); timers[table] = setTimeout(async () => { try { await LOADERS[table]?.(); queueRender(); } catch (e) { console.warn(e); } }, 250); }

async function init() {
  route(); render();
  if (!SB) { startLocal(); return; }
  S.me = BOOT.user?.id || null; S.myName = String(BOOT.user?.name || "").split(" ")[0];
  const mine = Object.keys(BOOT.roles || {});
  if (mine.length && !mine.includes(S.brand)) S.brand = mine[0];
  S.mcp = { standalone: true }; S.assets = { standalone: true }; S.sample = makeSample();
  INTEGRATIONS.splice(INTEGRATIONS.findIndex((r) => r[0] === "Supabase"), 1);
  const later = INTEGRATIONS.find((r) => r[0] === "Later"); if (later) { later[1] = "Scheduling: manual hand-off (Later has no public scheduling API)"; later[2] = "Manual"; }
  S.mode = "connecting"; render();
  try { await LOADERS.brands(); await Promise.all(Object.keys(LOADERS).filter((k) => k !== "brands").map((k) => LOADERS[k]())); S.mode = "live"; }
  catch (e) { console.error(e); S.mode = "slow"; }
  render();
  const ch = SB.channel("studio-live");
  ["content_items", "approvals", "audit_log", "campaigns", "assets", "settings", "shopify_connections", "brands", "ugc_items", "instagram_connections"].forEach((t) =>
    ch.on("postgres_changes", { event: "*", schema: "public", table: t }, () => refresh(t)));
  ch.subscribe();
  setInterval(() => refresh("assets"), 45 * 60e3); // signed image links last an hour
}
function subscribe() {}
function foldAuditQueue() {}

// ── Writes (the database decides what is allowed) ──
async function put(col, id, data) {
  let res = { error: null }, table = null;
  if (col === "content") {
    table = "content_items";
    const row = fromItem({ ...data, id });
    res = await SB.from("content_items").update(row).eq("id", id).select("id");
    if (!res.error && !(res.data || []).length) res = await SB.from("content_items").insert({ ...row, id });
  } else if (col === "campaigns") {
    table = "campaigns";
    const row = fromCampaign({ ...data, id });
    res = await SB.from("campaigns").update(row).eq("id", id).select("id");
    if (!res.error && !(res.data || []).length) res = await SB.from("campaigns").insert({ ...row, id });
  } else if (col === "media") { table = "assets"; res = await SB.from("assets").update({ approved: !!data.approved, product_id: data.productId || null }).eq("id", id); }
  else if (col === "guidelines") { table = "brands"; res = await SB.from("brands").update({ guidelines: { ...(S.guidelines[id] || {}), ...data } }).eq("id", id); }
  else if (col === "settings") { table = "settings"; res = await SB.rpc("set_paused", { p_paused: !!data.paused }); }
  else return; // approvals, audit, products and store links are written only by the server
  if (res.error) { toast(sbMsg(res.error), "error"); throw res.error; }
  refresh(table);
}
async function remove(col, id) {
  let res = { error: null }, table = null;
  if (col === "content") { table = "content_items"; res = await SB.from("content_items").delete().eq("id", id); }
  else if (col === "campaigns") { table = "campaigns"; res = await SB.from("campaigns").delete().eq("id", id); }
  else if (col === "media") {
    table = "assets"; const m = mediaById(id);
    res = await SB.from("assets").delete().eq("id", id);
    if (!res.error && m?.storagePath) await SB.storage.from("media").remove([m.storagePath]);
  } else return;
  if (res.error) { toast(sbMsg(res.error), "error"); throw res.error; }
  refresh(table);
}
async function writeAudit(entry) {
  if (!LOGGED_BY_CLIENT.includes(entry.action)) return; // everything else is logged by the database itself
  await SB.rpc("log_event", { p_brand: entry.brand || S.brand, p_action: entry.action, p_detail: entry.detail || entry.title || "", p_content: entry.contentId || null });
}

// ── Approval workflow: database functions only ──
async function rpcAction(fn, args, ok) {
  const { error } = await SB.rpc(fn, args);
  if (error) { toast(sbMsg(error), "error"); return false; }
  if (ok) toast(ok); refresh("content_items"); refresh("approvals"); return true;
}
async function approve(id) {
  const it = S.items.find((i) => i.id === id); if (!it) return;
  if (!S.canApprove) return toast("Only Approvers can approve content.", "error");
  if (qcBlocked(it)) return toast("Fix the quality check errors before approving.", "error");
  await rpcAction("approve_content", { p_content: id, p_client_fingerprint: fingerprint(it) }, "Approved. This exact version is now locked.");
}
async function requestChanges(id) {
  const note = await ask({ title: "Request changes", body: "Tell the writer what to change. It goes back to Changes requested.", input: true, placeholder: "For example: lead with the outdoor use and shorten the caption.", confirm: "Request changes" });
  if (note === false) return; await rpcAction("request_changes", { p_content: id, p_note: note }, "Changes requested.");
}
async function reject(id) {
  const note = await ask({ title: "Reject this post?", body: "It's removed from the queue and calendar. You can find it again under Archived in the calendar's list view.", input: true, placeholder: "Reason (optional)", confirm: "Reject", danger: true });
  if (note === false) return; await rpcAction("reject_content", { p_content: id, p_note: note }, "Rejected and archived.");
}
async function markScheduled(id) {
  const it = S.items.find((i) => i.id === id); if (!it || it.status !== "Approved") return;
  const ok = await ask({ title: "Scheduled in Later?", body: `Confirm you've scheduled this exact approved version in Later for ${fmtD(it.scheduledAt)} at ${fmtT(it.scheduledAt)}. Nothing is sent from here.`, confirm: "Yes, it's scheduled" });
  if (ok) await rpcAction("mark_scheduled_manual", { p_content: id }, "Marked as scheduled.");
}
async function markPublished(id) {
  const url = await ask({ title: "Mark as published?", body: "Only do this once the post is live. Paste the post's link if you have it.", input: true, placeholder: "https://www.instagram.com/p/…", confirm: "Mark as published" });
  if (url !== false) await rpcAction("mark_published_manual", { p_content: id, p_post_url: url || null }, "Marked as published.");
}
async function markFailed(id) {
  const note = await ask({ title: "Mark as failed", body: "Record what went wrong so it can be retried.", input: true, placeholder: "For example: Later rejected the video format.", confirm: "Mark as failed", danger: true });
  if (note !== false) await rpcAction("mark_failed", { p_content: id, p_reason: note || "Failed" });
}
async function retry(id) { await rpcAction("retry_content", { p_content: id }, "Back in the workflow."); }

// ── AI (runs on the server with the studio's Anthropic key) ──
function makeSample() {
  const f = async (input, opts = {}) => {
    const prompt = typeof input === "string" ? input : input.map((m) => m.content).join("\n\n");
    const r = await api("/api/ai/generate", { brand: S.brand, mode: "text", prompt });
    opts.onText?.({ text: r.text, delta: r.text }); return { text: r.text, truncated: false };
  };
  f.json = async (prompt) => (await api("/api/ai/generate", { brand: S.brand, mode: "json", prompt })).data;
  return f;
}
async function pollJob(id, onTick, maxMs = 15 * 60e3) {
  const t0 = Date.now(); let job = null;
  while (Date.now() - t0 < maxMs) {
    await new Promise((r) => setTimeout(r, 2500));
    job = await api("/api/jobs/" + id).catch(() => job);
    if (job && (job.status === "succeeded" || job.status === "dead")) return job;
    onTick?.(job);
  }
  return job;
}
async function sendChat(text) {
  text = (text || "").trim(); if (!text || S.chatBusy) return;
  const brand = S.brand, turns = S.chat[brand];
  turns.push({ role: "user", content: text });
  const turn = { role: "assistant", content: "", pending: true, created: [], tool: "Queued" }; turns.push(turn);
  S.chatBusy = true; render();
  try {
    const { jobId } = await api("/api/ai/chat", { brand, message: text });
    const job = await pollJob(jobId, (j) => { turn.tool = j?.status === "running" ? "Planning and checking drafts against Shopify data…" : "Waiting to start…"; updateTurn(); });
    if (job?.status === "succeeded") { turn.content = job.result?.text || "Done."; turn.created = job.result?.createdIds || []; }
    else turn.error = job?.last_error ? "The planner stopped: " + job.last_error : "Still working. Drafts will appear in the calendar when it finishes.";
  } catch (e) { turn.error = e.message; }
  finally { turn.pending = false; S.chatBusy = false; refresh("content_items"); render(); }
}
async function loadChat(b) {
  if (S.chatLoaded[b] || !SB) return; S.chatLoaded[b] = true;
  const { data } = await SB.from("chat_messages").select("role,content,created_ids").eq("brand_id", b).order("id").limit(80);
  if (data?.length && !S.chat[b].length) { S.chat[b] = data.map((m) => ({ role: m.role, content: m.content, created: m.created_ids || [] })); queueRender(); }
}
async function saveChat() {}
A.clearChat = async () => { S.chat[S.brand] = []; render(); if (SB) await SB.from("chat_messages").delete().eq("brand_id", S.brand); };

// ── Shopify (server-side app connection per brand) ──
async function checkConnection() {
  const b = S.brand; S.sync = { busy: true, brand: b, msg: "Checking the store connection…" }; render();
  try { const { connection: c } = await api(`/api/shopify/${b}/sync`);
    S.sync = { busy: false, brand: b, msg: c ? `Connected to ${c.shop_name || c.shop_domain} (${c.shop_domain}). ${c.last_sync_at ? "Last import " + ago(c.last_sync_at) + "." : "Not imported yet."}${c.last_error ? " Last error: " + c.last_error : ""}` : `${guide(b).short} has no Shopify store connected yet. An administrator adds its Shopify app credentials to the server settings.`, err: !c };
  } catch (e) { S.sync = { busy: false, brand: b, msg: e.message, err: true }; }
  render();
}
async function importShopify() {
  const b = S.brand; if (!S.canApprove) return toast("Only Approvers can import products.", "error");
  S.sync = { busy: true, brand: b, msg: "Import queued…" }; render();
  try {
    const { jobId } = await api(`/api/shopify/${b}/sync`, {});
    const job = await pollJob(jobId, (j) => { const el = $("#syncMsg"); if (el) el.textContent = j?.status === "running" ? "Importing products from Shopify…" : "Import queued…"; }, 10 * 60e3);
    S.sync = job?.status === "succeeded" ? { busy: false, brand: b, msg: `Imported ${job.result.count.toLocaleString()} products (${job.result.tiles.toLocaleString()} tiles)${job.result.deactivated ? `; ${job.result.deactivated} no longer in Shopify were marked inactive` : ""}.` }
      : { busy: false, brand: b, msg: job?.last_error ? "Import failed: " + job.last_error : "The import is still running. Products will appear when it finishes.", err: !!job?.last_error };
  } catch (e) { S.sync = { busy: false, brand: b, msg: e.message, err: true }; }
  refresh("shopify_connections"); render();
}
async function unlinkStore() { toast("Store connections are managed by an administrator in the server settings.", "error"); }
function shopPanel() {
  const b = S.brand, g = guide(b), s = S.stores[b], sy = S.sync && S.sync.brand === b ? S.sync : null;
  const status = s ? `<b>${esc(g.short)} is connected to ${esc(s.name)}</b> (${esc(s.key)}). ${s.lastSyncAt ? `${Number(s.count || 0).toLocaleString()} products, ${Number(s.tiles || 0).toLocaleString()} of them tiles, last imported ${ago(s.lastSyncAt)}.` : "No import yet."} Shopify is the source of truth; products refresh daily and whenever they change in Shopify.`
    : `<b>${esc(g.short)} has no Shopify store connected.</b> An administrator adds this brand's own Shopify app credentials to the server settings; each brand only ever imports from its own store.`;
  return `<section class="panel" style="margin-bottom:18px"><div class="row" style="justify-content:space-between;align-items:flex-start"><p style="margin:0;max-width:72ch">${status}</p>
  <div class="row"><button class="btn sm" data-a="shopCheck" ${sy?.busy ? "disabled" : ""}>Check connection</button><button class="btn sm primary" data-a="shopImport" ${sy?.busy || !S.canApprove ? "disabled" : ""}>Import latest from Shopify</button></div></div>
  ${sy ? `<p id="syncMsg" class="small" style="margin:10px 0 0;${sy.err ? "color:var(--s-failed)" : ""}" role="status">${esc(sy.msg)}</p>` : ""}
  ${!S.canApprove ? `<p class="small muted" style="margin:10px 0 0">Only Approvers can import.</p>` : ""}</section>`;
}

// ── Media uploads to private storage ──
async function handleFiles(files, ctx, pid = "") {
  for (const f of files) {
    if (f.size > 20 * 1024 * 1024) { toast(`${f.name} is over 20 MB.`, "error"); continue; }
    const safe = f.name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-80);
    const path = `${S.brand}/${crypto.randomUUID()}-${safe}`;
    const up = await SB.storage.from("media").upload(path, f, { contentType: f.type, upsert: false });
    if (up.error) { toast(`Couldn't upload ${f.name}: ${sbMsg(up.error)}`, "error"); continue; }
    const productId = pid && prod(pid)?.brand === S.brand ? pid : null;
    const { data, error } = await SB.from("assets").insert({ brand_id: S.brand, storage_path: path, file_name: f.name, content_type: f.type, product_id: productId }).select("id").single();
    if (error) { toast(sbMsg(error), "error"); await SB.storage.from("media").remove([path]); continue; }
    writeAudit({ action: "Image uploaded", brand: S.brand, detail: f.name });
    if (ctx === "studio" && S.edit) S.edit.mediaIds = [...(S.edit.mediaIds || []), data.id];
  }
  await LOADERS.assets(); toast(ctx === "media" ? "Uploaded." : "Uploaded. An Approver must approve it before it can appear in an approved post."); render();
}

// ── Settings: database status ──
function dbStatus() {
  const live = S.mode === "live", real = S.items.filter((i) => !i.demo && !i.archived);
  const row = (k, v) => `<tr><td class="muted" style="width:42%">${k}</td><td>${v}</td></tr>`;
  return `<div class="row" style="gap:8px;margin-bottom:10px">${live ? pill("Approved").replace("Approved", "Connected") : pill("Failed").replace("Failed", esc(modeLabel()))}</div>
  <table><tbody>${row("Storage", live ? "Supabase (PostgreSQL), hosted for this studio. Live updates across devices." : "Not connected.")}
  ${row("Sign-in and permissions", "Supabase Auth, invite-only. Viewer, Contributor, Approver and Admin roles per brand, enforced inside the database.")}
  ${row("Posts", `${real.length}`)}${row("Approval records", `${S.approvals.length} (immutable)`)}
  ${row("Products", Object.values(BRANDS).map((br) => `${br.short}: ${hasCatalog(br.id) ? catalog().map[br.id].length + " from Shopify" : "not connected"}`).join(" · "))}
  ${row("Activity log", "Append-only, written by the database, tamper-evident hash chain")}</tbody></table>`;
}
