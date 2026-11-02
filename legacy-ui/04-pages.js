
/* ───────── Routing ───────── */
const NAV=[["Plan",[["overview","Overview"],["assistant","AI marketing assistant"],["calendar","Content calendar"],["campaigns","Campaign planner"]]],
 ["Create",[["studio","Content studio"],["approvals","Approval queue"],["products","Product library"],["media","Media library"]]],
 ["Publish and measure",[["publishing","Scheduling and publishing"],["analytics","Analytics and ROI"]]],
 ["Workspace",[["brand","Brand guidelines"],["automations","Automations"],["integrations","Settings and integrations"]]]];
const TITLES=Object.fromEntries(NAV.flatMap(g=>g[1]));
function route(){const h=location.hash.slice(1);S.page=TITLES[h]?h:"overview"}
function go(p){S.navOpen=false;S.pop="";if(location.hash.slice(1)!==p)location.hash=p;else{render()}$("#main").scrollTop=0}
window.addEventListener("hashchange",()=>{route();render();$("#main").scrollTop=0;$("#view").focus({preventScroll:true})});

/* ───────── Chrome ───────── */
function renderChrome(){
 const items=brandItems(),rev=items.filter(i=>i.status==="Needs Review").length,chg=items.filter(i=>i.status==="Changes Requested").length;
 const counts={approvals:rev,studio:chg};
 $("#side").className="side"+(S.navCollapsed?" collapsed":"")+(S.navOpen?" open":"");
 $("#scrim").className="scrim"+(S.navOpen?" on":"");
 $("#side").innerHTML=`<div class="logo"><span class="mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span class="brandname">Marketing Studio<small>${esc(guide(S.brand).name)}</small></span></div>
 ${NAV.map(([g,list])=>`<div class="grp">${g}</div>${list.map(([id,label])=>`<button class="nav${S.page===id?" on":""}" data-a="go" data-p="${id}" title="${esc(label)}" ${S.page===id?'aria-current="page"':""}>${icon(id)}<span class="lbl">${esc(label)}</span>${counts[id]?`<span class="badge" aria-label="${counts[id]} waiting">${counts[id]}</span>`:""}</button>`).join("")}`).join("")}
 <div class="side-foot">${modeLabel()}</div>`;
 const g=guide(S.brand),notes=notifications();
 $("#top").innerHTML=`<button class="iconbtn menu-btn" data-a="openNav" aria-label="Open navigation">${icon("menu")}</button>
 <button class="iconbtn collapse-btn" data-a="collapse" aria-label="${S.navCollapsed?"Expand":"Collapse"} sidebar">${icon("side")}</button>
 <div class="title">${esc(TITLES[S.page])}</div>
 <div class="ws"><button class="wsbtn" data-a="pop" data-p="ws" aria-expanded="${S.pop==="ws"}" aria-haspopup="true"><i class="m">${g.short}</i><span class="mode-lbl">${esc(g.name)}</span>${icon("d",14)}</button>
  ${S.pop==="ws"?`<div class="pop" role="menu">${Object.values(BRANDS).map(b=>`<button class="opt" role="menuitemradio" aria-checked="${S.brand===b.id}" data-a="brand" data-b="${b.id}"><i class="m" style="width:22px;height:22px;border-radius:4px;background:var(--ink);color:var(--lime);display:grid;place-items:center;font-style:normal;font-size:9px;font-weight:600">${b.short}</i><span><b style="font-weight:500">${esc(b.name)}</b><br><span class="small muted">${brandItems(b.id).filter(i=>i.status==="Needs Review").length} waiting for review</span></span>${S.brand===b.id?`<span style="margin-left:auto">${icon("check",16)}</span>`:""}</button>`).join("")}</div>`:""}</div>
 <div class="ws"><button class="iconbtn" data-a="pop" data-p="bell" aria-label="Notifications" aria-expanded="${S.pop==="bell"}">${icon("bell")}${notes.count?`<span class="dotcount">${notes.count}</span>`:""}</button>
  ${S.pop==="bell"?`<div class="pop" role="dialog" aria-label="Notifications">${notes.html}</div>`:""}</div>
 <button class="btn primary" data-a="new">${icon("plus",16)}<span class="newpost-lbl">New post</span></button>`;
 $("#banners").innerHTML=(S.settings.paused?`<div class="banner">${icon("pause",16)}<span><b>Publishing is paused.</b> Nothing can be marked scheduled or published until you resume it in Settings.</span></div>`:"")
  +(S.mode==="local"?`<div class="banner soft">Preview mode: changes aren't saved here. Open the published artifact to save to the studio database.</div>`:"")
  +(S.mode==="slow"?`<div class="banner soft">The studio database is taking a while to respond. Your data will appear when it connects.</div>`:"")
  +(S.mode==="revoked"?`<div class="banner">Your access to this studio changed. Reload to continue.</div>`:"");
}
function modeLabel(){return S.mode==="live"?"Saved to the studio database":S.mode==="local"?"Preview mode, not saving":S.mode==="loading"||S.mode==="connecting"?"Connecting…":"Database unavailable"}
function notifications(){
 const items=brandItems(),rev=items.filter(i=>i.status==="Needs Review"),chg=items.filter(i=>i.status==="Changes Requested"),fail=items.filter(i=>i.status==="Failed");
 const recent=S.audit.filter(a=>a.brand===S.brand).slice(0,6);
 let html="";
 if(rev.length)html+=`<button class="opt" data-a="go" data-p="approvals"><span>${pill("Needs Review")}</span><span>${rev.length} waiting for your approval</span></button>`;
 if(chg.length)html+=`<button class="opt" data-a="go" data-p="studio"><span>${pill("Changes Requested")}</span><span>${chg.length} need edits</span></button>`;
 if(fail.length)html+=`<button class="opt" data-a="go" data-p="publishing"><span>${pill("Failed")}</span><span>${fail.length} failed to publish</span></button>`;
 if(!html)html=`<div class="note muted">You're all caught up.</div>`;
 html+=`<div class="grp">Recent activity</div>`+(recent.length?recent.map(a=>`<div class="note"><b style="font-weight:500">${esc(a.action)}</b> · ${esc(a.title)}<br><span class="small faint">${esc(who(a.actor,a.actorKind))}, ${ago(a.at)}</span></div>`).join(""):`<div class="note muted">No activity yet.</div>`);
 return{count:rev.length+chg.length+fail.length,html};
}

