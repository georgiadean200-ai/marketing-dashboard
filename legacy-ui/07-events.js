
/* ───────── Render ───────── */
const PAGES={overview:pageOverview,assistant:pageAssistant,calendar:pageCalendar,campaigns:pageCampaigns,studio:pageStudio,approvals:pageApprovals,products:pageProducts,media:pageMedia,publishing:pagePublishing,analytics:pageAnalytics,brand:pageBrand,automations:pageAutomations,integrations:pageIntegrations};
function render(){
 renderChrome();
 if(S.mode==="loading"||(S.mode==="connecting"&&!S.items.length)){$("#view").innerHTML=`<div class="empty"><span class="typing"><i></i><i></i><i></i></span><p>Opening the studio…</p></div>`;return}
 const sy=$("#main").scrollTop;
 $("#view").innerHTML=(PAGES[S.page]||pageOverview)();
 $("#main").scrollTop=sy;
 if(S.page==="assistant"){const m=$("#msgs");if(m)m.scrollTop=m.scrollHeight}
}

/* ───────── Events ───────── */
const A={
 go:d=>go(d.p),
 openNav:()=>{S.navOpen=true;renderChrome()},closeNav:()=>{S.navOpen=false;renderChrome()},
 collapse:()=>{S.navCollapsed=!S.navCollapsed;renderChrome()},
 pop:d=>{S.pop=S.pop===d.p?"":d.p;renderChrome()},
 brand:d=>{S.brand=d.b;S.pop="";S.edit=null;S.campEdit=null;S.prodCol="";S.prodQ="";S.prodLimit=60;render();toast(`Switched to ${BRANDS[d.b].name}.`)},
 new:()=>openStudio(newItem()),
 newOn:d=>openStudio(newItem({date:d.d})),
 open:d=>{const it=S.items.find(i=>i.id===d.id);if(it)openStudio(it)},
 closeEdit:async()=>{if(S.edit&&isDirty()&&!(await ask({title:"Discard unsaved changes?",confirm:"Discard",danger:true})))return;S.edit=null;render()},
 calView:d=>{S.cal.view=d.v;render()},calToday:()=>{S.cal.cursor=new Date();render()},
 calNav:d=>{const c=S.cal.cursor,n=+d.n;S.cal.cursor=S.cal.view==="month"?new Date(c.getFullYear(),c.getMonth()+n,1):addDays(c,7*n);render()},
 calStatus:d=>{S.cal.status=d.s;S.cal.view="list";go("calendar")},
 qtab:d=>{S.queueTab=d.t;render()},
 approve:d=>approve(d.id),changes:d=>requestChanges(d.id),reject:d=>reject(d.id),
 save:()=>saveEdit(false),submit:()=>saveEdit(true),
 aiGen:()=>aiGenerate(),aiRewrite:()=>aiRewrite(),
 slide:d=>{S.slideIx=Math.max(0,S.slideIx+ +d.n);render()},
 addSlide:()=>{S.edit.slides=[...(S.edit.slides||[]),{heading:"",body:""}];render()},
 rmSlide:d=>{S.edit.slides.splice(+d.ix,1);S.slideIx=0;render()},
 addShot:()=>{S.edit.shots=[...(S.edit.shots||[]),{shot:"",onScreenText:"",seconds:3}];render()},
 rmShot:d=>{S.edit.shots.splice(+d.ix,1);render()},
 unprod:d=>{S.edit.productIds=S.edit.productIds.filter(x=>x!==d.pid);render()},
 unmedia:d=>{S.edit.mediaIds=S.edit.mediaIds.filter(x=>x!==d.mid);render()},
 unhash:d=>{S.edit.hashtags=S.edit.hashtags.filter(h=>h!==d.h);render()},
 dupe:()=>{const c=clone(S.edit);openStudio({...newItem(),...c,id:"c-"+uid(),title:(c.title||"Untitled")+" (copy)",status:"Idea",approvedFingerprint:null,approvalId:null,publishStatus:"",publishedAt:null,reviewNote:"",archived:false,revision:0,createdAt:nowIso(),createdBy:S.me||"you"});toast("Duplicated. Save to keep it.")},
 archive:async()=>{const it=S.items.find(i=>i.id===S.edit.id);if(!it)return;if(!(await ask({title:"Archive this post?",body:"It's hidden from the calendar and queue. Find it under Archived in the list view.",confirm:"Archive",danger:true})))return;await saveItem({...clone(it),archived:true,approvedFingerprint:null,approvalId:null,status:it.status==="Published"?"Published":"Idea"});audit("Archived",it);S.edit=null;render()},
 feature:d=>{const p=prod(d.pid);openStudio(newItem({fields:{productIds:[d.pid],title:p?`Tile of the Week: ${p.name}`:"",series:"Tile of the Week"}}))},
 upload:d=>{const f=$("#fileIn");f.dataset.ctx=d.ctx;f.dataset.pid=d.pid||"";f.value="";f.click()},
 shopCheck:()=>checkConnection(),shopImport:()=>importShopify(),shopUnlink:()=>unlinkStore(),
 prodMore:()=>{S.prodLimit+=60;render()},
 mediaUse:d=>{const m=mediaById(d.mid);openStudio(newItem({fields:{mediaIds:[d.mid],productIds:m?.productId?[m.productId]:[]}}))},
 mediaDel:async d=>{const m=mediaById(d.mid);if(!m)return;const used=S.items.filter(i=>(i.mediaIds||[]).includes(m.id));if(!(await ask({title:"Delete this image?",body:used.length?`It's used in ${used.length} post(s); they'll show it as missing.`:"This can't be undone.",confirm:"Delete",danger:true})))return;try{if(S.assets&&m.assetId)await S.assets.delete(m.assetId)}catch{}await remove("media",m.id)},
 copyCap:async d=>{const i=S.items.find(x=>x.id===d.id);const t=(i.caption||"")+((i.hashtags||[]).length?"\n\n"+i.hashtags.map(h=>"#"+h).join(" "):"");try{await navigator.clipboard.writeText(t);toast("Caption copied.")}catch{await ask({title:"Copy this caption",body:t,confirm:"Done"})}},
 markSched:d=>markScheduled(d.id),markPub:d=>markPublished(d.id),markFail:d=>markFailed(d.id),retry:d=>retry(d.id),
 pause:async()=>{const v=!S.settings.paused;if(v||await ask({title:"Resume publishing?",confirm:"Resume"})){await put("settings","global",{...S.settings,paused:v,changedAt:nowIso(),changedBy:S.me||"you"});audit(v?"Publishing paused":"Publishing resumed",null);toast(v?"Publishing paused.":"Publishing resumed.")}},
 clearDemo:async d=>{const b=d.b;if(!S.canApprove||!hasCatalog(b))return;const p=demoPlan(b);
  if(!(await ask({title:`Remove ${guide(b).short} demo data?`,body:`Deletes ${p.del.length} demo posts, ${p.aps.length} demo approvals and ${p.prods.length} demo products.${p.keep.length?` Keeps ${p.keep.length} demo posts you've edited or approved.`:""} Real posts, real approvals and the activity log are not touched.`,confirm:"Remove demo data",danger:true})))return;
  let n=0;for(const i of p.del){await remove("content",i.id).catch(()=>{});n++}for(const a of p.aps)await remove("approvals",a.id).catch(()=>{});for(const x of p.prods)await remove("products",x.id).catch(()=>{});
  audit("Demo data removed",null,`${guide(b).short}: ${n} posts, ${p.aps.length} approvals, ${p.prods.length} products`);toast("Demo data removed.")},
 saveBrand:async()=>{const o={};document.querySelectorAll("[data-bf]").forEach(el=>o[el.dataset.bf]=el.value);await put("guidelines",S.brand,o);audit("Brand guidelines updated",null);toast("Guidelines saved. The AI and quality checks use them from now on.")},
 sendChat:()=>{const t=$("#chatIn");sendChat(t.value);},
 prompt:d=>sendChat(d.t),stopChat:()=>chatCtl?.abort(),
 clearChat:async()=>{S.chat[S.brand]=[];render();if(S.db&&S.me){try{await S.db.doc(`data/users/${S.me}/chat-${S.brand}`).delete()}catch{}}},
 submitOne:async d=>{const it=S.items.find(i=>i.id===d.id);if(!it)return;if(qcBlocked(it))return toast("Fix the quality check errors first.","error");await saveItem({...clone(it),status:"Needs Review"});audit("Submitted for review",it);toast("Sent to review.")},
 submitAll:async()=>{const list=brandItems().filter(i=>i.status==="AI Draft"&&!qcBlocked(i));for(const it of list){await saveItem({...clone(it),status:"Needs Review"});audit("Submitted for review",it)}toast(`${list.length} sent to review.`);S.queueTab="waiting";render()},
 newCamp:()=>{S.campEdit={id:"cp-"+uid(),brand:S.brand,name:"",status:"Proposal",productIds:[],schedule:[]};render()},
 openCamp:d=>{const c=S.campaigns.find(x=>x.id===d.id);if(c){S.campEdit=clone(c);render()}},
 closeCamp:()=>{S.campEdit=null;render()},
 aiCamp:()=>aiCamp(),
 saveCamp:async()=>{const c=clone(S.campEdit);delete c._brief;c.updatedAt=nowIso();await put("campaigns",c.id,strip(c));toast("Campaign saved.")},
 approveCamp:async()=>{if(!S.canApprove)return;const c=clone(S.campEdit);delete c._brief;c.status="Approved";c.approvedAt=nowIso();c.approvedBy=S.me||"you";c.updatedAt=nowIso();await put("campaigns",c.id,strip(c));S.campEdit.status="Approved";audit("Campaign approved",{id:"",title:c.name,brand:c.brand});toast("Campaign approved. Its posts still need individual approval.");render()},
 campUnprod:d=>{S.campEdit.productIds=S.campEdit.productIds.filter(x=>x!==d.pid);render()},
 campRmSched:d=>{S.campEdit.schedule.splice(+d.ix,1);render()},
 campToCal:async()=>{const c=S.campEdit;if(!c.name)return toast("Name the campaign first.");await A.saveCamp();let n=0;for(const s of c.schedule||[]){const fm=FORMATS[s.channel]||["Single image"];const it=newItem({date:s.date,fields:{title:s.title,channel:s.channel,format:fm.includes(s.format)?s.format:fm[0],series:s.series||"Campaigns",campaignId:c.id,productIds:(c.productIds||[]).slice(0,2)}});await saveItem(it);n++}audit("Campaign ideas added",{id:"",title:c.name,brand:c.brand},n+" ideas");toast(`${n} ideas added to the calendar.`)}
};
function isDirty(){const o=S.items.find(i=>i.id===S.edit?.id);if(!o)return!!(S.edit&&(S.edit.title||S.edit.caption));const a=clone(S.edit);delete a._rewrite;return JSON.stringify(FP_FIELDS.map(k=>a[k]))+a.brief+a.series+a.direction+a.campaignId!==JSON.stringify(FP_FIELDS.map(k=>o[k]))+o.brief+o.series+o.direction+o.campaignId}
document.addEventListener("click",e=>{
 const t=e.target.closest("[data-a]");
 if(S.pop&&!e.target.closest(".ws")){S.pop="";renderChrome()}
 if(!t||t.disabled||t.tagName==="SELECT"||(t.tagName==="INPUT"&&t.type!=="button"))return;
 const fn=A[t.dataset.a];if(fn){e.preventDefault();fn(t.dataset,t)}
});
document.addEventListener("keydown",e=>{
 if(e.key==="Escape"&&S.pop){S.pop="";renderChrome()}
 if(e.target.matches("tr.clickable")&&e.key==="Enter")A.open(e.target.dataset);
 if(e.target.id==="hashIn"&&(e.key==="Enter"||e.key===",")){e.preventDefault();const v=e.target.value.replace(/[#,\s]/g,"").toLowerCase();if(v&&S.edit&&!S.edit.hashtags.includes(v)){S.edit.hashtags=[...S.edit.hashtags,v]}e.target.value="";render();$("#hashIn")?.focus()}
 if(e.target.id==="chatIn"&&e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendChat(e.target.value)}
});
document.addEventListener("input",e=>{
 const t=e.target,d=t.dataset;
 if(d.f&&S.edit){S.edit[d.f]=t.value;if(d.f==="caption"){const lab=t.closest("label").querySelector(".sectionlabel span");if(lab)lab.textContent=t.value.length.toLocaleString()+(S.edit.channel==="Instagram"?" / 2,200":"")}}
 if(d.sf&&S.edit)S.edit.slides[+d.ix][d.sf]=t.value;
 if(d.shf&&S.edit)S.edit.shots[+d.ix][d.shf]=t.value;
 if((d.f||d.sf||d.shf)&&S.edit)refreshSide();
 if(d.cpf&&S.campEdit)S.campEdit[d.cpf]=t.value;
 if(t.id==="prodQ"){S.prodQ=t.value;S.prodLimit=60;clearTimeout(window._pq);window._pq=setTimeout(()=>{render();const q=$("#prodQ");if(q){q.focus();q.setSelectionRange(q.value.length,q.value.length)}},200)}
 if(t.id==="chatIn"){t.style.height="auto";t.style.height=Math.min(t.scrollHeight,160)+"px"}
});
document.addEventListener("change",async e=>{
 const t=e.target,d=t.dataset;
 if(d.f&&S.edit){S.edit[d.f]=t.value;if(d.f==="channel"){const f=FORMATS[t.value];if(!f.includes(S.edit.format))S.edit.format=f[0]}pendingRender=false;render();return}
 if(d.cf){S.cal[d.cf]=t.type==="checkbox"?t.checked:t.value;pendingRender=false;render();return}
 if(d.pf){S.prodLimit=60;if(d.pf==="col")S.prodCol=t.value;else if(d.pf==="kind")S.prodKind=t.value;else S.prodNeglected=t.checked;pendingRender=false;render();return}
 if(d.cpf&&S.campEdit){S.campEdit[d.cpf]=t.value;return}
 const a=d.aChange;
 if(a==="addprod"&&t.value){S.edit.productIds=[...(S.edit.productIds||[]),t.value];pendingRender=false;render()}
 if(a==="addmedia"&&t.value){S.edit.mediaIds=[...(S.edit.mediaIds||[]),t.value];pendingRender=false;render()}
 if(a==="campAddprod"&&t.value){S.campEdit.productIds=[...(S.campEdit.productIds||[]),t.value];pendingRender=false;render()}
 if(a==="mediaApprove"){const m=mediaById(d.mid);if(m){await put("media",m.id,{...strip(m),approved:t.checked});audit(t.checked?"Image approved":"Image approval removed",null,m.name)}}
 if(a==="mediaProd"){const m=mediaById(d.mid);if(m)await put("media",m.id,{...strip(m),productId:t.value})}
});
$("#fileIn").addEventListener("change",e=>{const f=[...e.target.files];if(f.length)handleFiles(f,e.target.dataset.ctx,e.target.dataset.pid)});
// drag and drop rescheduling
let dragId=null;
document.addEventListener("dragstart",e=>{const t=e.target.closest?.("[data-drag]");if(!t)return;dragId=t.dataset.drag;e.dataTransfer.effectAllowed="move";e.dataTransfer.setData("text/plain",dragId)});
document.addEventListener("dragover",e=>{const c=e.target.closest?.("[data-drop]");if(!c||!dragId)return;e.preventDefault();document.querySelectorAll(".cell.over").forEach(x=>x!==c&&x.classList.remove("over"));c.classList.add("over")});
document.addEventListener("dragleave",e=>{const c=e.target.closest?.("[data-drop]");if(c&&!c.contains(e.relatedTarget))c.classList.remove("over")});
document.addEventListener("drop",e=>{const c=e.target.closest?.("[data-drop]");document.querySelectorAll(".cell.over").forEach(x=>x.classList.remove("over"));if(!c||!dragId)return;e.preventDefault();const id=dragId;dragId=null;reschedule(id,c.dataset.drop)});
document.addEventListener("dragend",()=>{dragId=null;document.querySelectorAll(".cell.over").forEach(x=>x.classList.remove("over"))});

init();
</script>
</body>
</html>
