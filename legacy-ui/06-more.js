
/* ───────── AI marketing assistant ───────── */
const PROMPTS=["Prepare next week's content for my approval","Plan all my content for December, ready for approval","Find products we haven't featured recently","Create five Reel ideas for the Herston team","Create a campaign for our new tile collection"];
function pageAssistant(){
 loadChat(S.brand);const turns=S.chat[S.brand],g=guide(S.brand);
 return`<div class="chatwrap"><section class="chat" aria-label="Conversation"><div class="msgs" id="msgs">
 ${turns.length?turns.map(renderTurn).join(""):`<div class="empty" style="margin:auto"><h3>What should we plan for ${esc(g.short)}?</h3><p style="max-width:52ch;margin:8px auto 0">The assistant reads your calendar, brand guidelines and product library, and can write full drafts. Anything it creates lands as a draft for your approval. It can't approve or publish.</p></div>`}
 </div><div class="composer"><textarea id="chatIn" rows="1" placeholder="${S.sample?"Ask for a plan, a campaign or a batch of drafts":S.mode==="local"?"The assistant works in the published studio":"AI isn't available in this view"}" ${S.sample?"":"disabled"} aria-label="Message the assistant"></textarea>${S.chatBusy?`<button class="btn" data-a="stopChat">Stop</button>`:`<button class="btn primary" data-a="sendChat" ${S.sample?"":"disabled"}>Send</button>`}</div></section>
 <aside class="prompts"><h3 style="margin-bottom:4px">Try</h3>${PROMPTS.map(p=>`<button data-a="prompt" data-t="${esc(p)}" ${S.sample&&!S.chatBusy?"":"disabled"}>${esc(p)}</button>`).join("")}
 <p class="small faint">Drafts are checked before saving: no prices, stock claims, unlisted sizes or unlinked products get through. Your conversation is saved privately to your account.</p>
 ${turns.length?`<button class="link" data-a="clearChat">Clear conversation</button>`:""}</aside></div>`;
}
function renderTurn(t,ix){
 if(t.role==="user")return`<div class="msg user">${esc(t.content)}</div>`;
 const created=(t.created||[]).map(id=>S.items.find(i=>i.id===id)).filter(Boolean);
 return`<div class="msg ai" id="turn-${ix}">${t.content?md(t.content):t.pending?`<span class="typing" aria-label="Thinking"><i></i><i></i><i></i></span>`:""}
 ${t.tool&&t.pending?`<div class="tool">${icon("assistant",13)} ${esc(t.tool)}</div>`:""}
 ${created.length?`<div class="created">${created.map(i=>`<button class="chip st-${sl(i.status)}" data-a="open" data-id="${i.id}"><i class="dot"></i><span class="t">${fmtD(i.scheduledAt)}</span><span class="n">${esc(i.title)}</span></button>`).join("")}<div class="row" style="margin-top:4px"><button class="btn sm" data-a="go" data-p="approvals">Open approval queue</button><button class="btn sm ghost" data-a="go" data-p="calendar">See in calendar</button></div></div>`:""}
 ${t.error?`<p class="small" style="color:var(--s-failed)">${esc(t.error)}</p>`:""}</div>`;
}
function assistantRules(){
 const g=guide(S.brand),today=new Date();
 return`You are the marketing assistant inside "TTC Marketing Studio", working for ${g.name}${g.tag?` (${g.tag})`:""}.
Today is ${today.toLocaleDateString("en-AU",{weekday:"long",day:"numeric",month:"long",year:"numeric"})} (${ymd(today)}), Brisbane time.

APPROVED BRAND GUIDELINES
Voice: ${g.voice}
Audience: ${g.audience}
Never use these words: ${g.avoidList.join(", ")||"none"}.
Other rules: ${g.notes}
Weekly structure: Monday = ${g.cadence[1]}, Wednesday = ${g.cadence[3]}, Friday = ${g.cadence[5]}.
Content series: ${SERIES.join(", ")}.
Channels and formats: ${JSON.stringify(FORMATS)}.

HOW TO WORK
1. Only feature products returned by list_products for this brand; never any other brand's products. Quote their facts exactly as returned and say nothing about anything marked "not specified". Never state prices, stock or availability; never invent sizes, finishes, slip ratings or products. Prefer tiles that are in stock and have an approved photo; mention in the brief when a featured product still needs a photo. If the catalogue is "demo", say so to the user.
2. Link products to a post with productIds. Never type web addresses; the studio attaches product links from the library.
3. Before planning any dates, call list_content for the whole range so you don't clash with or duplicate existing posts.
4. To create content, call create_drafts with up to 7 complete drafts per call. For a whole month: call list_content for the month, then search list_products several times with different looks (for example timber look, subway, terrazzo, outdoor, feature wall) to build a varied mix that doesn't repeat products, then create drafts week by week until every Monday, Wednesday and Friday is covered, adding other series (Save This Space, Perfect Match, Tile School with Wade, Customer Projects and so on) where they fit. Each draft needs: title, series, channel, format, scheduledAt (YYYY-MM-DDTHH:MM, default 18:00, following the weekly structure unless asked otherwise), a finished caption, hashtags, slides for carousels, a shot list for Reels and Stories, and a brief that starts with the concept and then gives the creative direction (composition, styling, which product photos to use; never alter tile colour, texture or proportions).
5. Set forReview true when the user asks for content "for approval" or to be reviewed; otherwise drafts stay as AI drafts.
6. If create_drafts rejects a draft, fix exactly the listed problems and resubmit only that draft.
7. You can't approve, schedule or publish anything. No analytics source is connected yet; if asked about performance, say so and never invent numbers.
8. When asked only for ideas, reply in chat without creating drafts.
9. Reply briefly in Australian English: one or two sentences and a compact list. Use **bold** sparingly.`;
}
function validateDraft(a,b){
 const problems=[];
 if(!CHANNELS.includes(a.channel))problems.push(`channel must be one of ${CHANNELS.join(", ")}`);
 const fmt=(FORMATS[a.channel]||[]).includes(a.format)?a.format:(FORMATS[a.channel]||["Single image"])[0];
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(a.scheduledAt||"")||!parseLocal(a.scheduledAt)||isNaN(parseLocal(a.scheduledAt)))problems.push("scheduledAt must be YYYY-MM-DDTHH:MM");
 else if(parseLocal(a.scheduledAt)<new Date())problems.push("scheduledAt is in the past");
 if(!String(a.title||"").trim())problems.push("title is required");
 if(!String(a.caption||"").trim())problems.push("caption is required");
 const bad=(a.productIds||[]).filter(id=>prod(id)?.brand!==b);if(bad.length)problems.push(`unknown productIds: ${bad.join(", ")}; use ids from list_products`);
 const it=newItem({fields:{title:String(a.title||"").slice(0,140),series:SERIES.includes(a.series)?a.series:"Inspiration",channel:CHANNELS.includes(a.channel)?a.channel:"Instagram",format:fmt,scheduledAt:a.scheduledAt||"",
  caption:String(a.caption||""),hashtags:[...new Set((a.hashtags||[]).map(h=>String(h).replace(/^#/,"").replace(/[^\p{L}\p{N}_]/gu,"").toLowerCase()).filter(Boolean))].slice(0,30),productIds:(a.productIds||[]).filter(id=>prod(id)?.brand===b),
  slides:fmt==="Carousel"?(a.slides||[]).map(s=>({heading:String(s.heading||""),body:String(s.body||"")})):[],shots:["Reel","Story"].includes(fmt)?(a.shots||[]).map(s=>({shot:String(s.shot||""),onScreenText:String(s.onScreenText||""),seconds:+s.seconds||0})):[],
  brief:String(a.brief||""),status:"AI Draft",createdBy:"ai"}});
 it.brand=b;
 // Attach the approved photo of each featured product, if one exists. Never a substitute image.
 it.mediaIds=[...new Set(it.productIds.map(id=>S.media.find(m=>m.productId===id&&m.approved&&m.brand===b)?.id).filter(Boolean))];
 const g=guide(b);const hits=g.avoidList.filter(w=>new RegExp("\\b"+reEsc(w)+"\\b","i").test(copyText(it)));if(hits.length)problems.push(`uses off-brand words: ${hits.join(", ")}`);
 problems.push(...factIssues(copyText(it),it.productIds,b));
 if(fmt==="Carousel"&&it.slides.length<2)problems.push("carousels need 2 or more slides");
 if(["Reel","Story"].includes(fmt)&&!it.shots.length)problems.push("Reels and Stories need a shot list");
 return{it,problems};
}
function assistantTools(turn){
 const b=S.brand;let made=0;
 return[
  {name:"list_products",description:"Search this brand's own product catalogue (and only this brand's). Returns exact product facts, whether it's in stock, whether an approved photo is on file, and when it was last featured. Call several times with different queries to find a varied mix.",inputSchema:{type:"object",properties:{query:{type:"string",description:"Words to match in name, size, colour, finish or tags, e.g. 'timber look', 'subway', '600 x 600'"},includeAccessories:{type:"boolean",description:"Default false: tiles only"},inStockOnly:{type:"boolean",description:"Default true"},notFeaturedDays:{type:"number"},limit:{type:"number",description:"Default 30, max 60"}}},
   execute:({query="",includeAccessories=false,inStockOnly=true,notFeaturedDays,limit=30}={})=>{turn.tool="Searching the product catalogue";updateTurn();
    const words=String(query).toLowerCase().split(/\s+/).filter(Boolean);
    const all=products(b).filter(p=>(includeAccessories||p.kind!=="accessory")&&(!inStockOnly||p.source==="demo"||p.stock==null||p.stock>0)&&words.every(w=>`${p.name} ${p.collection} ${p.colour} ${p.finish} ${p.size} ${(p.tags||[]).join(" ")}`.toLowerCase().includes(w))&&(!notFeaturedDays||!lastFeatured(p.id)||(Date.now()-parseLocal(lastFeatured(p.id)))>notFeaturedDays*864e5));
    const pick=all.slice(0,Math.min(60,Math.max(1,+limit||30)));
    return{brand:guide(b).name,catalogue:hasCatalog(b)?"shopify":"demo",totalMatches:all.length,returned:pick.length,products:pick.map(p=>({id:p.id,name:p.name,source:p.source,type:p.kind||"tile",size:p.size||"not specified",colour:p.colour||"not specified",finish:p.finish||"not specified",specs:p.specs||{},tags:(p.tags||[]).slice(0,8),description:p.desc,productUrl:p.url||"",inStock:p.source==="demo"?null:p.stock==null?null:p.stock>0,hasApprovedPhoto:S.media.some(m=>m.productId===p.id&&m.approved),lastFeatured:lastFeatured(p.id)||"never"}))}}},
  {name:"list_content",description:"Existing posts for this brand between two dates (YYYY-MM-DD, inclusive).",inputSchema:{type:"object",properties:{from:{type:"string"},to:{type:"string"}},required:["from","to"]},
   execute:({from,to})=>{turn.tool="Checking the calendar";updateTurn();return brandItems(b).filter(i=>i.scheduledAt&&i.scheduledAt.slice(0,10)>=from&&i.scheduledAt.slice(0,10)<=to).map(i=>({title:i.title,date:i.scheduledAt,channel:i.channel,format:i.format,series:i.series,status:i.status,products:(i.productIds||[]).map(id=>prod(id)?.name).filter(Boolean)}))}},
  {name:"create_drafts",description:"Save 1 to 7 complete draft posts to the calendar. Each is checked against the brand rules and product data; rejected drafts come back with the problems to fix. Nothing is ever published.",inputSchema:{type:"object",properties:{drafts:{type:"array",maxItems:7,items:{type:"object",properties:{
    title:{type:"string"},series:{type:"string",enum:SERIES},channel:{type:"string",enum:CHANNELS},format:{type:"string"},scheduledAt:{type:"string",description:"YYYY-MM-DDTHH:MM Brisbane time"},
    caption:{type:"string"},hashtags:{type:"array",items:{type:"string"}},productIds:{type:"array",items:{type:"string"}},
    slides:{type:"array",items:{type:"object",properties:{heading:{type:"string"},body:{type:"string"}}}},
    shots:{type:"array",items:{type:"object",properties:{shot:{type:"string"},onScreenText:{type:"string"},seconds:{type:"number"}}}},
    brief:{type:"string",description:"Concept first, then creative direction"},forReview:{type:"boolean"}},required:["title","series","channel","format","scheduledAt","caption","brief"]}}},required:["drafts"]},
   execute:async({drafts=[]}={})=>{
    const created=[],rejected=[];
    for(const a of drafts.slice(0,7)){
     if(made>=60){rejected.push({title:a.title,problems:["limit of 60 drafts per request reached"]});continue}
     const{it,problems}=validateDraft(a,b);
     if(problems.length){rejected.push({title:a.title,problems});continue}
     if(a.forReview&&!qcBlocked(it))it.status="Needs Review";
     turn.tool=`Saving “${it.title}”`;updateTurn();
     try{await saveItem(it)}catch(e){rejected.push({title:a.title,problems:["could not save: "+(e?.code||"error")]});continue}
     made++;(turn.created||(turn.created=[])).push(it.id);created.push({id:it.id,title:it.title,date:it.scheduledAt,status:it.status});
     audit("AI draft created",it,it.status==="Needs Review"?"Submitted for review":"","ai");
    }
    return{created,rejected};
   }}
 ];
}
async function loadChat(b){
 if(S.chatLoaded[b]||!S.db||!S.me)return;S.chatLoaded[b]=true;
 try{const d=await S.db.doc(`data/users/${S.me}/chat-${b}`).get();if(d.exists&&!S.chat[b].length){S.chat[b]=clone(d.data().turns||[]);queueRender()}}catch{}
}
async function saveChat(b){
 if(!S.db||!S.me)return;const turns=S.chat[b].filter(t=>!t.pending).slice(-40).map(t=>({role:t.role,content:String(t.content||"").slice(0,20000),created:t.created||[],error:t.error||""}));
 try{await S.db.doc(`data/users/${S.me}/chat-${b}`).set({turns,updatedAt:nowIso()})}catch{}
}
let chatCtl=null;
function updateTurn(){const turns=S.chat[S.brand];const ix=turns.length-1;const el=document.getElementById("turn-"+ix);if(el&&S.page==="assistant"){el.outerHTML=renderTurn(turns[ix],ix);const m=$("#msgs");if(m)m.scrollTop=m.scrollHeight}}
async function sendChat(text){
 text=(text||"").trim();if(!text||S.chatBusy||!S.sample)return;
 const brand=S.brand,turns=S.chat[brand];
 turns.push({role:"user",content:text});const turn={role:"assistant",content:"",pending:true,created:[]};turns.push(turn);
 S.chatBusy=true;render();const m=$("#msgs");if(m)m.scrollTop=m.scrollHeight;
 const hist=[];turns.filter(t=>t!==turn&&t.content).forEach(t=>{const last=hist[hist.length-1];if(last&&last.role===t.role)last.content+="\n\n"+t.content;else hist.push({role:t.role,content:t.content})});
 while(hist.length&&hist[0].role!=="user")hist.shift();
 hist[0]={role:"user",content:assistantRules()+"\n\n---\n\n"+hist[0].content};
 chatCtl=new AbortController();
 try{const{text:out}=await S.sample(hist,{cache:false,signal:chatCtl.signal,tools:assistantTools(turn),onText:({text})=>{turn.content=text;updateTurn()}});turn.content=out}
 catch(e){turn.content=e.text||turn.content||"";if(e.code!=="cancelled")turn.error=sampleErr(e)}
 finally{turn.pending=false;S.chatBusy=false;render();const mm=$("#msgs");if(mm)mm.scrollTop=mm.scrollHeight;saveChat(brand)}
}

/* ───────── Campaign planner ───────── */
const CAMP_STATUSES=["Proposal","Approved","Live","Complete"];
function pageCampaigns(){
 const list=S.campaigns.filter(c=>c.brand===S.brand).sort((a,b)=>(b.updatedAt||"").localeCompare(a.updatedAt||""));const c=S.campEdit;
 const side=`<div class="formstack"><button class="btn primary" data-a="newCamp">${icon("plus",16)} New campaign</button>${list.map(x=>`<button class="card" data-a="openCamp" data-id="${x.id}" style="${c?.id===x.id?"border-color:var(--ink)":""}"><span class="tag">${esc(x.status||"Proposal")}</span><b>${esc(x.name||"Untitled campaign")}</b><span class="muted">${x.start?fmtD(x.start+"T00:00",{day:"numeric",month:"short"}):""}${x.end?" – "+fmtD(x.end+"T00:00",{day:"numeric",month:"short"}):""}</span></button>`).join("")||`<p class="small muted">No campaigns yet.</p>`}</div>`;
 if(!c)return`<div class="studio" style="grid-template-columns:280px minmax(0,1fr)">${side}<div class="panel empty"><h3>Plan a campaign</h3><p>Start one, then let the assistant draft a full proposal for your approval.</p></div></div>`;
 const f=(k,label,rows=2,ph="")=>`<label class="field"><span>${label}</span><textarea data-cpf="${k}" rows="${rows}" placeholder="${esc(ph)}">${esc(c[k]||"")}</textarea></label>`;
 const ps=(c.productIds||[]).map(prod).filter(Boolean),avail=products().filter(p=>!(c.productIds||[]).includes(p.id));
 const linked=brandItems().filter(i=>i.campaignId===c.id);
 return`<div class="studio" style="grid-template-columns:280px minmax(0,1fr)">${side}<div class="formstack panel">
 <div class="row" style="justify-content:space-between"><input type="text" data-cpf="name" value="${esc(c.name||"")}" placeholder="Campaign name" style="font-family:var(--head);font-size:22px;border:0;padding:0;flex:1;min-width:200px;background:none"><select data-cpf="status" style="width:auto">${CAMP_STATUSES.map(s=>`<option${s===(c.status||"Proposal")?" selected":""}>${s}</option>`).join("")}</select></div>
 <div class="row"><input type="text" data-cpf="_brief" value="${esc(c._brief||"")}" placeholder="Brief for the AI, for example: launch our new outdoor range before Christmas" style="flex:1;min-width:220px"><button class="btn lime" data-a="aiCamp" ${S.busy||!S.sample?"disabled":""}>${icon("assistant",16)} ${S.busy==="camp"?"Drafting…":"Draft proposal with AI"}</button></div>
 <div class="grid2">${f("objective","Objective")}${f("audience","Target audience")}</div>
 ${f("messaging","Key messaging",3)}
 <div class="field"><span>Featured products</span><div class="linked">${ps.map(p=>`<span class="lk">${pvis(p)}${esc(p.name)}<button data-a="campUnprod" data-pid="${p.id}" aria-label="Remove">${icon("x",14)}</button></span>`).join("")}${avail.length?`<select data-a-change="campAddprod" style="width:auto"><option value="">Add a product…</option>${avail.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join("")}</select>`:""}</div></div>
 ${f("creative","Creative direction",3)}
 <div class="grid3"><label class="field"><span>Start</span><input type="date" data-cpf="start" value="${esc(c.start||"")}"></label><label class="field"><span>End</span><input type="date" data-cpf="end" value="${esc(c.end||"")}"></label><label class="field"><span>Budget (AUD)</span><input type="number" data-cpf="budget" value="${esc(c.budget||"")}" min="0"></label></div>
 <div class="grid2">${f("social","Social media plan",3)}${f("email","Email marketing",3)}</div>
 ${f("kpis","KPIs",2,"For example: 8% saves rate on carousels, 40 showroom enquiries")}
 <div class="field"><span class="sectionlabel">Content schedule <span class="faint">${(c.schedule||[]).length} planned</span></span>${(c.schedule||[]).length?`<table><tbody>${c.schedule.map((s,ix)=>`<tr><td style="white-space:nowrap">${fmtD(s.date+"T00:00")}</td><td>${esc(s.title)}<div class="small muted">${esc(s.channel)} ${esc(s.format)}</div></td><td><button class="iconbtn" data-a="campRmSched" data-ix="${ix}" aria-label="Remove">${icon("x",14)}</button></td></tr>`).join("")}</tbody></table><div class="row" style="margin-top:8px"><button class="btn sm" data-a="campToCal">Add to calendar as ideas</button></div>`:`<p class="small muted">The AI proposal fills this in.</p>`}</div>
 <div class="field"><span>Results</span><p class="small muted" style="margin:0">${linked.length} linked posts (${linked.filter(i=>i.status==="Published").length} published). Reach, sales and ROAS appear here once analytics are connected.</p></div>
 <div class="actions"><button class="btn" data-a="saveCamp">Save</button>${(c.status||"Proposal")==="Proposal"?`<button class="btn primary" data-a="approveCamp" ${S.canApprove?"":"disabled"}>Approve proposal</button>`:""}<span style="flex:1"></span><button class="btn ghost" data-a="closeCamp">Close</button></div>
 </div></div>`;
}
async function aiCamp(){
 const c=S.campEdit;if(!c||!S.sample)return;const g=guide(S.brand);
 const ps=products().filter(p=>p.kind!=="accessory"&&(p.source==="demo"||p.stock==null||p.stock>0)).slice(0,150).map(p=>({id:p.id,name:p.name,size:p.size,colour:p.colour,finish:p.finish,tags:(p.tags||[]).slice(0,5)}));
 const prompt=`Draft a marketing campaign proposal for ${g.name}. Today is ${ymd(new Date())}.
Brand voice: ${g.voice}
Audience: ${g.audience}
Never use: ${g.avoidList.join(", ")}.
Brief: ${c._brief||c.name||"a seasonal campaign"}
Product catalogue (demo data; use only these, never mention prices or stock): ${JSON.stringify(ps)}
Weekly content rhythm: Mon ${g.cadence[1]}, Wed ${g.cadence[3]}, Fri ${g.cadence[5]}.
Reply with only JSON: {"name":string,"objective":string,"audience":string,"messaging":string,"productIds":[ids from the catalogue],"creative":string,"start":"YYYY-MM-DD","end":"YYYY-MM-DD","social":string,"email":string,"kpis":string (targets to agree, no invented baselines),"schedule":[6-10 {"date":"YYYY-MM-DD","title":string,"channel":one of ${JSON.stringify(CHANNELS)},"format":string,"series":one of ${JSON.stringify(SERIES)}}]}`;
 S.busy="camp";render();
 try{const r=await S.sample.json(prompt,{modelTier:"default"});if(S.campEdit?.id!==c.id)return;const x=S.campEdit;
  ["name","objective","audience","messaging","creative","start","end","social","email","kpis"].forEach(k=>{if(r[k])x[k]=String(r[k])});
  if(Array.isArray(r.productIds))x.productIds=r.productIds.filter(id=>prod(id)?.brand===S.brand);
  if(Array.isArray(r.schedule))x.schedule=r.schedule.filter(s=>/^\d{4}-\d{2}-\d{2}$/.test(s.date||"")).map(s=>({date:s.date,title:String(s.title||""),channel:CHANNELS.includes(s.channel)?s.channel:"Instagram",format:String(s.format||""),series:SERIES.includes(s.series)?s.series:"Campaigns"}));
  toast("Proposal drafted. Review it, then save.");
 }catch(e){toast(sampleErr(e),"error")}finally{S.busy="";render()}
}

/* ───────── Product library ───────── */
function pageProducts(){
 const all=products(),real=hasCatalog(S.brand),cols=[...new Set(all.map(p=>p.collection).filter(Boolean))].sort();const q=S.prodQ.toLowerCase();
 const list=all.filter(p=>(!q||`${p.name} ${p.collection} ${p.colour} ${p.finish} ${p.size} ${(p.tags||[]).join(" ")}`.toLowerCase().includes(q))&&(!S.prodCol||p.collection===S.prodCol)&&(!S.prodKind||(p.kind||"tile")===S.prodKind)&&(!S.prodNeglected||neglected(p)));
 const shown=list.slice(0,S.prodLimit);
 return shopPanel()+`<div class="notice${real?"":" lime"}"><span>${icon("media",16)}</span><span>${real?`Showing ${guide(S.brand).short}'s Shopify catalogue only. Prices and stock are as of the last import and are never written into posts.`:`<b>These are demo placeholders</b>, shown until ${guide(S.brand).short}'s Shopify store is imported. Their prices and stock are made up and the AI can't use them in copy.`} Product photos are only ever ones you upload and approve, never generated.</span></div>
 <div class="cal-bar"><input type="search" id="prodQ" value="${esc(S.prodQ)}" placeholder="Search name, size, colour or tag" style="max-width:300px" aria-label="Search products">
 ${real?`<select data-pf="kind" style="width:auto" aria-label="Type"><option value="">Tiles and accessories</option><option value="tile"${S.prodKind==="tile"?" selected":""}>Tiles</option><option value="accessory"${S.prodKind==="accessory"?" selected":""}>Accessories</option></select>`:""}
 <select data-pf="col" style="width:auto;max-width:220px" aria-label="${real?"Supplier":"Collection"}"><option value="">${real?"All suppliers":"All collections"}</option>${cols.map(c=>`<option${c===S.prodCol?" selected":""}>${esc(c)}</option>`).join("")}</select>
 <label class="row small"><input type="checkbox" data-pf="neg" ${S.prodNeglected?"checked":""}> Not featured in 30 days</label><span style="flex:1"></span><span class="small muted">${list.length.toLocaleString()} of ${all.length.toLocaleString()}</span></div>
 ${shown.length?`<div class="pgrid">${shown.map(productCard).join("")}</div>${list.length>shown.length?`<div class="row" style="justify-content:center;margin-top:18px"><button class="btn" data-a="prodMore">Show more (${(list.length-shown.length).toLocaleString()} left)</button></div>`:""}`:`<div class="panel empty"><h3>No products match</h3><p>Try a different search.</p></div>`}`;
}
const SPEC_LABELS={thickness:"Thickness",edge:"Edge",slipRating:"Slip rating",material:"Material",suitableFor:"Suitable for",soldPer:"Sold per",boxQty:"Box",grout:"Grout"};
function productCard(p){
 const lf=lastFeatured(p.id),demo=p.source==="demo";const photos=S.media.filter(m=>m.productId===p.id),ok=photos.some(m=>m.approved);
 const canUp=!!S.assets||S.mode==="local";
 return`<article class="pcard">${pvis(p,"div",demo&&!pimg(p)?'role="img" aria-label="Illustrative swatch, not product imagery"':"")}<div class="pb"><div class="row" style="justify-content:space-between"><span class="small muted">${esc(p.collection)}</span><span class="tag">${demo?"Demo":p.kind==="accessory"?"Accessory":"Shopify"}</span></div><h3>${esc(p.name)}</h3>
 <dl class="specs"><dt>Size</dt><dd>${esc(p.size||"Not in Shopify")}</dd><dt>Colour</dt><dd>${esc(p.colour||"Not in Shopify")}</dd><dt>Finish</dt><dd>${esc(p.finish||"Not in Shopify")}</dd>${Object.entries(p.specs||{}).map(([k,v])=>`<dt>${esc(SPEC_LABELS[k]||k)}</dt><dd>${esc(v)}</dd>`).join("")}<dt>Price</dt><dd>${esc(p.price||"Not set")}${demo?` <span class="faint">demo</span>`:""}</dd><dt>Stock</dt><dd>${esc(p.availability||"Not set")}${demo?` <span class="faint">demo</span>`:""}</dd></dl>
 ${p.desc?`<p class="small muted" style="margin:0">${esc(p.desc)}</p>`:""}
 <div class="row small">${p.url?`<a href="${esc(p.url)}" target="_blank" rel="noopener">Product page</a>`:""}${p.shopifyImage?`<a href="${esc(p.shopifyImage)}" target="_blank" rel="noopener">Shopify photo</a>`:""}</div>
 <span class="small ${ok?"":"faint"}">${ok?"Approved photo on file":photos.length?"Photo uploaded, awaiting approval":"No photo uploaded yet"}</span>
 ${neglected(p)?`<span class="flag">${lf?"Last featured "+fmtD(lf,{day:"numeric",month:"short"}):"Never featured"}</span>`:`<span class="small faint">Featured ${fmtD(lf,{day:"numeric",month:"short"})}</span>`}
 <div class="row" style="margin-top:auto;padding-top:8px"><button class="btn sm" data-a="feature" data-pid="${p.id}">Feature in a post</button><button class="btn sm ghost" data-a="upload" data-ctx="product" data-pid="${p.id}" ${canUp?"":"disabled"}>${icon("upload",14)} Upload photo</button></div></div></article>`;
}

/* ───────── Media library ───────── */
function pageMedia(){
 const list=S.media.filter(m=>m.brand===S.brand).sort((a,b)=>(b.uploadedAt||"").localeCompare(a.uploadedAt||""));
 const can=!!S.assets||S.mode==="local";
 return`<div class="row" style="justify-content:space-between;margin-bottom:18px"><p class="muted" style="margin:0;max-width:70ch">Upload real product photos and lifestyle images. They're stored exactly as uploaded, never recoloured or reshaped. Only images marked approved can go into posts you approve.</p><button class="btn primary" data-a="upload" data-ctx="media" ${can?"":"disabled"}>${icon("upload",16)} Upload images</button></div>
 ${!can?`<div class="notice"><span>Uploading needs Editor access to this studio.</span></div>`:""}
 ${S.mode==="local"?`<div class="notice"><span>In preview mode uploads only last until you reload.</span></div>`:""}
 ${list.length?`<div class="mgrid">${list.map(m=>`<article class="mcard"><img src="${esc(mediaUrl(m))}" alt="${esc(m.name)}" loading="lazy"><div class="mb"><b style="font-weight:500;word-break:break-all">${esc(m.name)}</b>
 <label class="row"><input type="checkbox" data-a-change="mediaApprove" data-mid="${m.id}" ${m.approved?"checked":""} ${S.canApprove?"":"disabled"}> Approved for final use</label>
 <select data-a-change="mediaProd" data-mid="${m.id}" aria-label="Linked product"><option value="">No linked product</option>${(m.productId&&prod(m.productId)&&!products().some(p=>p.id===m.productId)?[prod(m.productId)]:[]).concat(products()).map(p=>`<option value="${p.id}"${p.id===m.productId?" selected":""}>${esc(p.name)}${p.size?" · "+esc(p.size):""}</option>`).join("")}</select>
 <div class="row"><button class="btn sm" data-a="mediaUse" data-mid="${m.id}">Use in a post</button><button class="btn sm ghost danger" data-a="mediaDel" data-mid="${m.id}">Delete</button></div></div></article>`).join("")}</div>`:`<div class="panel empty"><h3>No images yet</h3><p>Upload your tile photography and lifestyle shots to start building approved creative.</p></div>`}`;
}
async function handleFiles(files,ctx,pid=""){
 for(const f of files){
  if(f.size>20*1024*1024){toast(`${f.name} is over 20 MB.`,"error");continue}
  const id="m-"+uid();let rec={brand:S.brand,name:f.name,approved:false,productId:pid&&prod(pid)?.brand===S.brand?pid:"",uploadedAt:nowIso(),uploadedBy:S.me||"you",contentType:f.type};
  try{
   if(S.assets){const r=await S.assets.upload(f);rec.assetId=r.id}else rec.url=URL.createObjectURL(f);
   await put("media",id,rec);audit("Image uploaded",null,f.name);
   if(ctx==="studio"&&S.edit){S.edit.mediaIds=[...(S.edit.mediaIds||[]),id]}
  }catch(e){toast(`Couldn't upload ${f.name}.`,"error")}
 }
 toast(ctx==="media"?"Uploaded.":"Uploaded. Approve it in the media library before it can be used in approved posts.");render();
}

