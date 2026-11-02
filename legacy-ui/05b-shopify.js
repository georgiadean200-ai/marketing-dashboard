
/* ───────── Shopify: one locked store per brand ───────── */
const SHOP_SERVER="Shopify";
const normDomain=d=>String(d||"").toLowerCase().replace(/^https?:\/\//,"").replace(/^www\./,"").replace(/\/.*$/,"");
const ACCESSORY_RE=/\b(drains?|grates?|trowels?|adhesives?|grouts?|sealers?|sealants?|trims?|spacers?|primers?|membranes?|levell?ing|tools?|sponges?|floats?|cutters?|blades?|buckets?|waterproof\w*|silicones?|clips?|wedges?|mixers?|nippers?|flanges?|cleaners?|caulk\w*)\b/i;
const COLOUR_WORDS=["white","black","grey","gray","charcoal","beige","cream","ivory","sand","taupe","brown","walnut","oak","blue","navy","dark blue","green","sage","olive","pink","blush","terracotta","red","yellow","gold","brass","copper","silver","chrome","nickel","bronze","natural","multi"];
const FINISH_WORDS=["matt","matte","gloss","glossy","polished","honed","lappato","satin","textured","structured","rustic","tumbled"];
// The query the studio sends through the Shopify connector: full records, compact fields, spec metafields.
const SHOP_QUERY=`query ($first: Int!, $after: String) { shop { name primaryDomain { host } currencyCode } products(first: $first, after: $after, query: "status:active", sortKey: ID) { pageInfo { hasNextPage endCursor } nodes { id title handle onlineStoreUrl vendor productType tags totalInventory updatedAt description(truncateAt: 360) variants(first: 5) { nodes { title sku price inventoryQuantity } } featuredMedia { preview { image { url } } } thickness: metafield(namespace: "custom", key: "thickness") { value } edge: metafield(namespace: "custom", key: "edge") { value } slip: metafield(namespace: "custom", key: "slip_rating") { value } material: metafield(namespace: "custom", key: "material") { value } suitable: metafield(namespace: "custom", key: "suitable_for") { value } soldPer: metafield(namespace: "custom", key: "sold_per") { value } boxQty: metafield(namespace: "custom", key: "box_qty") { value } grout: metafield(namespace: "custom", key: "recommended_grout") { value } } } }`;
const SIZE_RE=/(\d{2,4})\s*[x×]\s*(\d{2,4})(?:\s*[x×]\s*(\d{1,3}))?/i;
// Turns one Shopify product into a studio catalogue record. Only facts present in Shopify are kept:
// size comes from the size tag, then the title, then the URL handle; specs come from TTC's custom fields.
function mapShopProduct(n,brand,shopDomain){
 const num=String(n.id||"").split("/").pop();
 const title=String(n.title||"").replace(/\s+/g," ").trim(),tags=(n.tags||[]).map(String);
 const sizeTag=tags.find(t=>/^\s*\d{2,4}\s*x\s*\d{2,4}\s*$/i.test(t));
 const m=(sizeTag||"").match(SIZE_RE)||title.match(SIZE_RE)||String(n.handle||"").replace(/-/g," ").match(SIZE_RE);
 const size=m?`${m[1]} × ${m[2]}${m[3]?" × "+m[3]:""} mm`:"";
 const low=` ${title} `.toLowerCase(),lowTags=tags.map(t=>t.toLowerCase());
 const colour=COLOUR_WORDS.filter(c=>low.includes(" "+c+" ")||lowTags.includes(c)).slice(0,3).map(c=>c[0].toUpperCase()+c.slice(1)).join(", ");
 const finishT=FINISH_WORDS.filter(f=>new RegExp("\\b"+f+"\\b","i").test(title));
 const finishList=finishT.length?finishT:FINISH_WORDS.filter(f=>lowTags.includes(f));
 const finish=[...finishList.map(f=>f[0].toUpperCase()+f.slice(1)),...(/\bin out\b/i.test(title)?["In Out"]:[]),...(/\bexternal\b/i.test(title)?["External"]:[])].slice(0,2).join(", ");
 const vs=(n.variants?.nodes||(n.variants?.edges||[]).map(e=>e.node)||[]).filter(Boolean);
 const prices=vs.map(v=>Number(v.price)).filter(x=>!isNaN(x));
 const minP=prices.length?Math.min(...prices):Number(n.priceRangeV2?.minVariantPrice?.amount);
 const inv=typeof n.totalInventory==="number"?n.totalInventory:null;
 const mv=k=>{const v=n[k]?.value;return v==null?"":String(v).trim()};
 const specs={thickness:mv("thickness"),edge:mv("edge"),slipRating:mv("slip"),material:mv("material"),suitableFor:mv("suitable"),soldPer:mv("soldPer"),boxQty:mv("boxQty"),grout:mv("grout")};
 Object.keys(specs).forEach(k=>{if(!specs[k])delete specs[k]});
 const host=String(shopDomain).replace(/^https?:\/\//,"").replace(/\/$/,"");
 return{id:`shop-${brand}-${num}`,brand,source:"shopify",gid:String(n.id||""),handle:String(n.handle||""),name:title,
  collection:String(n.productType||n.vendor||""),vendor:String(n.vendor||""),tags,size,colour,finish,specs,
  kind:ACCESSORY_RE.test(title)?"accessory":"tile",
  variants:vs.length>1?vs.map(v=>({title:String(v.title),sku:String(v.sku||""),price:String(v.price||""),stock:v.inventoryQuantity??null})):[],
  sku:vs.length===1?String(vs[0].sku||""):"",
  price:isNaN(minP)?"":`${vs.length>1?"From ":""}$${minP.toFixed(2)}`,
  stock:inv,availability:inv==null?"Not tracked":inv>0?"In stock":inv===0?"Out of stock":"Backorder or not tracked",
  desc:String(n.description||"").replace(/\s*\.\.\.$|…$/,"").slice(0,400),
  url:String(n.onlineStoreUrl||"")||(n.handle?`https://${host}/products/${n.handle}`:""),
  onlineStore:!!n.onlineStoreUrl,
  shopifyImage:String(n.featuredMedia?.preview?.image?.url||""),updatedAt:String(n.updatedAt||"")};
}
// Connector results arrive as structured JSON or JSON inside text; find the object we need.
function findJson(res,test){
 const cands=[res?.payload,res?.structuredContent,...((res?.content)||[]).map(b=>b?.text)];
 for(const c of cands){if(c==null)continue;
  if(typeof c==="string"){const a=c.indexOf("{"),z=c.lastIndexOf("}");for(const s of [c,a>=0?c.slice(a,z+1):""]){if(!s)continue;try{const o=JSON.parse(s);if(test(o))return o}catch{}}}
  else if(test(c))return c}
 return null;
}
function shopErr(e){
 switch(e?.code){
  case"needs_reauth":return"Your Shopify connection has expired. Reconnect Shopify in claude.ai Settings → Connectors, then try again.";
  case"server_not_connected":return"The Shopify connector isn't added to your Claude account. Add it in claude.ai Settings → Connectors.";
  case"approval_required":case"not_granted":return"The studio needs your permission to use Shopify. Allow it when claude.ai asks, then try again.";
  case"not_in_manifest":case"blocked_by_policy":return"This studio isn't allowed to use Shopify for your account. Ask your Claude workspace admin.";
  case"selection_required":return"More than one Shopify connector is available. Choose one when claude.ai asks.";
  case"server_unavailable":return"Shopify didn't respond. Wait a moment and try again.";
  case"shape":return"Shopify answered in an unexpected format, so nothing was imported.";
  case"tool_error":return"Shopify refused the request: "+String(e.message||"").slice(0,160);
  default:return"The Shopify request didn't complete. Nothing was changed.";
 }
}
async function shopCall(tool,input){return S.mcp.callTool(SHOP_SERVER,tool,input,{cache:false})}
async function checkShop(){
 const info=await shopCall("get-shop-info",{});
 const shop=findJson(info,o=>o&&typeof o==="object"&&typeof o.domain==="string");
 if(!shop)throw{code:"shape"};
 return{name:String(shop.name||""),domain:String(shop.domain),key:normDomain(shop.domain),currency:String(shop.currencyCode||"")};
}
function storeConflict(b,shop){
 const g=guide(b);
 const other=Object.entries(S.stores).find(([k,v])=>k!==b&&v?.key===shop.key);
 if(other)return`The Shopify connector is signed into ${shop.name} (${shop.key}), which is linked to ${guide(other[0]).name}. Switch the connector to ${g.name}'s store first.`;
 const bound=S.stores[b];
 if(bound&&bound.key!==shop.key)return`The Shopify connector is signed into ${shop.name} (${shop.key}), but ${g.name} is linked to ${bound.name} (${bound.key}). Switch the connector back to ${bound.name} to import.`;
 return"";
}
async function checkConnection(){
 if(!S.mcp)return;S.sync={busy:true,msg:"Checking which store the Shopify connector is signed into…",brand:S.brand};render();
 try{const shop=await checkShop();const c=storeConflict(S.brand,shop);
  S.sync={busy:false,brand:S.brand,msg:c||`Signed into ${shop.name} (${shop.key}).${S.stores[S.brand]?" This matches the linked store.":" Not linked to "+guide(S.brand).short+" yet."}`,err:!!c};
 }catch(e){S.sync={busy:false,brand:S.brand,msg:shopErr(e),err:true}}render();
}
async function importShopify(){
 const b=S.brand,g=guide(b);
 if(!S.mcp)return;if(!S.canApprove)return toast("Only Editors can import products.","error");
 S.sync={busy:true,brand:b,msg:"Checking which store the Shopify connector is signed into…"};render();
 try{
  const shop=await checkShop();const c=storeConflict(b,shop);
  if(c){S.sync={busy:false,brand:b,msg:c,err:true};render();return}
  if(!S.stores[b]){
   S.sync.busy=false;render();
   const ok=await ask({title:`Link ${shop.name} to ${g.name}?`,body:`The Shopify connector is signed into ${shop.name} (${shop.key}). Once linked, ${g.short} will only ever import products from this store, and the studio will refuse imports from any other.`,confirm:"Link and import"});
   if(!ok){S.sync=null;render();return}
   await put("stores",b,{key:shop.key,domain:shop.domain,name:shop.name,currency:shop.currency,linkedAt:nowIso(),linkedBy:S.me||"you"});
   audit("Shopify store linked",null,`${shop.name} (${shop.key})`);
  }
  S.sync={busy:true,brand:b,msg:"Importing products…"};render();
  const all=[];let after=null,pages=0;
  do{
   const r=await shopCall("graphql_query",{query:SHOP_QUERY,first:50,...(after?{after}:{})});
   const data=findJson(r,o=>!!o?.data?.products?.nodes);
   if(!data)throw{code:"shape"};
   if(data.data.shop?.primaryDomain?.host&&normDomain(data.data.shop.primaryDomain.host)!==shop.key)throw{code:"tool_error",message:"The store answering the import isn't the linked store. Nothing was saved."};
   const p=data.data.products;
   p.nodes.forEach(n=>n&&all.push(mapShopProduct(n,b,shop.domain)));
   after=p.pageInfo?.hasNextPage?p.pageInfo.endCursor:null;pages++;
   S.sync.msg=`Importing products… ${all.length.toLocaleString()} so far`;const el=$("#syncMsg");if(el)el.textContent=S.sync.msg;
  }while(after&&pages<200);
  // Re-check the store didn't change mid-import (someone switching the connector).
  const again=await checkShop();if(again.key!==shop.key)throw{code:"tool_error",message:"The connected store changed during the import. Nothing was saved; try again."};
  const syncId=uid(),at=nowIso(),CH=60,n=Math.ceil(all.length/CH);
  for(let i=0;i<n;i++){S.sync.msg=`Saving ${Math.min((i+1)*CH,all.length).toLocaleString()} of ${all.length.toLocaleString()}…`;const el=$("#syncMsg");if(el)el.textContent=S.sync.msg;
   await put("catalog",`${b}-${String(i).padStart(3,"0")}`,{brand:b,storeKey:shop.key,syncId,syncedAt:at,items:all.slice(i*CH,(i+1)*CH)})}
  for(const d of S.catalogDocs.filter(d=>d.brand===b&&d.syncId!==syncId))await remove("catalog",d.id).catch(()=>{});
  await put("stores",b,{...strip(S.stores[b]||{}),key:shop.key,domain:shop.domain,name:shop.name,currency:shop.currency,lastSyncAt:at,count:all.length,tiles:all.filter(p=>p.kind==="tile").length,syncId,partial:false,importedBy:S.me||"you"});
  audit("Shopify import",null,`${all.length} products from ${shop.key}`);
  S.sync={busy:false,brand:b,msg:`Imported ${all.length.toLocaleString()} products from ${shop.name}.`};toast("Products imported from Shopify.");
 }catch(e){S.sync={busy:false,brand:b,msg:shopErr(e),err:true}}
 render();
}
async function unlinkStore(){
 const b=S.brand,s=S.stores[b];if(!s||!S.canApprove)return;
 const ok=await ask({title:`Unlink ${s.name}?`,body:`Removes ${guide(b).short}'s imported Shopify catalogue from the studio. Posts keep their text but lose their product links. Use this only if the wrong store was linked.`,confirm:"Unlink and remove",danger:true});if(!ok)return;
 for(const d of S.catalogDocs.filter(d=>d.brand===b))await remove("catalog",d.id).catch(()=>{});
 await remove("stores",b).catch(()=>{});audit("Shopify store unlinked",null,s.key);S.sync=null;render();
}
function shopPanel(){
 const b=S.brand,g=guide(b),s=S.stores[b],sy=S.sync&&S.sync.brand===b?S.sync:null;
 const status=s?`<b>${esc(g.short)} is linked to ${esc(s.name)}</b> (${esc(s.key)}). ${s.partial?`<b>Partial import:</b> ${s.count} real products were imported by Claude to verify the connection. Run “Import latest from Shopify” to bring in the full catalogue.`:s.count!=null?`${s.count.toLocaleString()} products imported${s.tiles!=null?`, ${s.tiles.toLocaleString()} of them tiles`:""}, last imported ${ago(s.lastSyncAt)}.`:"No import yet."} Shopify is the source of truth; imported records are read-only here.`
  :`<b>${esc(g.short)} isn't linked to a Shopify store yet.</b> Make sure your Shopify connector is signed into ${esc(g.name)}'s store, then import. The studio links the brand to that store and will refuse imports from any other.`;
 return`<section class="panel" style="margin-bottom:18px"><div class="row" style="justify-content:space-between;align-items:flex-start"><p style="margin:0;max-width:72ch">${status}</p>
 <div class="row"><button class="btn sm" data-a="shopCheck" ${sy?.busy||!S.mcp?"disabled":""}>Check connected store</button><button class="btn sm primary" data-a="shopImport" ${sy?.busy||!S.canApprove||!S.mcp?"disabled":""}>${s?"Import latest from Shopify":"Link store and import"}</button>${s&&S.canApprove?`<button class="btn sm ghost danger" data-a="shopUnlink" ${sy?.busy?"disabled":""}>Unlink</button>`:""}</div></div>
 ${sy?`<p id="syncMsg" class="small" style="margin:10px 0 0;${sy.err?"color:var(--s-failed)":""}" role="status">${esc(sy.msg)}</p>`:""}
 ${!S.mcp?`<p class="small muted" style="margin:10px 0 0">${S.mode==="local"?"Shopify import works in the published studio.":"Shopify isn't available in this view. Open the studio on claude.ai with the Shopify connector added to your account."}</p>`:!S.canApprove?`<p class="small muted" style="margin:10px 0 0">Only Editors can import.</p>`:""}</section>`;
}

/* ───────── Activity log: Editors write the log; everyone else submits entries ───────── */
// The official log ("audit") accepts writes only from Editors, so Contributors can't edit or delete it.
// A Contributor's actions go to their own queue (auditq/<id>), readable only by Editors, and an Editor's
// session copies them into the official log, keeping the original author and time.
async function writeAudit(entry){
 const id=uid();
 if(!S.db){return put("audit",id,entry)}
 if(S.canApprove)return put("audit",id,entry).catch(()=>{});
 if(!S.me)return;
 try{const ref=S.db.doc(`auditq/${S.me}`);const d=await ref.get();const list=d.exists?clone(d.data().entries||[]):[];list.push({...entry,id});await ref.set({entries:list.slice(-300),updatedAt:nowIso()})}catch{}
}
let folding=false;
async function foldAuditQueue(docs){
 if(!S.canApprove||!S.db||folding)return;folding=true;
 try{const have=new Set(S.audit.map(a=>a.id));
  for(const d of docs){for(const e of (d.data().entries||[])){if(!e?.id||have.has(e.id))continue;const{id,...rest}=e;await S.db.collection("audit").doc(id).set({...rest,actor:d.id,via:"contributor"});have.add(id)}}
 }catch{}finally{folding=false}
}
