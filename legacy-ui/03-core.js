
/* ───────── Config ───────── */
const STATUSES=["Idea","AI Draft","Needs Review","Changes Requested","Approved","Scheduled","Published","Failed"];
const sl=s=>String(s||"").toLowerCase().replace(/[^a-z0-9]+/g,"-");
const SERIES=["Inspiration","Tile of the Week","Product Feature","Save This Space","Perfect Match","Tile School with Wade","Behind the Scenes","Team Content","Customer Projects","Product Launches","Campaigns","Seasonal Inspiration"];
const FORMATS={Instagram:["Single image","Carousel","Reel","Story"],Facebook:["Single image","Carousel","Reel","Story"],Pinterest:["Pin"],LinkedIn:["Single image","Carousel","Text post"],TikTok:["Reel"],Email:["Email"]};
const CHANNELS=Object.keys(FORMATS);
const BRANDS={
 ttc:{id:"ttc",name:"The Tile Collective",short:"TTC",tag:"Curated to Elevate",
  voice:"Elevated, refined, polished and aspirational. Design-led and confident. Lets the tile be the hero; describes texture, light and finish rather than hype.",
  audience:"Homeowners renovating, interior designers, architects and builders in South East Queensland who care about finish.",
  avoid:"cheap, bargain, budget, deal, discount",
  palette:"Black #000000\nCharcoal #333333\nGraphite #666666\nSilver #CCCCCC\nPale lime #F7FAE0\nSoft lime #F0FF94\nLime #D2DE26\nWhite #FFFFFF",
  type:"Glancyr for headings, Gotham for body copy.",
  notes:"Showroom in Herston. Australian English. Never alter the colour, texture, shape or proportions of real tiles in creative.",
  cadence:{1:"Inspiration",3:"Tile of the Week",5:"Product Feature"}},
 cto:{id:"cto",name:"Cheap Tiles Online",short:"CTO",tag:"",
  voice:"Value-focused, straightforward, accessible and conversion-oriented. Clear benefits and a clear call to action. Friendly and practical.",
  audience:"DIY renovators and budget-conscious homeowners shopping online.",
  avoid:"luxury, exclusive, bespoke",
  palette:"",type:"Glancyr for headings, Gotham for body copy.",
  notes:"Online-only. Three Instagram posts per week. Australian English.",
  cadence:{1:"Inspiration",3:"Tile of the Week",5:"Product Feature"}}
};
const PLATFORMS=[
 ["Instagram","Feed, carousel and Reels can be auto-published through Meta's API once connected. Stories and product tags often need manual posting."],
 ["Facebook","Feed posts and Reels can be auto-published once a Page is connected."],
 ["Pinterest","Pins can be auto-published once connected."],
 ["LinkedIn","Company page posts can be auto-published once connected."],
 ["TikTok","Requires TikTok's Content Posting API approval; manual posting until then."],
 ["Email","Sends through your email platform (for example Klaviyo); manual until connected."]
];
const INTEGRATIONS=[
 ["Shopify","Product library source of truth","Stage 3"],["Canva","Designs and brand templates","Stage 3"],["Later","Scheduling (your current tool)","Stage 4"],["Metricool","Scheduling and social analytics","Stage 4"],
 ["Meta (Instagram, Facebook)","Publishing and insights","Stage 4"],["Pinterest","Publishing and analytics","Stage 4"],["Klaviyo","Email campaigns","Stage 4"],["Google Analytics 4","Website sessions and conversions","Stage 5"],["Meta Ads","Ad spend, purchases and ROAS","Stage 5"],["n8n","Background automations","Stage 4"],["Supabase","Optional: self-hosted database for a standalone app","Full build"]
];

/* ───────── State ───────── */
const S={brand:"ttc",page:"overview",items:[],products:[],chatLoaded:{},catalogDocs:[],stores:{},catVer:0,sync:null,mcp:null,prodKind:"",prodLimit:60,approvals:[],audit:[],campaigns:[],media:[],guidelines:{},settings:{paused:false},
 mode:"loading",db:null,user:null,sample:null,assets:null,me:null,canApprove:false,
 cal:{view:"month",cursor:new Date(),channel:"",series:"",status:"",archived:false},
 edit:null,slideIx:0,queueTab:"waiting",chat:{ttc:[],cto:[]},chatBusy:false,busy:"",
 navCollapsed:false,navOpen:false,pop:"",campEdit:null,prodQ:"",prodCol:"",prodNeglected:false,names:{}};
