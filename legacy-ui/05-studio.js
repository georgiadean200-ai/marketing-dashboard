
/* ───────── Content studio ───────── */
function pageStudio(){
 const e=S.edit;
 if(!e||e.brand!==S.brand){
  S.edit=null;
  const groups=[["Changes requested",["Changes Requested"]],["Drafts and ideas",["AI Draft","Idea"]],["In review",["Needs Review"]],["Approved and scheduled",["Approved","Scheduled"]],["Failed",["Failed"]]];
  const items=brandItems();
  return`<div class="row" style="justify-content:space-between;margin-bottom:22px"><div><h1 class="display">Content studio</h1><p class="muted" style="margin:8px 0 0">Pick a post to edit, or start from a product.</p></div><div class="row"><button class="btn" data-a="go" data-p="products">Start from a product</button><button class="btn primary" data-a="new">${icon("plus",16)} New post</button></div></div>`
  +groups.map(([label,sts])=>{const list=items.filter(i=>sts.includes(i.status)).sort((a,b)=>(a.scheduledAt||"").localeCompare(b.scheduledAt||""));if(!list.length)return"";
   return`<section class="block"><div class="block-head"><h2>${label}</h2><span class="small muted">${list.length}</span></div><div class="picker">${list.map(i=>`<button class="card" data-a="open" data-id="${i.id}" style="padding:12px">${pill(i.status)}<b style="font-size:14px">${esc(i.title||"Untitled")}</b><span class="muted">${fmtD(i.scheduledAt)} · ${esc(i.channel)} ${esc(i.format)}</span>${i.reviewNote&&i.status==="Changes Requested"?`<div class="small" style="margin-top:6px">“${esc(i.reviewNote)}”</div>`:""}</button>`).join("")}</div></section>`}).join("");
 }
 const locked=e.status==="Published";const dis=locked?"disabled":"";
 const g=guide(e.brand),fmts=FORMATS[e.channel]||["Single image"];
 const orig=S.items.find(i=>i.id===e.id),isNew=!orig;
 const willInvalidate=orig?.approvedFingerprint&&fingerprint(e)!==orig.approvedFingerprint;
 const opt=(arr,v)=>arr.map(x=>`<option${x===v?" selected":""}>${esc(x)}</option>`).join("");
 const ps=(e.productIds||[]).map(prod).filter(Boolean),ms=(e.mediaIds||[]).map(mediaById);
 const avail=products(e.brand).filter(p=>!(e.productIds||[]).includes(p.id));
 const lib=S.media.filter(m=>m.brand===e.brand&&!(e.mediaIds||[]).includes(m.id));
 const cap=(e.caption||"").length;
 const busy=S.busy;
 return`<div class="row" style="justify-content:space-between;margin-bottom:18px"><div class="row"><button class="btn ghost sm" data-a="closeEdit">${icon("l",16)} All posts</button>${pill(e.status)}${isNew?`<span class="tag">Not saved yet</span>`:""}${orig&&verified(orig)?`<span class="lock">${icon("lock",14)} Approved version <span class="fp">${esc(orig.approvedFingerprint)}</span></span>`:""}</div>
 <div class="row small muted">${orig?.updatedAt?"Saved "+ago(orig.updatedAt):""}</div></div>
 ${locked?`<div class="notice"><span>${icon("lock",16)}</span><span>Published posts are locked to keep an accurate record. Duplicate it to reuse the content.</span></div>`:""}
 ${e.status==="Changes Requested"&&e.reviewNote?`<div class="notice"><span><b>Requested changes:</b> ${esc(e.reviewNote)}</span></div>`:""}
 ${willInvalidate?`<div class="notice warn"><span><b>Saving will remove this post's approval.</b> It goes back to Needs review${orig.status==="Scheduled"?" and you'll need to update it in Later":""}.</span></div>`:""}
 <div class="studio"><div class="formstack">
  <label class="field"><span>Title</span><input type="text" data-f="title" value="${esc(e.title)}" placeholder="For example: Tile of the Week: Calacatta Grande" ${dis}></label>
  <div class="grid3">
   <label class="field"><span>Channel</span><select data-f="channel" ${dis}>${opt(CHANNELS,e.channel)}</select></label>
   <label class="field"><span>Format</span><select data-f="format" ${dis}>${opt(fmts,e.format)}</select></label>
   <label class="field"><span>Series</span><select data-f="series" ${dis}>${opt(SERIES,e.series)}</select></label>
  </div>
  <div class="grid2">
   <label class="field"><span>Date and time (Brisbane)</span><input type="datetime-local" data-f="scheduledAt" value="${esc(e.scheduledAt||"")}" ${dis}></label>
   <label class="field"><span>Campaign</span><select data-f="campaignId" ${dis}><option value="">None</option>${S.campaigns.filter(c=>c.brand===e.brand).map(c=>`<option value="${c.id}"${c.id===e.campaignId?" selected":""}>${esc(c.name||"Untitled campaign")}</option>`).join("")}</select></label>
  </div>
  <div class="field"><span class="sectionlabel">Products <span class="faint">${ps.length?ps.map(p=>p.url?"Link: "+esc(p.url):p.source==="demo"?"Demo product, no link":"No link on this product").join(" · "):"Links attach from the product library"}</span></span>
   <div class="linked">${ps.map(p=>`<span class="lk">${pvis(p)}${esc(p.name)}${p.source==="demo"?` <span class="tag">Demo</span>`:""}${locked?"":`<button data-a="unprod" data-pid="${p.id}" aria-label="Remove ${esc(p.name)}">${icon("x",14)}</button>`}</span>`).join("")}
   ${!locked&&avail.length?`<select data-a-change="addprod" style="width:auto;min-width:200px" aria-label="Add a product"><option value="">Add a product…</option>${avail.map(p=>`<option value="${p.id}">${esc(p.name)} (${esc(p.collection)})</option>`).join("")}</select>`:""}</div></div>
  <div class="field"><span class="sectionlabel">Creative <span class="faint">Approved images only in final posts</span></span>
   <div class="linked">${ms.map((m,ix)=>m?`<span class="lk"><img src="${esc(mediaUrl(m))}" alt="">${esc(m.name)} ${m.approved?"":`<span class="tag" style="color:var(--s-failed)">Not approved</span>`}${locked?"":`<button data-a="unmedia" data-mid="${m.id}" aria-label="Remove image">${icon("x",14)}</button>`}</span>`:`<span class="lk">Missing image <button data-a="unmedia" data-mid="${(e.mediaIds||[])[ix]}">${icon("x",14)}</button></span>`).join("")}
   ${!locked&&lib.length?`<select data-a-change="addmedia" style="width:auto;min-width:180px" aria-label="Add from media library"><option value="">Add from media library…</option>${lib.map(m=>`<option value="${m.id}">${esc(m.name)}${m.approved?"":" (not approved)"}</option>`).join("")}</select>`:""}
   ${!locked?`<button class="btn sm" data-a="upload" data-ctx="studio" ${S.assets||S.mode==="local"?"":"disabled title='Uploading needs Editor access'"}>${icon("upload",14)} Upload</button>`:""}</div></div>
  <label class="field"><span class="sectionlabel">Direction for the AI <span class="faint">Optional</span></span><input type="text" data-f="direction" value="${esc(e.direction||"")}" placeholder="For example: focus on how it feels underfoot; mention the Herston showroom" ${dis}></label>
  <div class="row"><button class="btn lime" data-a="aiGen" ${locked||busy||!S.sample?"disabled":""}>${icon("assistant",16)} ${busy==="gen"?"Writing…":e.caption?"Regenerate with AI":"Generate with AI"}</button>${!S.sample?`<span class="small muted">${S.mode==="local"?"AI is available in the published studio.":"AI isn't available in this view."}</span>`:""}</div>
  <label class="field"><span class="sectionlabel">${e.channel==="Email"?"Email copy":"Caption"} <span class="${cap>2200&&e.channel==="Instagram"?"":"faint"}" style="${cap>2200&&e.channel==="Instagram"?"color:var(--s-failed)":""}">${cap.toLocaleString()}${e.channel==="Instagram"?" / 2,200":""}</span></span><textarea data-f="caption" rows="8" ${dis}>${esc(e.caption)}</textarea></label>
  ${!locked?`<div class="row"><input type="text" data-f="_rewrite" value="${esc(e._rewrite||"")}" placeholder="Rewrite instruction, for example: shorter and warmer" style="flex:1;min-width:200px"><button class="btn" data-a="aiRewrite" ${busy||!S.sample||!e.caption?"disabled":""}>${busy==="rw"?"Rewriting…":"Rewrite caption"}</button></div>`:""}
  <div class="field"><span class="sectionlabel">Hashtags <span class="faint">${(e.hashtags||[]).length} / 30</span></span>
   ${!locked?`<input type="text" id="hashIn" placeholder="Type a hashtag and press Enter" data-a-key="hash">`:""}
   <div class="hashchips">${(e.hashtags||[]).map(h=>`<button data-a="unhash" data-h="${esc(h)}" ${dis} aria-label="Remove #${esc(h)}">#${esc(h)} ×</button>`).join("")}</div></div>
  ${e.format==="Carousel"?`<div class="field"><span class="sectionlabel">Carousel slides <button class="link" data-a="addSlide" ${dis}>Add slide</button></span><div class="slides">${(e.slides||[]).map((s,ix)=>`<div class="slide-ed"><span class="no">${ix+1}</span><input type="text" data-sf="heading" data-ix="${ix}" value="${esc(s.heading)}" placeholder="Heading" ${dis}><textarea rows="1" data-sf="body" data-ix="${ix}" placeholder="Supporting line" ${dis}>${esc(s.body)}</textarea><button class="iconbtn" data-a="rmSlide" data-ix="${ix}" aria-label="Remove slide ${ix+1}" ${dis}>${icon("x",15)}</button></div>`).join("")||`<p class="small muted">No slides yet. Generate with AI or add one.</p>`}</div></div>`:""}
  ${["Reel","Story"].includes(e.format)?`<div class="field"><span class="sectionlabel">Shot list and filming notes <button class="link" data-a="addShot" ${dis}>Add shot</button></span><div class="slides">${(e.shots||[]).map((s,ix)=>`<div class="slide-ed"><span class="no">${ix+1}</span><textarea rows="2" data-shf="shot" data-ix="${ix}" placeholder="What to film" ${dis}>${esc(s.shot)}</textarea><input type="text" data-shf="onScreenText" data-ix="${ix}" value="${esc(s.onScreenText)}" placeholder="On-screen text" ${dis}><button class="iconbtn" data-a="rmShot" data-ix="${ix}" aria-label="Remove shot" ${dis}>${icon("x",15)}</button></div>`).join("")||`<p class="small muted">No shots yet.</p>`}</div></div>`:""}
  <label class="field"><span>Creative brief</span><textarea data-f="brief" rows="3" placeholder="Composition, styling, which product images to use" ${dis}>${esc(e.brief)}</textarea></label>
  <div class="actions">
   ${locked?`<button class="btn" data-a="dupe">Duplicate</button>`:`<button class="btn" data-a="save">Save draft</button>
   ${["Idea","AI Draft","Changes Requested"].includes(e.status)||willInvalidate?`<button class="btn primary" data-a="submit">Submit for approval</button>`:""}
   <span style="flex:1"></span>${!isNew?`<button class="btn ghost" data-a="dupe">Duplicate</button><button class="btn ghost danger" data-a="archive">Archive</button>`:""}`}
  </div>
 </div>
 <aside class="studio-side" id="studioSide">${studioSide(e)}</aside></div>`;
}
function studioSide(e){return preview(e)+`<section class="panel"><div class="block-head" style="margin-bottom:8px"><h3>Quality check</h3></div><ul class="qc">${qc(e).map(x=>`<li class="${x.l}">${esc(x.m)}</li>`).join("")}</ul><p class="small faint" style="margin:10px 0 0">Checks brand words, platform limits, price and stock claims, and image approval.</p></section>`}
let _sideT;function refreshSide(){clearTimeout(_sideT);_sideT=setTimeout(()=>{const el=$("#studioSide");if(el&&S.edit)el.innerHTML=studioSide(S.edit)},150)}
function preview(e){
 const g=guide(e.brand),p=prod((e.productIds||[])[0]),ms=(e.mediaIds||[]).map(mediaById).filter(Boolean);
 const head=`<div class="ph-top"><i>${g.short}</i>${g.short==="TTC"?"thetilecollective":"cheaptilesonline"}<span class="faint" style="margin-left:auto;font-weight:400">${esc(e.channel)}</span></div>`;
 const cap=`<div class="ph-cap"><b>${g.short==="TTC"?"thetilecollective":"cheaptilesonline"}</b> ${esc(e.caption||"Your caption appears here.")}${(e.hashtags||[]).length?"\n\n<span class='h'>"+esc(e.hashtags.map(h=>"#"+h).join(" "))+"</span>":""}</div>`;
 const bg=ix=>{const m=ms[ix]||ms[0];return m?`<img src="${esc(mediaUrl(m))}" alt="">`:p?pvis(p):`<span class="sw" style="background:var(--surface-2)"></span>`};
 if(e.format==="Carousel"){
  const sl=e.slides||[],n=Math.max(sl.length,1),ix=Math.min(S.slideIx,n-1),s=sl[ix];
  return`<div class="phone">${head}<div class="ph-img">${bg(ix)}${s?`<div class="ph-slide"><h4>${esc(s.heading)}</h4><p>${esc(s.body)}</p></div>`:`<div class="placeholder">Slides appear here</div>`}
  ${ix>0?`<button class="ph-nav" style="left:8px" data-a="slide" data-n="-1" aria-label="Previous slide">${icon("l",16)}</button>`:""}${ix<n-1?`<button class="ph-nav" style="right:8px" data-a="slide" data-n="1" aria-label="Next slide">${icon("r",16)}</button>`:""}</div>
  <div class="ph-dots">${Array.from({length:n},(_,k)=>`<i class="${k===ix?"on":""}"></i>`).join("")}</div>${cap}</div>`;
 }
 if(["Reel","Story"].includes(e.format)){
  const sh=e.shots||[];
  return`<div class="phone">${head}<div class="ph-img reel">${bg(0)}<div class="ph-slide"><h4>${esc(sh[0]?.onScreenText||e.title||"Reel")}</h4><p>${sh.length} shots · ${sh.reduce((a,s)=>a+(+s.seconds||0),0)||"?"} s</p></div></div>${e.format==="Reel"?cap:""}</div>
  ${sh.length?`<section class="panel"><h3 style="margin-bottom:10px">Storyboard</h3><div class="board">${sh.map((s,ix)=>`<div class="frame"><div class="fv">${esc(s.onScreenText||"Shot "+(ix+1))}</div><p><b style="font-weight:500">${ix+1}.</b> ${esc(s.shot)}${s.seconds?` <span class="faint">${s.seconds}s</span>`:""}</p></div>`).join("")}</div></section>`:""}`;
 }
 if(e.channel==="Email")return`<div class="phone"><div class="ph-top">Email preview</div><div class="ph-img" style="aspect-ratio:3/2">${bg(0)}</div><div class="ph-cap"><b style="font-family:var(--head);font-weight:400;font-size:18px">${esc(e.title||"Subject line")}</b>\n\n${esc(e.caption||"Email copy appears here.")}</div></div>`;
 return`<div class="phone">${head}<div class="ph-img"${e.channel==="Pinterest"?' style="aspect-ratio:2/3"':""}>${bg(0)}${!ms.length?`<div class="placeholder">${p?(pimg(p)?"Product photo shown. Attach approved creative for the final post.":"Product placeholder shown. Add approved imagery for the final post."):"Add creative to preview it here"}</div>`:""}</div>${cap}</div>`;
}

async function saveEdit(submit=false){
 const e=S.edit;if(!e)return;const orig=S.items.find(i=>i.id===e.id);
 if(orig?.status==="Published")return toast("Published posts are locked.");
 const next=clone(e);delete next._rewrite;
 let invalidated=false;
 if(orig?.approvedFingerprint&&fingerprint(next)!==orig.approvedFingerprint){
  const ok=await ask({title:"Remove approval?",body:orig.status==="Scheduled"?"This post is approved and scheduled. Saving changes sends it back to review. Remove or update it in Later too.":"This post is approved. Saving changes sends it back to review.",confirm:"Save and re-review"});
  if(!ok)return;invalidated=true;next.status="Needs Review";next.approvedFingerprint=null;next.approvalId=null;next.publishStatus="";
 }
 if(submit&&!invalidated){if(!(await submitForReview(next)))return}
 if(!String(next.title).trim())next.title="Untitled post";
 next.revision=(orig?.revision||0)+1;
 try{await saveItem(next)}catch{return}
 S.edit=clone(next);
 if(!orig)audit("Created",next,"");
 if(invalidated)audit("Approval invalidated",next,"Edited after approval");
 if(submit||invalidated)audit("Submitted for review",next,"");else if(orig)audit("Edited",next,"Revision "+next.revision);
 toast(submit||invalidated?"Submitted for approval.":"Saved.");render();
}
async function aiGenerate(){
 const e=S.edit;if(!e||!S.sample)return;const g=guide(e.brand);
 const ps=(e.productIds||[]).map(prod).filter(Boolean).map(p=>({name:p.name,source:p.source,collection:p.collection,size:p.size,colour:p.colour,finish:p.finish,description:p.desc}));
 const wantSlides=e.format==="Carousel",wantShots=["Reel","Story"].includes(e.format);
 const prompt=`You write social media content for ${g.name}${g.tag?` ("${g.tag}")`:""}.
Brand voice: ${g.voice}
Audience: ${g.audience}
Never use these words: ${g.avoidList.join(", ")||"none"}.
Notes: ${g.notes}
Write in Australian English.

The post:
- Working title: ${e.title||"(none — suggest one)"}
- Series: ${e.series}
- Channel and format: ${e.channel} ${e.format}
- Date: ${e.scheduledAt||"unscheduled"}
- Direction from the marketer: ${e.direction||"none"}
${e.status==="Changes Requested"&&e.reviewNote?`- Reviewer asked for: ${e.reviewNote}\n`:""}
Products (the ONLY product facts you may use; quote sizes and finishes exactly as given; never mention prices, stock, availability or web addresses):
${ps.length?JSON.stringify(ps,null,1):"None selected. Do not name or invent any product."}

Reply with only JSON in this shape:
{"title":string,"caption":string (${e.channel==="Email"?"email body with a clear call to action":"social caption, 60-150 words, line breaks allowed"}),"hashtags":[up to 10 lowercase strings without #],"slides":${wantSlides?'[4-6 {"heading":string,"body":string}]':"[]"},"shots":${wantShots?'[3-6 {"shot":string filming instruction,"onScreenText":string,"seconds":number}]':"[]"},"brief":string creative brief for photographer/designer (composition, styling, which product images to use; never alter tile colour, texture, shape or proportions)}`;
 S.busy="gen";render();
 try{const r=await S.sample.json(prompt,{modelTier:"default"});
  if(!S.edit||S.edit.id!==e.id)return;const x=S.edit;
  if(r.title&&(!x.title||x.title==="Untitled post"))x.title=String(r.title);
  if(r.caption)x.caption=String(r.caption);
  if(Array.isArray(r.hashtags))x.hashtags=r.hashtags.map(h=>String(h).replace(/^#/,"").replace(/\s+/g,"").toLowerCase()).filter(Boolean).slice(0,30);
  if(wantSlides&&Array.isArray(r.slides))x.slides=r.slides.map(s=>({heading:String(s.heading||""),body:String(s.body||"")}));
  if(wantShots&&Array.isArray(r.shots))x.shots=r.shots.map(s=>({shot:String(s.shot||""),onScreenText:String(s.onScreenText||""),seconds:+s.seconds||0}));
  if(r.brief)x.brief=String(r.brief);
  if(x.status==="Idea")x.status="AI Draft";
  S.slideIx=0;toast("Draft written. Review it, then save.");
 }catch(err){toast(sampleErr(err),"error")}finally{S.busy="";render()}
}
async function aiRewrite(){
 const e=S.edit;if(!e||!S.sample||!e.caption)return;const g=guide(e.brand);
 const ins=e._rewrite||"Tighten it and make it more on-brand.";
 S.busy="rw";render();
 try{const{text}=await S.sample(`Rewrite this ${e.channel} caption for ${g.name}.\nBrand voice: ${g.voice}\nNever use: ${g.avoidList.join(", ")}.\nKeep product facts exactly as written; add no prices, stock claims or new product details. Australian English.\nInstruction: ${ins}\n\nCaption:\n${e.caption}\n\nReply with only the new caption text.`,{modelTier:"default"});
  if(S.edit&&S.edit.id===e.id){S.edit.caption=text.trim().replace(/^"|"$/g,"");toast("Caption rewritten. Save to keep it.")}
 }catch(err){toast(sampleErr(err),"error")}finally{S.busy="";render()}
}
