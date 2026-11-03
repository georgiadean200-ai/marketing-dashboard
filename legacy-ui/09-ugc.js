
/* ═════════ UGC Discovery ═════════
   Creator content that tags or mentions the brand on Instagram, plus posts imported from Later by hand.
   Uses only the studio's existing components and styles. Permission rules are enforced by the database. */
const PERMS = ["Permission not requested", "Permission requested", "Permission granted", "Permission declined"];
const PERM_CLASS = { "Permission not requested": "st-idea", "Permission requested": "st-needs-review", "Permission granted": "st-approved", "Permission declined": "st-failed" };
const SCOPES = [["organic_social", "Instagram and Facebook feed"], ["stories", "Stories"], ["paid_ads", "Paid ads"], ["website", "Website"], ["email", "Email"], ["print", "Print"]];
const SOURCE_LABEL = { instagram_tag: "Tagged", instagram_mention: "Mention", later_import: "From Later", manual: "Added by hand" };
const OPPS = ["Monday Inspiration", "Save This Space", "Customer Projects", "Builder and Designer Features", "Before and After", "Product Features", "Instagram Stories"];
S.ugc = []; S.igConn = {}; S.ugcF = { view: "open", perm: "", source: "", opp: "", q: "" }; S.ugcMsg = null; S.ugcBusy = "";
["Builder and Designer Features", "Before and After"].forEach((s) => { if (!SERIES.includes(s)) SERIES.push(s); });

// Sidebar entry, title and icon
(() => { const create = NAV.find((g) => g[0] === "Create"); const i = create[1].findIndex((x) => x[0] === "media"); create[1].splice(i + 1, 0, ["ugc", "UGC Discovery"]); })();
TITLES.ugc = "UGC Discovery";
IC.ugc = '<rect x="3" y="6" width="18" height="14" rx="2"/><circle cx="12" cy="13" r="3.5"/><path d="M8 6l1.5-2h5L16 6"/>';

// Data
LOADERS.ugc_items = async () => {
  const { data } = await SB.from("ugc_items").select("*").order("relevance_score", { ascending: false }).limit(1000);
  S.ugc = data || [];
};
LOADERS.instagram_connections = async () => {
  const { data } = await SB.from("instagram_connections").select("*"); const o = {}; (data || []).forEach((c) => o[c.brand_id] = c); S.igConn = o;
};

// Posts that use creator content show the permission check in Quality check (and approval is refused in the database).
function qc(it) {
  const out = __original_qc(it);
  const u = it.ugcId && S.ugc.find((x) => x.id === it.ugcId);
  if (it.ugcId) {
    const ok = u && u.permission_status === "Permission granted" && (u.usage_scope || []).includes("organic_social") && (!u.usage_expires_on || u.usage_expires_on >= ymd(new Date()));
    if (!ok) { out.unshift({ l: "error", m: `Uses @${u?.creator_handle || "a creator"}'s post without current permission for social use. Record their permission in UGC Discovery.` }); const i = out.findIndex((o) => o.l === "ok"); if (i >= 0) out.splice(i, 1); }
  }
  return out;
}