const $=s=>document.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const uid=()=>Math.random().toString(36).slice(2,9)+Date.now().toString(36).slice(-5);
const reEsc=w=>w.replace(/[.*+?^$(){}|[\]\\]/g,"\\$&");
const clone=o=>JSON.parse(JSON.stringify(o));
const nowIso=()=>new Date().toISOString();
const parseLocal=s=>{if(!s)return null;const[a,t="00:00"]=s.split("T");const[y,m,d]=a.split("-").map(Number);const[h,mi]=t.split(":").map(Number);return new Date(y,m-1,d,h||0,mi||0)};
const fmtD=(s,o={weekday:"short",day:"numeric",month:"short"})=>s?parseLocal(s).toLocaleDateString("en-AU",o):"Not scheduled";
const fmtT=s=>s?parseLocal(s).toLocaleTimeString("en-AU",{hour:"numeric",minute:"2-digit"}):"";
const ago=iso=>{if(!iso)return"";const m=Math.round((Date.now()-new Date(iso))/60000);if(m<1)return"just now";if(m<60)return m+" min ago";const h=Math.round(m/60);if(h<24)return h+" h ago";const d=Math.round(h/24);return d<8?d+" d ago":new Date(iso).toLocaleDateString("en-AU",{day:"numeric",month:"short"})};
const guide=b=>{const base=BRANDS[b],o=S.guidelines[b]||{};const g={...base,...o};g.avoidList=String(g.avoid||"").split(",").map(s=>s.trim()).filter(Boolean);g.cadence=base.cadence;return g};
const brandItems=(b=S.brand)=>S.items.filter(i=>i.brand===b&&!i.archived);
// Each brand's products come only from the Shopify store linked to that brand. Until a brand has an
// imported catalogue it shows its labelled demo products instead; the two are never mixed.
let _cat={ver:-1};
function catalog(){if(_cat.ver!==S.catVer){const map={};S.catalogDocs.forEach(d=>{const s=S.stores[d.brand];if(!s||d.storeKey!==s.key)return;(map[d.brand]||(map[d.brand]=[])).push(...(d.items||[]))});
 Object.values(map).forEach(l=>l.sort((a,c)=>(a.kind===c.kind?0:a.kind==="tile"?-1:1)||a.name.localeCompare(c.name)));
 _cat={ver:S.catVer,map,byId:new Map(Object.values(map).flat().map(p=>[p.id,p]))}}return _cat}