/* ───────── Scheduling and publishing ───────── */
function pagePublishing(){
 const items=brandItems(),by=s=>items.filter(i=>i.status===s).sort((a,b)=>(a.scheduledAt||"").localeCompare(b.scheduledAt||""));
 const ready=by("Approved"),sched=by("Scheduled"),failed=by("Failed"),pub=by("Published").reverse().slice(0,8);
 const row=(i,actions)=>{const ok=verified(i);return`<tr><td style="white-space:nowrap">${fmtD(i.scheduledAt)}<div class="small muted">${fmtT(i.scheduledAt)}</div></td><td><button class="link" data-a="open" data-id="${i.id}">${esc(i.title)}</button><div class="small muted">${esc(i.channel)} ${esc(i.format)}${i.publishStatus?" · "+esc(i.publishStatus):""}</div></td><td>${ok?`<span class="lock" style="color:var(--text)">${icon("lock",14)} Matches approval</span>`:`<span class="small" style="color:var(--s-failed)">Doesn't match approval</span>`}</td><td><div class="row" style="justify-content:flex-end">${actions}</div></td></tr>`};
 const table=(title,list,act,empty)=>`<section class="block"><div class="block-head"><h2>${title}</h2><span class="small muted">${list.length}</span></div>${list.length?`<div class="panel scrollx" style="padding:0"><table><tbody>${list.map(i=>row(i,act(i))).join("")}</tbody></table></div>`:`<p class="muted">${empty}</p>`}</section>`;
 const p=S.settings.paused?"disabled":"";
 return`<div class="notice lime"><span>${icon("publishing",16)}</span><span><b>No publishing platform is connected yet</b>, so nothing is sent from here and nothing is marked live unless you confirm it. Copy the approved caption into Later, then mark it scheduled. Automated publishing arrives in Stage 4 and will only accept versions that match their approval.</span></div>
 ${table("Ready to schedule",ready,i=>`<button class="btn sm" data-a="copyCap" data-id="${i.id}">${icon("copy",14)} Copy caption</button><button class="btn sm primary" data-a="markSched" data-id="${i.id}" ${p}>Mark scheduled in Later</button>`,"Approved posts appear here.")}
 ${table("Scheduled",sched,i=>`<button class="btn sm" data-a="copyCap" data-id="${i.id}">${icon("copy",14)} Copy</button><button class="btn sm" data-a="markPub" data-id="${i.id}" ${p}>Mark published</button><button class="btn sm ghost danger" data-a="markFail" data-id="${i.id}">Failed</button>`,"Nothing scheduled.")}
 ${failed.length?table("Failed",failed,i=>`<button class="btn sm" data-a="retry" data-id="${i.id}">Retry</button>`,""):""}
 ${table("Recently published",pub,()=>"","Nothing published yet.")}
 <section class="block"><div class="block-head"><h2>Platform support</h2></div><div class="panel scrollx" style="padding:0"><table><thead><tr><th>Platform</th><th>Automated publishing</th><th>Status</th></tr></thead><tbody>${PLATFORMS.map(([n,d])=>`<tr><td><b style="font-weight:500;color:var(--ink)">${n}</b></td><td class="small">${esc(d)}</td><td><span class="tag">Manual for now</span></td></tr>`).join("")}</tbody></table></div></section>`;
}

/* ───────── Analytics ───────── */
function pageAnalytics(){
 const items=brandItems(),pub=items.filter(i=>i.status==="Published");
 const aps=S.approvals.filter(a=>a.brand===S.brand);
 const turn=aps.map(a=>{const sub=S.audit.filter(x=>x.contentId===a.contentId&&x.action==="Submitted for review"&&x.at<=a.approvedAt).sort((x,y)=>y.at.localeCompare(x.at))[0];return sub?(new Date(a.approvedAt)-new Date(sub.at))/36e5:null}).filter(x=>x!=null&&x>=0);
 const avg=turn.length?(turn.reduce((a,b)=>a+b,0)/turn.length):null;
 const weeks=[3,2,1,0].map(w=>{const s=addDays(startOfWeek(new Date()),-7*w);const e=addDays(s,7);return{label:s.toLocaleDateString("en-AU",{day:"numeric",month:"short"}),n:pub.filter(i=>{const d=parseLocal(i.publishedAt||i.scheduledAt);return d>=s&&d<e}).length}});
 const metrics=[["Instagram reach","Meta (Instagram)"],["Engagement","Meta (Instagram)"],["Follower growth","Meta (Instagram)"],["Website sessions","Google Analytics 4"],["Shopify sales","Shopify"],["Conversion rate","Shopify + GA4"],["Ad spend","Meta Ads"],["Purchases","Shopify"],["Revenue attributed to campaigns","GA4 + UTM links (estimated attribution)"],["ROAS","Meta Ads + Shopify"],["Product performance","Shopify"]];
 return`<div class="notice"><span>${icon("analytics",16)}</span><span><b>No analytics sources are connected</b>, so marketing performance shows as unavailable rather than estimated. Below that is what the studio tracks directly.</span></div>
 <section class="block"><div class="block-head"><h2>Tracked directly by the studio</h2></div><div class="grid3">
  <div class="panel"><span class="small muted">Published, last 4 weeks</span><div class="pipe" style="height:auto;background:none;gap:6px;align-items:flex-end;margin:12px 0 0">${weeks.map(w=>`<div style="flex:1;text-align:center;background:none"><div style="height:${8+w.n*14}px;background:var(--ink);border-radius:2px"></div><div class="small faint">${w.label}</div><div class="small">${w.n}</div></div>`).join("")}</div></div>
  <div class="panel"><span class="small muted">Average time to approval</span><h2 style="font-size:30px;margin-top:8px">${avg==null?"Not enough data":avg<1?Math.round(avg*60)+" min":avg.toFixed(1)+" h"}</h2><p class="small faint" style="margin:6px 0 0">From submission to approval, ${turn.length} approvals.</p></div>
  <div class="panel"><span class="small muted">Weekly cadence this week</span><h2 style="font-size:30px;margin-top:8px">${items.filter(i=>{const d=parseLocal(i.scheduledAt);const s=startOfWeek(new Date());return d&&d>=s&&d<addDays(s,7)&&["Approved","Scheduled","Published"].includes(i.status)}).length} of 3</h2><p class="small faint" style="margin:6px 0 0">Approved, scheduled or published posts against the Mon, Wed, Fri plan.</p></div>
 </div></section>
 <section class="block"><div class="block-head"><h2>Marketing performance</h2></div><div class="panel scrollx" style="padding:0"><table><thead><tr><th>Metric</th><th>Source</th><th>Value</th></tr></thead><tbody>${metrics.map(([m,s])=>`<tr><td>${m}</td><td class="small muted">${s}</td><td><span class="tag">Unavailable</span></td></tr>`).join("")}</tbody></table></div>
 <p class="small faint">When connected, each number will be labelled as tracked directly, estimated attribution, or unavailable. Weekly and monthly summaries arrive in Stage 5.</p></section>`;
}

/* ───────── Brand guidelines ───────── */
function pageBrand(){
 const g=guide(S.brand);const sw=String(g.palette||"").split("\n").map(l=>l.match(/^(.*?)\s*(#[0-9a-f]{3,8})\s*$/i)).filter(Boolean);
 const f=(k,label,rows=3)=>`<label class="field"><span>${label}</span><textarea data-bf="${k}" rows="${rows}" ${S.canApprove?"":"disabled"}>${esc(g[k]||"")}</textarea></label>`;
 return`<div class="row" style="justify-content:space-between;align-items:flex-end;margin-bottom:22px"><div><h1 class="display">${esc(g.name)}</h1>${g.tag?`<p class="muted" style="margin:8px 0 0;font-size:16px">${esc(g.tag)}</p>`:""}</div>${S.canApprove?`<button class="btn primary" data-a="saveBrand">Save guidelines</button>`:`<span class="lock">${icon("lock",14)} Editors can change guidelines</span>`}</div>
 <div class="two"><div class="formstack panel">${f("voice","Brand voice",4)}${f("audience","Audience",3)}<label class="field"><span>Words to avoid (comma separated, checked by quality control)</span><input type="text" data-bf="avoid" value="${esc(g.avoid||"")}" ${S.canApprove?"":"disabled"}></label>${f("notes","Other rules",3)}</div>
 <div class="formstack"><section class="panel"><h3 style="margin-bottom:12px">Palette</h3>${sw.length?`<div class="swatches">${sw.map(m=>`<div class="swatch"><i style="background:${esc(m[2])}"></i>${esc(m[1])}<br><span class="faint">${esc(m[2])}</span></div>`).join("")}</div>`:`<p class="small muted">Add ${esc(g.short)}'s colours below, one per line as “Name #HEX”.</p>`}
 <textarea data-bf="palette" rows="4" style="margin-top:14px" ${S.canApprove?"":"disabled"}>${esc(g.palette||"")}</textarea></section>
 <section class="panel"><h3 style="margin-bottom:8px">Typography</h3><p style="margin:0">${esc(g.type)}</p><p class="small faint" style="margin:8px 0 0">The studio shows Fraunces and Montserrat as stand-ins until licensed font files are added.</p></section>
 <section class="panel"><h3 style="margin-bottom:8px">Weekly structure</h3><p style="margin:0">Monday: ${esc(g.cadence[1])}<br>Wednesday: ${esc(g.cadence[3])}<br>Friday: ${esc(g.cadence[5])}</p></section></div></div>`;
}

/* ───────── Automations ───────── */
function pageAutomations(){
 const A=[["Strategy agent","Plans content and campaigns","Read calendar, products, guidelines","Live in the AI assistant"],["Copywriting agent","Writes captions, slides, scripts and emails","Create drafts only","Live in studio and assistant"],["Creative agent","Prepares visual briefs and assets","Create briefs; never alter product imagery","Briefs live; asset generation in Stage 3"],["Product agent","Retrieves accurate product information","Read product library","Demo catalogue; Shopify in Stage 3"],["Quality control agent","Checks brand words, limits, claims and image approval","Read all; block submission on errors","Live (rules-based)"],["Scheduling agent","Manages approved publishing","Publish verified approvals only","Manual workflow; automated in Stage 4"],["Analytics agent","Reviews performance and writes reports","Read analytics","Stage 5"]];
 return`<div class="notice lime"><span>${icon("lock",16)}</span><span>No agent can approve content or bypass the approval lock. Approvals are written only by people with Editor access, and publishing checks every post against its approved fingerprint.</span></div>
 <div class="panel scrollx" style="padding:0"><table><thead><tr><th>Agent</th><th>Job</th><th>Permissions</th><th>Status</th></tr></thead><tbody>${A.map(a=>`<tr><td><b style="font-weight:500;color:var(--ink)">${a[0]}</b></td><td>${a[1]}</td><td class="small">${a[2]}</td><td><span class="tag">${a[3]}</span></td></tr>`).join("")}</tbody></table></div>
 <section class="block"><div class="block-head"><h2>Planned background automations</h2><span class="small muted">n8n, Stage 4</span></div><div class="panel"><ul class="feed">${["Every Friday: draft next week's Mon, Wed and Fri posts for review","When Shopify adds a product: draft a Product Launch post","Daily: flag approved posts within 24 hours that aren't scheduled","Monday morning: weekly performance summary","If publishing fails: retry once, then alert you"].map(t=>`<li><span>${esc(t)}</span></li>`).join("")}</ul></div></section>`;
}

/* ───────── Settings and integrations ───────── */
function dbStatus(){
 const live=S.mode==="live";const real=S.items.filter(i=>!i.demo&&!i.archived),demo=S.items.filter(i=>i.demo&&!i.archived);
 const row=(k,v)=>`<tr><td class="muted" style="width:42%">${k}</td><td>${v}</td></tr>`;
 const last=S.audit[0]?.at;
 return`<div class="row" style="gap:8px;margin-bottom:10px">${live?pill("Approved").replace("Approved","Connected"):pill("Failed").replace("Failed",esc(modeLabel()))}</div>
 <table><tbody>${row("Storage",live?"Claude artifact database: hosted server-side by Anthropic, shared by everyone you share the studio with. <b>Not Supabase.</b>":"Not connected; nothing on this screen is being saved.")}
 ${row("Sign-in and permissions","Your Claude account. Editors approve, import and manage settings; Contributors draft; Viewers read. Enforced by the database server.")}
 ${row("Posts",`${real.length} yours · ${demo.length} demo`)}
 ${row("Approval records",`${S.approvals.length} (${S.approvals.filter(a=>!a.demo).length} made by people)`)}
 ${row("Products",Object.values(BRANDS).map(br=>`${br.short}: ${hasCatalog(br.id)?`${catalog().map[br.id].length} from Shopify${S.stores[br.id]?.partial?" (partial)":""}`:`${S.products.filter(p=>p.brand===br.id).length} demo`}`).join(" · "))}
 ${row("Activity log entries",`${S.audit.length}${last?", latest "+ago(last):""}`)}</tbody></table>`;
}
function demoPlan(b){
 const posts=S.items.filter(i=>i.demo&&i.brand===b);
 const realAp=new Set(S.approvals.filter(a=>!a.demo).map(a=>a.id));
 const keep=posts.filter(i=>(i.revision||1)>1||i.createdBy!=="demo"||(i.approvalId&&realAp.has(i.approvalId)));
 const del=posts.filter(i=>!keep.includes(i)),ids=new Set(del.map(i=>i.id));
 return{del,keep,aps:S.approvals.filter(a=>a.demo&&ids.has(a.contentId)),prods:S.products.filter(p=>p.source==="demo"&&p.brand===b)};
}
function demoRow(b){
 const g=guide(b),p=demoPlan(b),n=p.del.length+p.prods.length;
 if(!n&&!p.keep.length)return`<div class="prodrow"><div><b style="font-weight:500;color:var(--ink)">${esc(g.name)}</b><div class="small muted">No demonstration data left.</div></div></div>`;
 const ready=hasCatalog(b);
 return`<div class="prodrow"><div><b style="font-weight:500;color:var(--ink)">${esc(g.name)}</b><div class="small muted">${p.del.length} demo posts, ${p.aps.length} demo approvals, ${p.prods.length} demo products${p.keep.length?` · ${p.keep.length} demo posts you've worked on will be kept`:""}${ready?"":` · available once ${esc(g.short)}'s Shopify catalogue is imported`}</div></div><button class="btn sm danger" data-a="clearDemo" data-b="${b}" ${ready&&S.canApprove&&n?"":"disabled"}>Remove</button></div>`;
}
function pageIntegrations(){
 const demoCount=S.items.filter(i=>i.demo).length+S.products.filter(p=>p.source==="demo").length;
 return`<section class="panel"><div class="row" style="justify-content:space-between"><div><h2>Emergency pause</h2><p class="muted" style="margin:6px 0 0;max-width:62ch">Stops anything from being marked scheduled or published, across both brands, until you resume.</p></div>
 <button class="switch" role="switch" aria-checked="${!!S.settings.paused}" aria-label="Pause all publishing" data-a="pause" ${S.canApprove?"":"disabled"}></button></div></section>
 <section class="block"><div class="block-head"><h2>Your access</h2></div><div class="panel"><p style="margin:0">${S.canApprove?"<b>Editor.</b> You can approve content, change guidelines and pause publishing.":"<b>Contributor.</b> You can draft and submit content. Approvals need an Editor."}</p><p class="small muted" style="margin:8px 0 0">Roles follow how this studio is shared: Editors approve, Contributors draft, Viewers read. Change them from the Share menu.</p></div></section>
 <section class="block"><div class="block-head"><h2>Integrations</h2></div><div class="panel scrollx" style="padding:0"><table><thead><tr><th>Service</th><th>Used for</th><th>Status</th></tr></thead><tbody>${INTEGRATIONS.map(([n,u,st])=>n==="Shopify"?`<tr><td><b style="font-weight:500;color:var(--ink)">Shopify</b></td><td class="small">${u}. One store per brand, kept separate.</td><td>${Object.values(BRANDS).map(br=>{const s=S.stores[br.id];return`<div class="small">${br.short}: ${s?`<span class="tag">Linked · ${esc(s.key)}</span>`:`<span class="tag">Not linked</span>`}</div>`}).join("")}</td></tr>`:`<tr><td><b style="font-weight:500;color:var(--ink)">${n}</b></td><td class="small">${u}</td><td><span class="tag">Not connected · ${st}</span></td></tr>`).join("")}</tbody></table></div><p class="small faint">Credentials will live in server-side environment variables in the full build, never in this page.</p></section>
 <section class="block"><div class="block-head"><h2>Database status</h2></div><div class="panel">${dbStatus()}</div></section>
 <section class="block"><div class="block-head"><h2>Demonstration data</h2></div><div class="panel">${Object.values(BRANDS).map(br=>demoRow(br.id)).join("")}<p class="small faint" style="margin:12px 0 0">Removal deletes only sample posts, their sample approvals and sample products. Anything you edited, approved yourself or created is kept, and activity log entries are never deleted.</p></div></section>`;
}