const ugcOpen = (u) => ["new", "shortlisted", "recommended"].includes(u.status) && !u.duplicate_of;
const permPill = (s) => `<span class="pill ${PERM_CLASS[s] || "st-idea"}"><i></i>${esc(s)}</span>`;
function ugcThumb(u) {
  const fallback = `<div class="sw nophoto">Preview unavailable<br>open on Instagram</div>`;
  if (!u.preview_url) return fallback;
  return `<img class="sw" src="${esc(u.preview_url)}" alt="Post by @${esc(u.creator_handle)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.outerHTML='<div class=&quot;sw nophoto&quot;>Preview expired<br>check for new content</div>'">`;
}
function ugcCard(u) {
  const s = u.suggestion || null, granted = u.permission_status === "Permission granted" && (u.usage_scope || []).includes("organic_social");
  const prods = (s?.fit ? s.productIds : null) || u.product_matches || [];
  const onCal = S.items.find((i) => i.ugcId === u.id && !i.archived);
  const cap = String(u.caption || "");
  return `<article class="pcard">${ugcThumb(u)}<div class="pb">
  <div class="row" style="justify-content:space-between"><a href="${esc(u.permalink)}" target="_blank" rel="noopener" style="font-weight:500;color:var(--ink)">@${esc(u.creator_handle || "unknown")}</a>
   <span class="row" style="gap:4px">${(u.sources || []).map((x) => `<span class="tag">${esc(SOURCE_LABEL[x] || x)}</span>`).join("")}</span></div>
  <span class="small muted">${u.posted_at ? new Date(u.posted_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "Date unknown"} · ${esc(u.platform)}${u.media_type ? " · " + esc(u.media_type.replace("_ALBUM", "").toLowerCase()) : ""}</span>
  ${cap ? `<p class="small" style="margin:0;white-space:pre-wrap">${esc(cap.length > 240 ? cap.slice(0, 240) + "…" : cap)}</p>` : `<p class="small faint" style="margin:0">No caption on file.</p>`}
  <div class="row" style="gap:6px">${u.relevance_score != null ? `<span class="flag" title="${esc((u.relevance_reasons || []).join(" · "))}">Relevance ${u.relevance_score}</span>` : ""}${permPill(u.permission_status)}</div>
  ${(u.relevance_reasons || []).length ? `<span class="small faint">${esc(u.relevance_reasons.slice(0, 3).join(" · "))}</span>` : ""}
  ${prods.length ? `<div class="small"><span class="muted">Suggested products (confirm):</span> ${prods.map((id) => prod(id)).filter(Boolean).map((p) => `<span class="tag">${esc(p.name)}</span>`).join(" ")}</div>` : ""}
  ${s ? (s.fit ? `<div class="notice lime" style="margin:4px 0 0;flex-direction:column;gap:6px"><span><b>${esc(s.opportunity)}</b> · ${esc(fmtD(s.suggestedDate + "T18:00"))}${s.strength ? ` · ${"●".repeat(s.strength)}${"○".repeat(5 - s.strength)}` : ""}</span><span class="small">${esc(s.why)}</span>${s.caption ? `<span class="small" style="white-space:pre-wrap;color:var(--ink)">${esc(s.caption)}\n\n${esc(s.credit || "")}</span>` : `<span class="small" style="color:var(--s-failed)">Caption held back by fact checks: ${esc((s.problems || []).join("; "))}</span>`}</div>`
    : `<span class="small muted">Not recommended: ${esc(s.why)}</span>`) : ""}
  ${u.duplicate_of ? `<span class="small faint">Duplicate of an earlier post; hidden from recommendations.</span>` : ""}
  <div class="row" style="margin-top:auto;padding-top:8px;gap:6px">
   <button class="btn sm" data-a="ugcPerm" data-id="${u.id}">Permission…</button>
   <button class="btn sm" data-a="ugcGen" data-id="${u.id}" ${S.ugcBusy ? "disabled" : ""}>${s?.caption ? "Regenerate caption" : "Generate caption"}</button>
   ${onCal ? `<button class="btn sm" data-a="open" data-id="${onCal.id}">Open draft</button>` : `<button class="btn sm primary" data-a="ugcDraft" data-id="${u.id}" ${s?.fit && s.caption ? "" : "disabled title='Generate a caption first'"}>Add to calendar</button>`}
   ${u.asset_id ? `<span class="tag">Saved to library</span>` : `<button class="btn sm" data-a="ugcSave" data-id="${u.id}" ${granted && u.preview_url ? "" : `disabled title="${granted ? "No downloadable media" : "Needs the creator's permission first"}"`}>Save to Content Library</button>`}
   ${ugcOpen(u) ? `<button class="btn sm ghost" data-a="ugcDismiss" data-id="${u.id}">Dismiss</button>` : `<button class="btn sm ghost" data-a="ugcRestore" data-id="${u.id}">Restore</button>`}
  </div></div></article>`;
}
function pageUgc() {
  const b = S.brand, g = guide(b), conn = S.igConn[b], f = S.ugcF;
  const mine = S.ugc.filter((u) => u.brand_id === b);
  const q = f.q.toLowerCase();
  const list = mine.filter((u) => (f.view === "open" ? ugcOpen(u) : f.view === "all" ? true : f.view === "recommended" ? u.suggestion?.fit && ugcOpen(u) : u.status === f.view)
    && (!f.perm || u.permission_status === f.perm) && (!f.source || (u.sources || []).includes(f.source)) && (!f.opp || u.suggestion?.opportunity === f.opp)
    && (!q || `${u.creator_handle} ${u.caption}`.toLowerCase().includes(q)));
  const top = mine.filter((u) => u.suggestion?.fit && ugcOpen(u) && !S.items.some((i) => i.ugcId === u.id))
    .sort((x, y) => (y.suggestion.strength || 0) - (x.suggestion.strength || 0) || (y.relevance_score || 0) - (x.relevance_score || 0)).slice(0, 6);
  const row = (name, status, detail) => `<tr><td><b style="font-weight:500;color:var(--ink)">${name}</b></td><td>${status}</td><td class="small muted">${detail}</td></tr>`;
  const sel = (k, opts, ph) => `<select data-uf="${k}" style="width:auto" aria-label="${ph}"><option value="">${ph}</option>${opts.map(([v, l]) => `<option value="${esc(v)}"${f[k] === v ? " selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
  return `<div class="row" style="justify-content:space-between;margin-bottom:18px"><p class="muted" style="margin:0;max-width:72ch">Posts where customers, designers, builders and creators feature ${esc(g.name)}. Previews come from Instagram for review and aren't stored. Nothing is downloaded or shared until the creator's permission is recorded.</p>
  <div class="row"><button class="btn" data-a="ugcImport">Import from Later</button><button class="btn" data-a="ugcRecommend" ${S.ugcBusy ? "disabled" : ""}>${icon("assistant", 16)} Recommend opportunities</button><button class="btn primary" data-a="ugcDiscover" ${S.ugcBusy || !S.canApprove || !conn ? "disabled" : ""}>Check for new content</button></div></div>
  ${S.ugcMsg && S.ugcMsg.brand === b ? `<p id="ugcMsg" class="small" role="status" style="margin:-6px 0 14px;${S.ugcMsg.err ? "color:var(--s-failed)" : ""}">${esc(S.ugcMsg.msg)}</p>` : ""}
  <section class="panel scrollx" style="padding:0;margin-bottom:22px"><table><thead><tr><th>Source</th><th>Status</th><th>How it works</th></tr></thead><tbody>
   ${row("Instagram tags", conn ? `<span class="tag">Connected · @${esc(conn.username || "")}</span>` : `<span class="tag">Not connected</span>`, conn ? `Checked ${conn.last_tags_sync_at ? ago(conn.last_tags_sync_at) : "not yet"}; weekly on Mondays.` : `Add ${esc(g.short)}'s Instagram account in the server settings (docs/UGC.md).`)}
   ${row("Instagram caption mentions", conn ? `<span class="tag">${conn.last_mention_at ? "Receiving" : "Waiting for the first"}</span>` : `<span class="tag">Not connected</span>`, "Sent by Instagram as they happen. Earlier mentions can't be fetched.")}
   ${row("Later Tags, Mentions and Media Library", `<span class="tag">Manual import</span>`, "Later has no API for these. Copy post links from Later and use Import from Later.")}
   ${row("Story mentions", `<span class="tag">Not available</span>`, "Instagram's API doesn't provide Story mentions.")}</tbody></table></section>
  ${top.length ? `<section style="margin-bottom:26px"><div class="block-head"><h2>Top opportunities</h2><span class="small muted">Recommended by the AI, not yet on the calendar</span></div><div class="pgrid">${top.map(ugcCard).join("")}</div></section>` : ""}
  <div class="cal-bar"><div class="seg" role="tablist">${[["open", "To review"], ["recommended", "Recommended"], ["used", "Used"], ["dismissed", "Dismissed"], ["all", "All"]].map(([v, l]) => `<button role="tab" aria-selected="${f.view === v}" class="${f.view === v ? "on" : ""}" data-a="ugcView" data-v="${v}">${l}</button>`).join("")}</div>
   <input type="search" id="ugcQ" value="${esc(f.q)}" placeholder="Search handle or caption" style="max-width:240px" aria-label="Search">
   ${sel("perm", PERMS.map((p) => [p, p]), "Any permission")}${sel("source", Object.entries(SOURCE_LABEL), "Any source")}${sel("opp", OPPS.map((o) => [o, o]), "Any opportunity")}
   <span style="flex:1"></span><span class="small muted">${list.length} of ${mine.length}</span></div>
  ${list.length ? `<div class="pgrid">${list.slice(0, 120).map(ugcCard).join("")}</div>` : `<div class="panel empty"><h3>${mine.length ? "Nothing matches" : "No creator content yet"}</h3><p>${conn ? "Check for new content, or import posts you've collected in Later." : `Connect ${esc(g.short)}'s Instagram account, or import posts you've collected in Later.`}</p></div>`}`;
}
PAGES.ugc = pageUgc;

// Permission dialog: status, evidence, what they agreed to, expiry and credit
function permissionDialog(u) {
  return new Promise((res) => {
    const m = $("#modal"), prev = document.activeElement, g = guide(u.brand_id);
    const credit = u.attribution || `📷 @${u.creator_handle}`;
    const request = `Hi @${u.creator_handle}, we love how our tiles look in your space! Would you be happy for ${g.name} to share this post on our Instagram, with credit to you as ${credit}? Just reply "yes" here and we'll take care of the rest. Thank you!`;
    m.innerHTML = `<div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="pt" style="width:min(560px,100%)"><h3 id="pt">Creator permission · @${esc(u.creator_handle)}</h3>
     <div class="formstack" style="margin-top:14px;gap:12px">
      <label class="field"><span>Status</span><select id="pm-status">${PERMS.map((p) => `<option${p === u.permission_status ? " selected" : ""}>${esc(p)}</option>`).join("")}</select></label>
      <label class="field"><span>How you asked or heard back (e.g. Instagram DM, comment, email)</span><input type="text" id="pm-via" value="${esc(u.permission_requested_via || "")}"></label>
      <label class="field"><span>Evidence: paste their reply, with date, or a link to it</span><textarea id="pm-evidence" rows="3">${esc(u.permission_evidence || "")}</textarea></label>
      <div class="field"><span>What they agreed to</span><div class="row" style="gap:12px">${SCOPES.map(([v, l]) => `<label class="row small" style="gap:6px"><input type="checkbox" class="pm-scope" value="${v}" ${(u.usage_scope || []).includes(v) ? "checked" : ""}> ${l}</label>`).join("")}</div></div>
      <div class="grid2"><label class="field"><span>Credit line</span><input type="text" id="pm-attr" value="${esc(credit)}"></label><label class="field"><span>Permission ends (optional)</span><input type="date" id="pm-exp" value="${esc(u.usage_expires_on || "")}"></label></div>
      <div class="field"><span class="sectionlabel">Message to send the creator <button class="link" type="button" id="pm-copy">Copy</button></span><p class="small" style="margin:0;background:var(--surface-2);padding:10px;border-radius:8px">${esc(request)}</p><span class="small faint">Send it yourself from Instagram; the studio doesn't message creators.</span></div>
      ${!S.canApprove ? `<p class="small muted" style="margin:0">You can record that permission was requested. An Approver records the creator's decision.</p>` : ""}
     </div><div class="modal-actions" style="margin-top:16px"><button class="btn ghost" data-m="0">Cancel</button><button class="btn primary" data-m="1">Save</button></div></div>`;
    m.hidden = false; $("#pm-status").focus();
    $("#pm-copy").onclick = async () => { try { await navigator.clipboard.writeText(request); toast("Message copied."); } catch { toast("Select the message and copy it."); } };
    const close = (v) => { m.hidden = true; m.innerHTML = ""; m.onclick = null; prev?.focus?.(); res(v); };
    m.onclick = (e) => { if (e.target === m) return close(null); const b = e.target.closest("[data-m]"); if (!b) return;
      if (b.dataset.m !== "1") return close(null);
      close({ permission_status: $("#pm-status").value, permission_requested_via: $("#pm-via").value.trim(), permission_evidence: $("#pm-evidence").value.trim(),
        usage_scope: [...document.querySelectorAll(".pm-scope:checked")].map((x) => x.value), attribution: $("#pm-attr").value.trim(), usage_expires_on: $("#pm-exp").value || null }); };
  });
}

// Actions
async function ugcJob(path, body, busyMsg) {
  const b = S.brand; S.ugcBusy = busyMsg; S.ugcMsg = { brand: b, msg: busyMsg }; render();
  try {
    const { jobId } = await api(path, body || {});
    const job = await pollJob(jobId, (j) => { const el = $("#ugcMsg"); if (el) el.textContent = j?.status === "running" ? busyMsg : "Queued…"; }, 10 * 60e3);
    if (job?.status === "succeeded") { const r = job.result || {};
      S.ugcMsg = { brand: b, msg: r.added != null ? `Found ${r.added} new post${r.added === 1 ? "" : "s"}${r.refreshed ? `, refreshed ${r.refreshed}` : ""}${r.duplicates ? `, skipped ${r.duplicates} duplicate${r.duplicates === 1 ? "" : "s"}` : ""}.`
        : `Reviewed ${r.reviewed}; ${r.recommended} recommended.` }; }
    else S.ugcMsg = { brand: b, msg: job?.last_error ? job.last_error : "Still working; results will appear here.", err: !!job?.last_error };
  } catch (e) { S.ugcMsg = { brand: b, msg: e.message, err: true }; }
  S.ugcBusy = ""; await LOADERS.ugc_items(); await LOADERS.instagram_connections(); render();
}
Object.assign(A, {
  ugcDiscover: () => ugcJob(`/api/ugc/${S.brand}/discover`, {}, "Checking Instagram for new tags and mentions…"),
  ugcRecommend: () => ugcJob(`/api/ugc/${S.brand}/recommend`, {}, "Reviewing posts and preparing recommendations…"),
  ugcGen: (d) => ugcJob(`/api/ugc/${S.brand}/recommend`, { ids: [d.id] }, "Writing a caption and matching products…"),
  ugcView: (d) => { S.ugcF.view = d.v; render(); },
  ugcPerm: async (d) => {
    const u = S.ugc.find((x) => x.id === d.id); if (!u) return;
    const v = await permissionDialog(u); if (!v) return;
    const { error } = await SB.from("ugc_items").update(v).eq("id", u.id);
    if (error) toast(sbMsg(error), "error"); else toast("Permission record saved.");
    await LOADERS.ugc_items(); render();
  },
  ugcDismiss: async (d) => { const { error } = await SB.from("ugc_items").update({ status: "dismissed" }).eq("id", d.id); if (error) toast(sbMsg(error), "error"); await LOADERS.ugc_items(); render(); },
  ugcRestore: async (d) => { const { error } = await SB.from("ugc_items").update({ status: "new" }).eq("id", d.id); if (error) toast(sbMsg(error), "error"); await LOADERS.ugc_items(); render(); },
  ugcSave: async (d) => {
    try { await api(`/api/ugc/item/${d.id}/save`, {}); toast("Saved to the media library. Approve the image there before it can go in an approved post."); }
    catch (e) { toast(e.message, "error"); }
    await LOADERS.ugc_items(); await LOADERS.assets(); render();
  },
  ugcDraft: async (d) => {
    try { const r = await api(`/api/ugc/item/${d.id}/draft`, {}); await LOADERS.content_items(); render();
      toast(r.already ? "Already on the calendar." : "Draft added to the calendar for review."); }
    catch (e) { toast(e.message, "error"); }
  },
  ugcImport: async () => {
    const text = await ask({ title: "Import from Later", body: "Paste Instagram post links (one per line; add @handle after a link if you know it), or a CSV with columns such as url, handle, caption, date. In Later, open Media › Tags or Mentions, open each post on Instagram and copy its link.", input: true, placeholder: "https://www.instagram.com/p/… @creator", confirm: "Import" });
    if (!text) return;
    try { const r = await api(`/api/ugc/${S.brand}/import`, { text });
      S.ugcMsg = { brand: S.brand, msg: `Imported ${r.added}${r.alreadyHad ? `; ${r.alreadyHad} already here` : ""}${r.errors?.length ? `; ${r.errors.length} line(s) skipped` : ""}.` }; }
    catch (e) { S.ugcMsg = { brand: S.brand, msg: e.message, err: true }; }
    await LOADERS.ugc_items(); render();
  },
});
document.addEventListener("change", (e) => { const k = e.target.dataset?.uf; if (!k) return; S.ugcF[k] = e.target.value; pendingRender = false; render(); });
document.addEventListener("input", (e) => {
  if (e.target.id !== "ugcQ") return; S.ugcF.q = e.target.value; clearTimeout(window._uq);
  window._uq = setTimeout(() => { render(); const q = $("#ugcQ"); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }, 200);
});