const hasCatalog=b=>!!catalog().map[b]?.length;
const products=(b=S.brand)=>hasCatalog(b)?catalog().map[b]:S.products.filter(p=>p.brand===b&&!p.archived).sort((a,c)=>a.name.localeCompare(c.name));
const prod=id=>catalog().byId.get(id)||S.products.find(p=>p.id===id);
// Product visuals: a real uploaded photo linked to the product wins; demo products fall back to an
// illustrative swatch; real (Shopify) products without a photo show a plain placeholder, never an approximation.
function pimg(p){if(!p)return"";const m=S.media.find(x=>x.productId===p.id&&x.approved)||S.media.find(x=>x.productId===p.id);return m?mediaUrl(m):""}
function pvis(p,tag="span",extra=""){const u=pimg(p);if(u)return`<img class="sw" src="${esc(u)}" alt="" ${extra}>`;if(p?.source==="demo"&&p.swatch)return`<${tag} class="sw" style="${swatch(p)}" ${extra}></${tag}>`;return`<${tag} class="sw nophoto" ${extra}>No photo</${tag}>`}
const PRICE_RE=/\$\s?\d|\bAUD\s?\d|\d\s?(?:\/|per)\s?(?:m²|m2|sqm|square metre|sheet|box)\b/i;
const STOCK_RE=/\b(in stock|out of stock|available now|limited stock|low stock|sold out|back in stock|selling fast|while stocks last|pre-?order|on sale now)\b/i;
const nums=s=>(String(s).match(/\d+(?:\.\d+)?/g)||[]);
// Facts in copy must trace back to linked product data. Used as hard errors for AI drafts and warnings in QC.
function factIssues(text,pids,brand){
 const out=[],ps=(pids||[]).map(prod).filter(Boolean);
 const specs=ps.map(p=>`${p.name} ${p.size} ${p.finish} ${p.colour} ${Object.values(p.specs||{}).join(" ")} ${(p.tags||[]).join(" ")} ${p.desc}`).join(" ");
 const specDims=ps.map(p=>nums(p.size).join("x")).join(" "),specNums=new Set(nums(specs));
 if(PRICE_RE.test(text))out.push("Mentions a price. Prices come from Shopify, not the copy.");
 if(STOCK_RE.test(text))out.push("Mentions stock or availability. Confirm it in Shopify instead.");
 (text.match(/\b\d{2,4}(?:\s?[x×*]\s?\d{1,4}){1,2}\s?mm\b|\b\d{1,4}(?:\.\d+)?\s?mm\b/gi)||[]).forEach(d=>{const n=nums(d);const ok=n.length>1?specDims.includes(n.join("x")):specNums.has(n[0]);if(!ok)out.push(`Mentions ${d.trim()}, which isn't in the linked product data.`)});
 (text.match(/\b(?:R(?:9|10|11|12|13)|P[1-5])\b/g)||[]).forEach(x=>{if(!new RegExp("\\b"+x+"\\b").test(specs))out.push(`Mentions slip rating ${x}, which isn't in the linked product data.`)});
 const lowT=text.toLowerCase();products(brand).forEach(p=>{if(p.name.length<5||(pids||[]).includes(p.id)||!lowT.includes(p.name.toLowerCase()))return;if(new RegExp("\\b"+reEsc(p.name)+"\\b","i").test(text))out.push(`Names ${p.name} but it isn't linked to the post.`)});
 if(/https?:\/\/|\bwww\./i.test(text))out.push("Contains a web address. Product links are attached from the product library.");
 return[...new Set(out)];
}
const copyText=it=>`${it.title||""}\n${it.caption||""}\n${(it.slides||[]).map(s=>s.heading+" "+s.body).join("\n")}\n${(it.shots||[]).map(s=>s.onScreenText).join("\n")}`;
const mediaById=id=>S.media.find(m=>m.id===id);
const mediaUrl=m=>m?(m.assetId?"/_blob/"+m.assetId:m.url||""):"";
function lastFeatured(pid){let best=null;S.items.forEach(i=>{if(i.archived||!(i.productIds||[]).includes(pid)||!i.scheduledAt)return;if(!["Approved","Scheduled","Published"].includes(i.status))return;if(!best||i.scheduledAt>best)best=i.scheduledAt});return best}
function neglected(p){const lf=lastFeatured(p.id);return!lf||(Date.now()-parseLocal(lf))>30*864e5}
function swatch(p){const s=p?.swatch;if(!s)return"background:var(--surface-2)";
 switch(s.p){
  case"vein":return`background:linear-gradient(118deg,transparent 44%,${s.a}66 46%,transparent 49%),linear-gradient(162deg,transparent 58%,${s.a}55 60%,transparent 62%),linear-gradient(80deg,transparent 70%,${s.a}33 71%,transparent 73%),${s.b}`;
  case"speckle":return`background:radial-gradient(${s.a} 1.2px,transparent 1.7px) 0 0/11px 13px,radial-gradient(${s.c||s.a} 1.5px,transparent 2px) 6px 4px/17px 15px,${s.b}`;
  case"fluted":return`background:repeating-linear-gradient(90deg,${s.b} 0 9px,${s.a} 9px 10px,${s.b} 10px 14px)`;
  case"zellige":return`background:linear-gradient(135deg,rgba(255,255,255,.25),transparent 40%),linear-gradient(90deg,${s.a} 1.5px,transparent 1.5px) 0 0/34px 100%,linear-gradient(${s.a} 1.5px,transparent 1.5px) 0 0/100% 12px,${s.b}`;
  case"herring":return`background:repeating-linear-gradient(45deg,${s.b} 0 12px,${s.a} 12px 13px),${s.b}`;
  case"hex":return`background:radial-gradient(circle,${s.b} 52%,${s.a} 54% 60%,transparent 62%) 0 0/20px 20px,radial-gradient(circle,${s.b} 52%,${s.a} 54% 60%,transparent 62%) 10px 10px/20px 20px,${s.b}`;
  case"subway":return`background:linear-gradient(${s.a} 1.5px,transparent 1.5px) 0 0/100% 14px,linear-gradient(90deg,${s.a} 1.5px,transparent 1.5px) 0 0/48px 28px,linear-gradient(90deg,${s.a} 1.5px,transparent 1.5px) 24px 14px/48px 28px,${s.b}`;
  default:return`background:linear-gradient(${s.a} 1px,transparent 1px) 0 0/100% 50%,linear-gradient(90deg,${s.a} 1px,transparent 1px) 0 0/50% 100%,${s.b}`}}