/* ───────── Overview ───────── */
function itemChip(i,drag=false){return`<button class="chip st-${sl(i.status)}" data-a="open" data-id="${i.id}" ${drag&&i.status!=="Published"?`draggable="true" data-drag="${i.id}"`:""} title="${esc(i.title||"Untitled")} · ${esc(i.status)}"><i class="dot"></i><span class="t">${fmtT(i.scheduledAt)}</span><span class="n">${esc(i.title||"Untitled")}</span></button>`}
function pageOverview(){
 const items=brandItems(),g=guide(S.brand);
 const rev=items.filter(i=>i.status==="Needs Review"),chg=items.filter(i=>i.status==="Changes Requested");
 const ws=startOfWeek(new Date()),today=ymd(new Date());
 const h=new Date().getHours(),part=h<12?"morning":h<17?"afternoon":"evening";
 const name=S.myName||"";
 const thisWeek=items.filter(i=>i.scheduledAt&&i.scheduledAt>=ymd(ws)&&i.scheduledAt<ymd(addDays(ws,7)));
 const ready=thisWeek.filter(i=>["Approved","Scheduled","Published"].includes(i.status)).length;
 const lede=rev.length?`${rev.length} ${rev.length===1?"post is":"posts are"} waiting for your approval. ${ready} of ${thisWeek.length} posts this week are approved or live.`:`Nothing is waiting for approval. ${ready} of ${thisWeek.length} posts this week are approved or live.`;
 const counts=STATUSES.map(s=>[s,items.filter(i=>i.status===s).length]);const total=items.length||1;
 const neg=products().filter(p=>p.kind!=="accessory"&&neglected(p)).slice(0,5);
 const acts=S.audit.filter(a=>a.brand===S.brand).slice(0,8);
 resolveNames(acts.map(a=>a.actor));
 return`<section class="hello"><div><h1 class="display">Good ${part}${name?", "+esc(name):""}</h1><p>${esc(lede)}</p></div>
 <div class="row">${rev.length?`<button class="btn lime" data-a="go" data-p="approvals">Review ${rev.length} ${rev.length===1?"post":"posts"}</button>`:""}<button class="btn" data-a="go" data-p="assistant">${icon("assistant",16)} Ask the assistant</button></div></section>
 ${chg.length?`<div class="notice" style="margin-top:20px"><span>${pill("Changes Requested")}</span><span>${chg.map(i=>`<button class="link" data-a="open" data-id="${i.id}">${esc(i.title)}</button>`).join(", ")} ${chg.length===1?"needs":"need"} edits before re-review.</span></div>`:""}
 <section class="block"><div class="block-head"><h2>This week</h2><button class="link" data-a="go" data-p="calendar">Open the calendar</button></div>
 <div class="scrollx"><div class="week">${[0,1,2,3,4,5,6].map(n=>{const d=addDays(ws,n),k=ymd(d),list=items.filter(i=>i.scheduledAt?.startsWith(k)).sort((a,b)=>a.scheduledAt.localeCompare(b.scheduledAt));const cad=g.cadence[d.getDay()];
  return`<div class="day${k===today?" today":""}"><div class="day-h"><span>${d.toLocaleDateString("en-AU",{weekday:"short"})}</span><b>${d.getDate()}</b></div>${cad?`<div class="cad">${esc(cad)}</div>`:""}${list.map(i=>itemChip(i)).join("")}${!list.length&&cad?`<button class="chip" data-a="newOn" data-d="${k}" style="background:none;border:1px dashed var(--line-strong);color:var(--muted)">${icon("plus",13)}<span class="n">Plan ${esc(cad)}</span></button>`:""}</div>`}).join("")}</div></div></section>
 <div class="two block">
  <section class="panel"><div class="block-head"><h2>Pipeline</h2><span class="small muted">${items.length} items</span></div>
   <div class="pipe" role="img" aria-label="Content by status">${counts.filter(c=>c[1]).map(([s,n])=>`<div class="st-${sl(s)}" style="flex:${n/total}" title="${s}: ${n}"></div>`).join("")}</div>
   <div class="legend">${counts.map(([s,n])=>`<button data-a="calStatus" data-s="${esc(s)}">${pill(s)}<b style="font-weight:500">${n}</b></button>`).join("")}</div></section>
  <section class="panel"><div class="block-head"><h2>Not featured in 30 days</h2><button class="link" data-a="go" data-p="products">Product library</button></div>
   ${neg.length?neg.map(p=>`<div class="prodrow">${pvis(p)}<div><b style="font-weight:500;color:var(--ink)">${esc(p.name)}</b><div class="small muted">${esc(p.collection)} · ${lastFeatured(p.id)?"last featured "+fmtD(lastFeatured(p.id)):"never featured"}</div></div><button class="btn sm" data-a="feature" data-pid="${p.id}">Feature</button></div>`).join(""):`<p class="muted">Every product has been featured in the last 30 days.</p>`}
   ${!hasCatalog(S.brand)?`<p class="small faint" style="margin:12px 0 0">Demo products until ${esc(guide(S.brand).short)}'s Shopify store is imported.</p>`:""}</section>
 </div>
 <section class="block panel"><div class="block-head"><h2>Recent activity</h2></div>
  ${acts.length?`<ul class="feed">${acts.map(a=>`<li><time>${ago(a.at)}</time><span><b style="font-weight:500;color:var(--ink)">${esc(a.action)}</b> · ${a.contentId&&S.items.find(i=>i.id===a.contentId)?`<button class="link" data-a="open" data-id="${a.contentId}">${esc(a.title)}</button>`:esc(a.title)}<span class="muted"> by ${esc(who(a.actor,a.actorKind))}</span>${a.detail?`<div class="small muted">${esc(a.detail)}</div>`:""}</span></li>`).join("")}</ul>`:`<p class="muted">Activity appears here as content moves through review.</p>`}
 </section>`;
}

/* ───────── Calendar ───────── */
function calFilter(list){const c=S.cal;return list.filter(i=>(!c.channel||i.channel===c.channel)&&(!c.series||i.series===c.series)&&(!c.status||i.status===c.status))}
function pageCalendar(){
 const c=S.cal,cur=c.cursor,g=guide(S.brand);
 const all=S.items.filter(i=>i.brand===S.brand&&(c.view==="list"&&c.archived?i.archived:!i.archived));
 const items=calFilter(all);
 let label="";if(c.view==="month")label=cur.toLocaleDateString("en-AU",{month:"long",year:"numeric"});else if(c.view==="week"){const ws=startOfWeek(cur);label=`${ws.toLocaleDateString("en-AU",{day:"numeric",month:"short"})} – ${addDays(ws,6).toLocaleDateString("en-AU",{day:"numeric",month:"short",year:"numeric"})}`}else label="All content";
 const opt=(arr,v,ph)=>`<option value="">${ph}</option>`+arr.map(x=>`<option${x===v?" selected":""}>${esc(x)}</option>`).join("");
 const bar=`<div class="cal-bar"><div class="seg" role="tablist">${["month","week","list"].map(v=>`<button role="tab" aria-selected="${c.view===v}" class="${c.view===v?"on":""}" data-a="calView" data-v="${v}">${v[0].toUpperCase()+v.slice(1)}</button>`).join("")}</div>
 ${c.view!=="list"?`<button class="iconbtn" data-a="calNav" data-n="-1" aria-label="Previous">${icon("l")}</button><button class="btn sm" data-a="calToday">Today</button><button class="iconbtn" data-a="calNav" data-n="1" aria-label="Next">${icon("r")}</button>`:""}
 <h2>${esc(label)}</h2><span style="flex:1"></span>
 <select data-cf="channel" aria-label="Filter by channel">${opt(CHANNELS,c.channel,"All channels")}</select>
 <select data-cf="series" aria-label="Filter by series">${opt(SERIES,c.series,"All series")}</select>
 <select data-cf="status" aria-label="Filter by status">${opt(STATUSES,c.status,"All statuses")}</select>
 ${c.view==="list"?`<label class="row small"><input type="checkbox" data-cf="archived" ${c.archived?"checked":""}> Archived</label>`:""}</div>`;
 const legend=`<div class="legend-row" aria-label="Status key">${STATUSES.map(pill).join("")}</div>`;
 const today=ymd(new Date());
 if(c.view==="month"){
  const first=new Date(cur.getFullYear(),cur.getMonth(),1),start=startOfWeek(first);
  const weeks=Math.ceil(((first.getDay()+6)%7+new Date(cur.getFullYear(),cur.getMonth()+1,0).getDate())/7);
  let cells="";for(let n=0;n<weeks*7;n++){const d=addDays(start,n),k=ymd(d),list=items.filter(i=>i.scheduledAt?.startsWith(k)).sort((a,b)=>a.scheduledAt.localeCompare(b.scheduledAt));const cad=g.cadence[d.getDay()];
   cells+=`<div class="cell${d.getMonth()!==cur.getMonth()?" out":""}${k===today?" today":""}" data-drop="${k}"><div class="num"><span>${d.getDate()}</span><button class="add" data-a="newOn" data-d="${k}" aria-label="Add post on ${d.toLocaleDateString("en-AU",{day:"numeric",month:"long"})}">${icon("plus",14)}</button></div>${cad&&!list.length?`<div class="cad">${esc(cad)}</div>`:""}${list.map(i=>itemChip(i,true)).join("")}</div>`}
  return bar+legend+`<div class="calgrid">${["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(d=>`<div class="calhead">${d}</div>`).join("")}${cells}</div><p class="small faint" style="margin-top:10px">Drag a post to another day to reschedule it. Moving an approved post sends it back for review.</p>`;
 }
 if(c.view==="week"){
  const ws=startOfWeek(cur);
  return bar+legend+`<div class="scrollx"><div class="wk">${[0,1,2,3,4,5,6].map(n=>{const d=addDays(ws,n),k=ymd(d),list=items.filter(i=>i.scheduledAt?.startsWith(k)).sort((a,b)=>a.scheduledAt.localeCompare(b.scheduledAt));const cad=g.cadence[d.getDay()];
   return`<div class="cell${k===today?" today":""}" data-drop="${k}"><div class="num"><span><b style="font-family:var(--head);font-weight:400;font-size:20px;color:var(--ink)">${d.getDate()}</b> ${d.toLocaleDateString("en-AU",{weekday:"short"})}</span><button class="add" data-a="newOn" data-d="${k}" aria-label="Add post">${icon("plus",14)}</button></div>${cad?`<div class="cad">${esc(cad)}</div>`:""}
   ${list.map(i=>{const p=prod((i.productIds||[])[0]),m=mediaById((i.mediaIds||[])[0]);return`<button class="card" data-a="open" data-id="${i.id}" ${i.status!=="Published"?`draggable="true" data-drag="${i.id}"`:""}>${m?`<img src="${esc(mediaUrl(m))}" alt="" style="width:100%;height:54px;object-fit:cover;border-radius:3px;margin-bottom:6px">`:p?pvis(p,"div"):""}${pill(i.status)}<b>${esc(i.title||"Untitled")}</b><span class="muted">${fmtT(i.scheduledAt)} · ${esc(i.channel)} ${esc(i.format)}</span></button>`}).join("")}</div>`}).join("")}</div></div>`;
 }
 const sorted=[...items].sort((a,b)=>(a.scheduledAt||"9").localeCompare(b.scheduledAt||"9"));
 return bar+(sorted.length?`<div class="panel scrollx" style="padding:0"><table><thead><tr><th>Date</th><th>Title</th><th>Series</th><th>Channel</th><th>Status</th><th>Publishing</th></tr></thead><tbody>${sorted.map(i=>`<tr class="clickable" data-a="open" data-id="${i.id}" tabindex="0"><td style="white-space:nowrap">${fmtD(i.scheduledAt)}<div class="small muted">${fmtT(i.scheduledAt)}</div></td><td><b style="font-weight:500;color:var(--ink)">${esc(i.title||"Untitled")}</b></td><td>${esc(i.series)}</td><td>${esc(i.channel)}<div class="small muted">${esc(i.format)}</div></td><td>${pill(i.status)}</td><td class="small muted">${esc(i.publishStatus||"")}</td></tr>`).join("")}</tbody></table></div>`:`<div class="panel empty"><h3>Nothing matches these filters</h3><p>Clear a filter or add a post.</p></div>`);
}

/* ───────── Approval queue ───────── */
function thumb(i){const m=mediaById((i.mediaIds||[])[0]),p=prod((i.productIds||[])[0]);return m?`<img src="${esc(mediaUrl(m))}" alt="">`:p?pvis(p):""}
function pageApprovals(){
 const items=brandItems(),drafts=items.filter(i=>i.status==="AI Draft").sort((a,b)=>(a.scheduledAt||"").localeCompare(b.scheduledAt||"")),wait=items.filter(i=>i.status==="Needs Review").sort((a,b)=>(a.scheduledAt||"").localeCompare(b.scheduledAt||"")),chg=items.filter(i=>i.status==="Changes Requested");
 const aps=S.approvals.filter(a=>a.brand===S.brand).sort((a,b)=>b.approvedAt.localeCompare(a.approvedAt));
 const t=S.queueTab;
 const tabs=`<div class="seg" role="tablist" style="margin-bottom:20px">${[["waiting",`Waiting (${wait.length})`],["drafts",`AI drafts (${drafts.length})`],["changes",`Changes requested (${chg.length})`],["versions",`Approved versions (${aps.length})`]].map(([k,l])=>`<button role="tab" aria-selected="${t===k}" class="${t===k?"on":""}" data-a="qtab" data-t="${k}">${l}</button>`).join("")}</div>`;
 const perm=S.canApprove?"":`<div class="notice"><span>${icon("lock",16)}</span><span>You can review and comment, but only Editors can approve. Ask the studio owner for Editor access.</span></div>`;
 if(t==="versions"){resolveNames(aps.map(a=>a.approvedBy));
  return tabs+`<div class="notice lime"><span>${icon("lock",16)}</span><span>Each approval stores the exact caption, assets, links and schedule that were approved, with a fingerprint. Publishing checks the live content against it; any change sends the post back to review.</span></div>`+(aps.length?`<div class="panel scrollx" style="padding:0"><table><thead><tr><th>Approved</th><th>Content</th><th>Fingerprint</th><th>Still matches?</th></tr></thead><tbody>${aps.map(a=>{const it=S.items.find(i=>i.id===a.contentId);const ok=it&&it.approvalId===a.id&&verified(it);return`<tr><td style="white-space:nowrap">${new Date(a.approvedAt).toLocaleString("en-AU",{day:"numeric",month:"short",hour:"numeric",minute:"2-digit"})}<div class="small muted">by ${esc(who(a.approvedBy))}</div></td><td>${it?`<button class="link" data-a="open" data-id="${it.id}">${esc(a.title)}</button>`:esc(a.title)}<div class="small muted">${esc(a.snapshot?.channel||"")} · ${fmtD(a.snapshot?.scheduledAt)} ${fmtT(a.snapshot?.scheduledAt)}</div></td><td><span class="fp">${esc(a.fingerprint)}</span></td><td>${ok?`<span class="pill st-approved"><i></i>Current version</span>`:`<span class="pill st-idea"><i></i>Superseded</span>`}</td></tr>`}).join("")}</tbody></table></div>`:`<div class="panel empty"><h3>No approvals yet</h3></div>`);}
 const list=t==="waiting"?wait:t==="drafts"?drafts:chg;
 const readyDrafts=drafts.filter(i=>!qcBlocked(i));
 const draftBar=t==="drafts"&&drafts.length?`<div class="notice"><span>AI drafts aren't in review yet. Read them, edit if needed, then send them to review. ${readyDrafts.length?`<button class="btn sm" data-a="submitAll" style="margin-left:8px">Send ${readyDrafts.length} that pass checks to review</button>`:""}</span></div>`:"";
 if(!list.length)return tabs+perm+`<div class="panel empty"><h3>${t==="waiting"?"Nothing waiting for approval":t==="drafts"?"No AI drafts":"No changes requested"}</h3><p>${t==="changes"?"Posts you send back for edits appear here.":"Ask the assistant to prepare next week's content, or submit a draft from the content studio."}</p>${t==="waiting"?`<button class="btn" data-a="go" data-p="assistant" style="margin-top:10px">Ask the assistant</button>`:""}</div>`;
 return tabs+perm+draftBar+list.map(i=>{const q=qc(i),errs=q.filter(x=>x.l==="error"),warns=q.filter(x=>x.l==="warn");const ps=(i.productIds||[]).map(prod).filter(Boolean);
  return`<article class="qcard"><div class="qthumb">${thumb(i)}</div><div style="min-width:0">
  <div class="row" style="justify-content:space-between"><h2>${esc(i.title||"Untitled")}</h2>${pill(i.status)}</div>
  <div class="qmeta"><span class="tag">${esc(i.channel)} ${esc(i.format)}</span><span class="tag">${esc(i.series)}</span><span>${fmtD(i.scheduledAt,{weekday:"long",day:"numeric",month:"long"})} at ${fmtT(i.scheduledAt)}</span>${i.createdBy==="ai"?`<span class="tag">AI drafted</span>`:""}</div>
  ${i.reviewNote&&t==="changes"?`<div class="notice"><span><b>Requested:</b> ${esc(i.reviewNote)}</span></div>`:""}
  <div class="qcap">${esc(i.caption||"No caption yet.")}${(i.hashtags||[]).length?`\n\n<span class="muted">${esc(i.hashtags.map(h=>"#"+h).join(" "))}</span>`:""}</div>
  ${(i.slides||[]).length?`<p class="small muted" style="margin:10px 0 0">${i.slides.length} slides: ${esc(i.slides.map(s=>s.heading).join(" / "))}</p>`:""}
  ${(i.shots||[]).length?`<p class="small muted" style="margin:10px 0 0">${i.shots.length} shots, ${i.shots.reduce((a,s)=>a+(+s.seconds||0),0)} s total</p>`:""}
  ${ps.length?`<div class="linked" style="margin-top:12px">${ps.map(p=>`<span class="lk">${pvis(p)}${esc(p.name)}${p.url?` <a href="${esc(p.url)}" target="_blank" rel="noopener" class="small">link</a>`:""}</span>`).join("")}</div>`:""}
  ${errs.length||warns.length?`<ul class="qc" style="margin-top:12px">${[...errs,...warns].map(x=>`<li class="${x.l}">${esc(x.m)}</li>`).join("")}</ul>`:""}
  <div class="qactions">${t==="drafts"?`<button class="btn primary" data-a="submitOne" data-id="${i.id}" ${errs.length?"disabled":""}>Send to review</button><button class="btn ghost danger" data-a="reject" data-id="${i.id}">Reject</button>`:""}${t==="waiting"?`<button class="btn lime" data-a="approve" data-id="${i.id}" ${!S.canApprove||errs.length?"disabled":""}>${icon("check",16)} Approve</button><button class="btn" data-a="changes" data-id="${i.id}">Request changes</button><button class="btn ghost danger" data-a="reject" data-id="${i.id}">Reject</button>`:""}<button class="btn ghost" data-a="open" data-id="${i.id}">Open in studio</button></div>
  </div></article>`}).join("");
}