/* ───────── Icons ───────── */
const IC={overview:'<rect x="3" y="3" width="7.5" height="7.5" rx="1"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1"/>',
assistant:'<path d="M12 3l1.8 4.7 4.7 1.8-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.7 1.8 1.8.7-1.8.7L19 20l-.7-1.8-1.8-.7 1.8-.7z"/>',
calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
studio:'<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
approvals:'<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16.5 9.5"/>',
campaigns:'<path d="M5 21V4"/><path d="M5 4h12l-2.5 4L17 12H5"/>',
products:'<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M12 4v16M4 12h16"/>',
media:'<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
publishing:'<path d="M21 3L10 14"/><path d="M21 3l-7 18-4-7-7-4z"/>',
analytics:'<path d="M5 20V11M11 20V5M17 20v-6M3 20h18"/>',
brand:'<path d="M4 20l6-16h4l6 16"/><path d="M7 13h10"/>',
automations:'<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
integrations:'<path d="M9 7V2M15 7V2M6 7h12v4a6 6 0 0 1-12 0zM12 17v5"/>',
bell:'<path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
plus:'<path d="M12 5v14M5 12h14"/>',menu:'<path d="M4 7h16M4 12h16M4 17h16"/>',x:'<path d="M6 6l12 12M18 6L6 18"/>',
l:'<path d="M15 6l-6 6 6 6"/>',r:'<path d="M9 6l6 6-6 6"/>',d:'<path d="M6 9l6 6 6-6"/>',
side:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
pause:'<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>',
lock:'<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
upload:'<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',copy:'<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
check:'<path d="M5 12.5l4.5 4.5L19 7.5"/>'};
const icon=(n,s=18)=>`<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n]||""}</svg>`;
const pill=s=>`<span class="pill st-${sl(s)}"><i></i>${esc(s)}</span>`;

/* ───────── Persistence ───────── */
const COLS={content:"items",approvals:"approvals",audit:"audit",campaigns:"campaigns",media:"media",products:"products",catalog:"catalogDocs"};
function errText(e){const c=e?.code;if(c==="invalid_argument")return"You don't have permission to change this. Ask the studio owner for Editor access.";if(c==="quota_exceeded")return"Storage is full. Delete old items to make room.";if(c==="revoked")return"Access to this studio changed. Reload to continue.";return"Couldn't save. Check your connection and try again."}
async function put(col,id,data){
 if(S.db){try{await S.db.collection(col).doc(id).set(data)}catch(e){toast(errText(e),"error");throw e}return}
 if(col==="settings"){S.settings=data}else if(col==="guidelines"){S.guidelines[id]=data}else if(col==="stores"){S.stores[id]={...data,id};S.catVer++}
 else{const k=COLS[col],arr=S[k],i=arr.findIndex(x=>x.id===id);const v={...data,id};if(i>=0)arr[i]=v;else arr.push(v);if(col==="audit")arr.sort((a,b)=>b.at.localeCompare(a.at))}
 queueRender();
}
async function remove(col,id){
 if(S.db){try{await S.db.collection(col).doc(id).delete()}catch(e){toast(errText(e),"error");throw e}return}
 if(col==="stores"){delete S.stores[id];S.catVer++;queueRender();return}const k=COLS[col];S[k]=S[k].filter(x=>x.id!==id);if(col==="catalog")S.catVer++;queueRender();
}
function strip(o){const c=clone(o);delete c.id;return c}
async function saveItem(it){it.updatedAt=nowIso();await put("content",it.id,strip(it))}
function audit(action,it,detail="",kind="person"){return writeAudit({at:nowIso(),actor:S.me||"you",actorKind:kind,action,contentId:it?.id||"",title:it?.title||"",brand:it?.brand||S.brand,detail})}

let renderQueued=false,pendingRender=false;
function queueRender(){if(renderQueued)return;renderQueued=true;requestAnimationFrame(()=>{renderQueued=false;
 const a=document.activeElement;if(a&&$("#view").contains(a)&&a.matches("input,textarea,select")){pendingRender=true;renderChrome();return}render()})}
document.addEventListener("focusout",()=>{if(pendingRender)setTimeout(()=>{const a=document.activeElement;if(!(a&&$("#view").contains(a)&&a.matches("input,textarea,select"))){pendingRender=false;render()}},0)});

async function init(){
 route();render();
 const c=window.claude;
 if(!c||typeof c.use!=="function"){startLocal();return}
 c.use("sample").then(s=>{S.sample=s;queueRender()});
 c.use("assets").then(a=>{S.assets=a;queueRender()});
 c.use("mcp").then(m=>{S.mcp=m;queueRender()});
 const[db,user]=await Promise.all([c.use("db"),c.use("user")]);
 S.user=user;
 if(user){try{S.me=await user.id();S.canApprove=!!(await user.canEdit())||!!(await user.isOwner());const me=await user.me();S.myName=String(me?.name||"").split(" ")[0]}catch{}}
 if(!db){startLocal();return}
 S.db=db;S.mode="connecting";subscribe();
}
function startLocal(){S.products=clone(DEMO_PRODUCTS);const d=demoSeed(new Date());S.items=d.items;S.approvals=d.approvals;S.audit=d.audit.sort((a,b)=>b.at.localeCompare(a.at));S.mode="local";S.canApprove=true;render()}
function subscribe(){
 const db=S.db;let got=false;const t=setTimeout(()=>{if(!got){S.mode="slow";render()}},10000);
 const on=(q,fn)=>q.onSnapshot(snap=>{if(!got){got=true;clearTimeout(t)}S.mode="live";fn(snap);queueRender()},e=>{if(e.code==="revoked")S.mode="revoked";console.warn(e);queueRender()});
 const list=s=>s.docs.map(d=>({...clone(d.data()),id:d.id}));
 on(db.collection("content"),s=>{S.items=list(s)});
 on(db.collection("approvals"),s=>{S.approvals=list(s)});
 on(db.collection("audit").orderBy("at","desc").limit(120),s=>{S.audit=list(s)});
 on(db.collection("campaigns"),s=>{S.campaigns=list(s)});
 on(db.collection("media"),s=>{S.media=list(s)});
 on(db.collection("products"),s=>{S.products=list(s)});
 on(db.collection("catalog"),s=>{S.catalogDocs=s.docs.map(d=>({...d.data(),id:d.id}));S.catVer++});
 on(db.collection("stores"),s=>{const o={};s.docs.forEach(d=>o[d.id]={...clone(d.data()),id:d.id});S.stores=o;S.catVer++});
 if(S.canApprove)on(db.collection("auditq"),s=>{foldAuditQueue(s.docs)});
 on(db.collection("guidelines"),s=>{const g={};s.docs.forEach(d=>g[d.id]=clone(d.data()));S.guidelines=g});
 on(db.doc("settings/global"),d=>{S.settings=d.exists?clone(d.data()):{paused:false}});
}
async function resolveNames(ids){
 if(!S.user)return;const need=[...new Set(ids)].filter(i=>i&&i!=="demo"&&i!=="you"&&!(i in S.names));if(!need.length)return;
 need.forEach(i=>S.names[i]="");try{const ps=await S.user.profiles(need);need.forEach(i=>S.names[i]=ps?.[i]?.name||"")}catch{}queueRender();
}
const who=(id,kind)=>kind==="ai"?"AI assistant":id==="demo"?"Demo":id===S.me||id==="you"?"You":(S.names[id]||"A teammate");

/* ───────── Approval logic ───────── */
const approvalOf=it=>S.approvals.find(a=>a.id===it.approvalId);
// Verified = an approval record exists (approval records are editor-only writes) and the
// content is byte-for-byte what was approved.
function verified(it){const ap=approvalOf(it);return!!ap&&ap.contentId===it.id&&ap.fingerprint===fingerprint(it)&&it.approvedFingerprint===ap.fingerprint}
function qc(it){
 const g=guide(it.brand),out=[],add=(l,m)=>out.push({l,m});
 const text=`${it.title||""} ${it.caption||""} ${(it.slides||[]).map(s=>s.heading+" "+s.body).join(" ")}`;
 if(!String(it.title||"").trim())add("error","Add a title.");
 if(!it.scheduledAt)add("error","Pick a date and time.");
 else if(parseLocal(it.scheduledAt)<new Date()&&!["Published","Failed"].includes(it.status))add("warn","The scheduled time has passed.");
 if(!String(it.caption||"").trim())add("error",it.channel==="Email"?"Write the email copy.":"Write a caption.");
 if(it.channel==="Instagram"&&(it.caption||"").length>2200)add("error","Instagram captions can be at most 2,200 characters.");
 const h=(it.hashtags||[]).length;if(h>30)add("error","Instagram allows at most 30 hashtags.");else if(h>15)add("warn","More than 15 hashtags can read as spammy.");
 const hits=g.avoidList.filter(w=>new RegExp("\\b"+reEsc(w)+"\\b","i").test(text));
 if(hits.length)add("warn",`Off-brand for ${g.short}: ${hits.join(", ")}.`);
 factIssues(copyText(it),it.productIds,it.brand).forEach(m=>add("warn",m));
 if(it.format==="Carousel"&&(it.slides||[]).length<2)add("warn","A carousel needs at least 2 slides.");
 if(["Reel","Story"].includes(it.format)&&!(it.shots||[]).length)add("warn","Add a shot list.");
 if((it.productIds||[]).some(id=>!prod(id)))add("error","A linked product isn't in the product library.");
 const meds=(it.mediaIds||[]).map(mediaById);
 if(meds.some(m=>!m))add("error","An attached image is missing from the media library.");
 else if(meds.some(m=>!m.approved))add("error","Uses imagery that isn't marked approved for final use.");
 if(!meds.length&&!["Email","Text post"].includes(it.format))add("warn","No creative attached yet.");
 if(!out.some(o=>o.l==="error"))out.push({l:"ok",m:out.length?"No blocking issues.":"All checks passed."});
 return out;
}
const qcBlocked=it=>qc(it).some(o=>o.l==="error");

async function approve(id){
 const it=S.items.find(i=>i.id===id);if(!it)return;
 if(!S.canApprove)return toast("Only Editors can approve content.","error");
 if(it.status!=="Needs Review")return toast("Only content in review can be approved.");
 if(qcBlocked(it))return toast("Fix the quality check errors before approving.","error");
 const fp=fingerprint(it),apId="ap-"+uid(),snapshot={};FP_FIELDS.forEach(k=>snapshot[k]=it[k]===undefined?null:clone(it[k]));
 try{
  await put("approvals",apId,{contentId:it.id,brand:it.brand,title:it.title,fingerprint:fp,snapshot,approvedBy:S.me||"you",approvedAt:nowIso()});
  await saveItem({...clone(it),status:"Approved",approvedFingerprint:fp,approvalId:apId,reviewNote:""});
  audit("Approved",it,"Version "+fp);toast("Approved. This exact version is now locked.");
 }catch{}
}
async function requestChanges(id){
 const it=S.items.find(i=>i.id===id);if(!it)return;
 const note=await ask({title:"Request changes",body:"Tell the writer what to change. It goes back to Changes requested.",input:true,placeholder:"For example: lead with the outdoor use and shorten the caption.",confirm:"Request changes"});
 if(note===false)return;
 await saveItem({...clone(it),status:"Changes Requested",reviewNote:note,approvedFingerprint:null,approvalId:null});
 audit("Changes requested",it,note);toast("Changes requested.");
}
async function reject(id){
 const it=S.items.find(i=>i.id===id);if(!it)return;
 const note=await ask({title:"Reject this post?",body:"It's removed from the queue and calendar. You can find it again under Archived in the calendar's list view.",input:true,placeholder:"Reason (optional)",confirm:"Reject",danger:true});
 if(note===false)return;
 await saveItem({...clone(it),status:"Idea",archived:true,reviewNote:note,approvedFingerprint:null,approvalId:null});
 audit("Rejected",it,note);toast("Rejected and archived.");
}
async function submitForReview(it){
 if(qcBlocked(it)){toast("Fix the quality check errors first.","error");return false}
 it.status="Needs Review";it.reviewNote=it.reviewNote||"";return true;
}
async function guardPublish(it){
 if(S.settings.paused){toast("Publishing is paused. Turn off the emergency pause in Settings first.","error");return false}
 if(!verified(it)){toast("This version doesn't match its approval. Send it back for review.","error");return false}
 return true;
}
async function markScheduled(id){
 const it=S.items.find(i=>i.id===id);if(!it||it.status!=="Approved")return;if(!(await guardPublish(it)))return;
 const ok=await ask({title:"Scheduled in Later?",body:`Confirm you've scheduled this exact approved version in Later for ${fmtD(it.scheduledAt)} at ${fmtT(it.scheduledAt)}. Nothing is sent from here until a platform is connected.`,confirm:"Yes, it's scheduled"});
 if(!ok)return;
 await saveItem({...clone(it),status:"Scheduled",publishStatus:"Scheduled manually in Later",scheduledConfirmedAt:nowIso()});audit("Marked scheduled in Later",it);toast("Marked as scheduled.");
}
async function markPublished(id){
 const it=S.items.find(i=>i.id===id);if(!it)return;
 if(it.publishedAt||it.status==="Published")return toast("Already marked as published.");
 if(!["Approved","Scheduled"].includes(it.status))return;if(!(await guardPublish(it)))return;
 const ok=await ask({title:"Mark as published?",body:"Only do this once the post is live on the platform.",confirm:"Mark as published"});if(!ok)return;
 await saveItem({...clone(it),status:"Published",publishStatus:"Posted — confirmed manually",publishedAt:toLocal(new Date())});audit("Marked published",it);toast("Marked as published.");
}
async function markFailed(id){
 const it=S.items.find(i=>i.id===id);if(!it)return;
 const note=await ask({title:"Mark as failed",body:"Record what went wrong so it can be retried.",input:true,placeholder:"For example: Later rejected the video format.",confirm:"Mark as failed",danger:true});
 if(note===false)return;
 await saveItem({...clone(it),status:"Failed",publishStatus:note||"Failed"});audit("Publishing failed",it,note);
}
async function retry(id){
 const it=S.items.find(i=>i.id===id);if(!it)return;
 if(!verified(it)){await saveItem({...clone(it),status:"Needs Review",approvedFingerprint:null,approvalId:null,publishStatus:""});audit("Approval invalidated",it,"Changed after approval");return toast("Sent back for review because it changed after approval.")}
 await saveItem({...clone(it),status:"Approved",publishStatus:""});audit("Retry queued",it);toast("Back in Ready to schedule.");
}
async function reschedule(id,day){
 const it=S.items.find(i=>i.id===id);if(!it)return;
 if(it.status==="Published")return toast("Published posts can't be moved.");
 const time=(it.scheduledAt||"T18:00").split("T")[1]||"18:00";const next={...clone(it),scheduledAt:day+"T"+time};
 if(next.scheduledAt===it.scheduledAt)return;
 if(it.approvedFingerprint){
  const ok=await ask({title:"Move an approved post?",body:it.status==="Scheduled"?"Changing the date removes its approval and sends it back to review. Remember to remove it from Later too.":"Changing the date removes its approval and sends it back to review.",confirm:"Move and re-review"});
  if(!ok)return;next.status="Needs Review";next.approvedFingerprint=null;next.approvalId=null;next.publishStatus="";
  await saveItem(next);audit("Approval invalidated",it,"Rescheduled to "+fmtD(next.scheduledAt));
 }else await saveItem(next);
 audit("Rescheduled",it,fmtD(next.scheduledAt)+" "+fmtT(next.scheduledAt));
}
function newItem(o={}){
 const d=o.date||ymd(addDays(new Date(),1));const dow=parseLocal(d+"T00:00").getDay();const g=guide(S.brand);
 return{id:"c-"+uid(),brand:S.brand,title:"",series:g.cadence[dow]||"Inspiration",channel:"Instagram",format:"Single image",scheduledAt:d+"T18:00",status:"Idea",
  caption:"",hashtags:[],productIds:[],mediaIds:[],slides:[],shots:[],brief:"",direction:"",campaignId:"",reviewNote:"",publishStatus:"",approvedFingerprint:null,approvalId:null,archived:false,revision:0,createdBy:S.me||"you",createdAt:nowIso(),...o.fields};
}
function openStudio(it){S.edit=clone(it);S.slideIx=0;go("studio")}

/* ───────── UI helpers ───────── */
function toast(msg,kind=""){const t=document.createElement("div");t.textContent=msg;if(kind)t.className=kind;$("#toast").append(t);setTimeout(()=>t.remove(),kind==="error"?5200:3200)}
function ask({title,body="",input=false,placeholder="",confirm="Confirm",danger=false}){
 return new Promise(res=>{const m=$("#modal");const prev=document.activeElement;
  m.innerHTML=`<div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="mt"><h3 id="mt">${esc(title)}</h3>${body?`<p>${esc(body)}</p>`:""}${input?`<textarea id="mi" placeholder="${esc(placeholder)}"></textarea>`:""}<div class="modal-actions"><button class="btn ghost" data-m="0">Cancel</button><button class="btn ${danger?"danger":"primary"}" data-m="1">${esc(confirm)}</button></div></div>`;
  m.hidden=false;(input?$("#mi"):m.querySelector('[data-m="1"]')).focus();
  const close=ok=>{const v=$("#mi")?.value?.trim()??"";m.hidden=true;m.innerHTML="";m.onclick=null;document.removeEventListener("keydown",key);prev?.focus?.();res(ok?(input?v:true):false)};
  const key=e=>{if(e.key==="Escape")close(false)};document.addEventListener("keydown",key);
  m.onclick=e=>{if(e.target===m)return close(false);const b=e.target.closest("[data-m]");if(b)close(b.dataset.m==="1")};
 })}
function sampleErr(e){const c=e?.code;if(c==="not_granted")return"AI isn't allowed in this view. Allow Claude when asked to use AI features.";if(c==="rate_limited")return"Too many AI requests at once. Wait a moment and try again.";if(c==="cancelled")return"Stopped.";if(c==="invalid_json")return"The AI reply couldn't be read. Try again.";return"The AI request didn't complete. Try again."}
function md(s){
 const lines=esc(s).split("\n");let out="",inList=false;
 const inline=t=>t.replace(/\*\*(.+?)\*\*/g,"<b>$1</b>").replace(/(^|[^*])\*(?!\s)(.+?)\*/g,"$1<em>$2</em>");
 for(const l of lines){const li=l.match(/^\s*(?:[-*•]|\d+\.)\s+(.*)/);
  if(li){if(!inList){out+="<ul>";inList=true}out+=`<li>${inline(li[1])}</li>`;continue}
  if(inList){out+="</ul>";inList=false}
  const h=l.match(/^#{1,4}\s+(.*)/);if(h){out+=`<h4>${inline(h[1])}</h4>`;continue}
  if(l.trim())out+=`<p>${inline(l)}</p>`}
 if(inList)out+="</ul>";return out}
