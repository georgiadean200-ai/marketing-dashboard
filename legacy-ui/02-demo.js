/*DEMO-START*/
const pad=n=>String(n).padStart(2,"0");
const ymd=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const toLocal=d=>`${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const startOfWeek=d=>{const x=new Date(d.getFullYear(),d.getMonth(),d.getDate());x.setDate(x.getDate()-((x.getDay()+6)%7));return x};
const addDays=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x};
function fnv(str){let h=0x811c9dc5;for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,0x01000193)}return(h>>>0).toString(16).padStart(8,"0")}
// The exact fields an approval locks. Any change to these after approval invalidates it.
const FP_FIELDS=["title","brand","channel","format","caption","hashtags","productIds","mediaIds","slides","shots","scheduledAt"];
function fingerprint(it){return fnv(JSON.stringify(FP_FIELDS.map(k=>it[k]===undefined?null:it[k])))}

// DEMO CATALOGUE — placeholder products until Shopify is connected (Stage 3).
// Swatches are illustrations, not product photography.
const DEMO_PRODUCTS=[
 {id:"p-calacatta",brand:"ttc",name:"Calacatta Grande",collection:"Marble look",size:"600 × 1200 mm",colour:"White with soft grey veining",finish:"Polished",price:"$89.90 / m²",availability:"In stock",desc:"Large-format porcelain with a quiet, flowing vein. Suits floors and feature walls.",swatch:{p:"vein",b:"#F1EFEA",a:"#A7A39A"}},
 {id:"p-travertine",brand:"ttc",name:"Roma Travertine",collection:"Stone look",size:"600 × 600 mm",colour:"Warm sand",finish:"Honed",price:"$64.90 / m²",availability:"In stock",desc:"Porcelain travertine look with natural pitting printed in, sealed surface.",swatch:{p:"speckle",b:"#E4D6BF",a:"#C8B597",c:"#F2E9DA"}},
 {id:"p-fluted",brand:"ttc",name:"Linea Fluted",collection:"Feature wall",size:"300 × 600 mm",colour:"Chalk white",finish:"Matt",price:"$79.00 / m²",availability:"Low stock",desc:"Three-dimensional fluted wall tile for vanities, kitchens and feature walls.",swatch:{p:"fluted",b:"#F4F2EC",a:"#DCD8CE"}},
 {id:"p-zellige",brand:"ttc",name:"Medina Zellige",collection:"Handmade look",size:"62 × 250 mm",colour:"Sage",finish:"Gloss",price:"$119.00 / m²",availability:"In stock",desc:"Glazed ceramic with an undulating handmade surface and tonal variation.",swatch:{p:"zellige",b:"#A9B79F",a:"#8E9E85"}},
 {id:"p-oak",brand:"ttc",name:"Nordic Oak Herringbone",collection:"Timber look",size:"120 × 600 mm",colour:"Natural oak",finish:"Matt",price:"$72.50 / m²",availability:"In stock",desc:"Timber-look porcelain plank laid in herringbone; water resistant for wet areas.",swatch:{p:"herring",b:"#C9A57C",a:"#B08A60"}},
 {id:"p-terrazzo",brand:"ttc",name:"Venezia Terrazzo",collection:"Terrazzo",size:"600 × 600 mm",colour:"Ivory with mixed chip",finish:"Honed",price:"$84.90 / m²",availability:"In stock",desc:"Terrazzo-look porcelain with fine chips in grey, rust and black.",swatch:{p:"speckle",b:"#EFEAE0",a:"#7E7A73",c:"#B5705A"}},
 {id:"p-hex",brand:"ttc",name:"Onyx Hexagon",collection:"Mosaic",size:"175 × 200 mm hexagon",colour:"Charcoal",finish:"Matt",price:"$69.00 / m²",availability:"In stock",desc:"Matt porcelain hexagon for bathroom floors and splashbacks.",swatch:{p:"hex",b:"#3A3A38",a:"#585854"}},
 {id:"p-concrete",brand:"ttc",name:"Urban Concrete",collection:"Concrete look",size:"600 × 600 mm",colour:"Mid grey",finish:"Matt, R11",price:"$54.90 / m²",availability:"In stock",desc:"Concrete-look porcelain rated R11 for indoor–outdoor flow.",swatch:{p:"plain",b:"#9C9B97",a:"#8A8984"}},
 {id:"p-paver",brand:"ttc",name:"Coastal Limestone Paver",collection:"Outdoor",size:"600 × 600 × 20 mm",colour:"Pale limestone",finish:"Textured, R11",price:"$98.00 / m²",availability:"Pre-order",desc:"20 mm porcelain paver for alfresco areas, pool surrounds and paths.",swatch:{p:"speckle",b:"#E3DDD0",a:"#CFC7B6",c:"#EEE9DF"}},
 {id:"c-subway",brand:"cto",name:"Classic Subway",collection:"Wall",size:"75 × 300 mm",colour:"White",finish:"Gloss",price:"$29.90 / m²",availability:"In stock",desc:"Bevelled gloss subway tile for splashbacks and bathroom walls.",swatch:{p:"subway",b:"#FAFAF8",a:"#D9D9D4"}},
 {id:"c-carrara",brand:"cto",name:"Carrara Look",collection:"Marble look",size:"300 × 600 mm",colour:"White and grey",finish:"Gloss",price:"$34.90 / m²",availability:"In stock",desc:"Marble-look ceramic for walls with a bright gloss finish.",swatch:{p:"vein",b:"#F3F3F1",a:"#9DA0A3"}},
 {id:"c-grey",brand:"cto",name:"Polished Grey",collection:"Floor",size:"600 × 600 mm",colour:"Light grey",finish:"Polished",price:"$32.00 / m²",availability:"In stock",desc:"Polished porcelain floor tile for living areas.",swatch:{p:"plain",b:"#C9C9C6",a:"#BDBDB9"}},
 {id:"c-penny",brand:"cto",name:"Penny Round Mosaic",collection:"Mosaic",size:"300 × 300 mm sheet",colour:"Matt black",finish:"Matt",price:"$39.00 / sheet",availability:"In stock",desc:"Porcelain penny round mosaic on mesh for floors and feature niches.",swatch:{p:"hex",b:"#1F1F1F",a:"#3A3A3A"}}
];

DEMO_PRODUCTS.forEach(p=>{p.source="demo";p.url="";p.shopifyId="";p.images=[]});

function demoSeed(now){
  const ws=startOfWeek(now);
  const at=(w,d,h,m=0)=>{const x=addDays(ws,w*7+d);x.setHours(h,m,0,0);return toLocal(x)};
  const iso=(w,d,h)=>{const x=addDays(ws,w*7+d);x.setHours(h,0,0,0);return x.toISOString()};
  const b={archived:false,demo:true,mediaIds:[],slides:[],shots:[],brief:"",campaignId:"",reviewNote:"",publishStatus:"",direction:"",approvedFingerprint:null,approvalId:null,revision:1,createdBy:"demo"};
  const raw=[
   {id:"demo-ttc-01",brand:"ttc",title:"Soft stone, slow mornings",series:"Inspiration",channel:"Instagram",format:"Carousel",scheduledAt:at(-1,0,18),status:"Published",productIds:["p-travertine","p-fluted"],
    caption:"Warm travertine underfoot, fluted texture on the vanity wall. A bathroom that asks you to slow down.\n\nRoma Travertine in a honed finish, paired with Linea Fluted in chalk white.\n\nSave this for your next renovation, and visit us in Herston to see both in person.",
    hashtags:["thetilecollective","bathroomdesign","travertine","flutedtiles","brisbaneinteriors"],slides:[{heading:"Soft stone, slow mornings",body:"A calm bathroom in two tiles."},{heading:"Roma Travertine",body:"Honed 600 × 600 mm, warm sand."},{heading:"Linea Fluted",body:"Chalk white texture for the vanity wall."},{heading:"See it in Herston",body:"Both on display in our showroom."}]},
   {id:"demo-ttc-02",brand:"ttc",title:"Tile of the Week: Calacatta Grande",series:"Tile of the Week",channel:"Instagram",format:"Single image",scheduledAt:at(-1,2,18),status:"Published",productIds:["p-calacatta"],
    caption:"Tile of the Week: Calacatta Grande.\n\nA polished 600 × 1200 mm porcelain with the softest grey vein. Fewer grout lines, more calm. Beautiful from floor to feature wall.",
    hashtags:["thetilecollective","tileoftheweek","marblelook","largeformattiles"]},
   {id:"demo-ttc-03",brand:"ttc",title:"Sage zellige in motion",series:"Product Feature",channel:"Instagram",format:"Reel",scheduledAt:at(-1,4,17,30),status:"Published",productIds:["p-zellige"],
    caption:"Watch the light move across Medina Zellige in sage. Every tile catches it a little differently, which is the whole point.",
    hashtags:["thetilecollective","zellige","kitchendesign","splashback"],shots:[{shot:"Slow pan across a sage zellige splashback in morning light",onScreenText:"Medina Zellige",seconds:4},{shot:"Macro of the glaze edge",onScreenText:"Handmade look",seconds:3},{shot:"Wide kitchen reveal",onScreenText:"In sage",seconds:4}]},
   {id:"demo-ttc-04",brand:"ttc",title:"Save This Space: a terrazzo kitchen",series:"Save This Space",channel:"Instagram",format:"Carousel",scheduledAt:at(0,0,18),status:"Scheduled",productIds:["p-terrazzo"],publishStatus:"Scheduled manually in Later",
    caption:"Save this space. Venezia Terrazzo brings a gentle speckle of rust and charcoal to a pared-back kitchen, honed for a soft, tactile finish.\n\nWhich would you choose: terrazzo floors or a terrazzo splashback?",
    hashtags:["thetilecollective","savethisspace","terrazzo","kitcheninspo"],slides:[{heading:"Save this space",body:"A terrazzo kitchen."},{heading:"The floor",body:"Venezia Terrazzo, honed."},{heading:"The palette",body:"Ivory, rust, charcoal."}]},
   {id:"demo-ttc-05",brand:"ttc",title:"Tile of the Week: Nordic Oak Herringbone",series:"Tile of the Week",channel:"Instagram",format:"Single image",scheduledAt:at(0,2,18),status:"Approved",productIds:["p-oak"],
    caption:"Tile of the Week: Nordic Oak Herringbone.\n\nThe warmth of timber, laid in a classic herringbone, with the durability of porcelain. Yes, even in the bathroom.",
    hashtags:["thetilecollective","tileoftheweek","herringbone","timberlook"]},
   {id:"demo-ttc-06",brand:"ttc",title:"Tile School with Wade: why rectified edges matter",series:"Tile School with Wade",channel:"Instagram",format:"Reel",scheduledAt:at(0,4,17,30),status:"Needs Review",productIds:["p-calacatta"],
    caption:"Tile School with Wade, lesson one: rectified edges.\n\nWade explains why precisely cut edges let you use finer grout lines, and when that makes the biggest difference.",
    hashtags:["thetilecollective","tileschool","renovationtips","tiling"],shots:[{shot:"Wade to camera in the Herston showroom",onScreenText:"Tile School with Wade",seconds:3},{shot:"Close-up running a finger along a rectified edge",onScreenText:"What is a rectified edge?",seconds:6},{shot:"Two tiles butted together showing a fine grout line",onScreenText:"Finer grout lines",seconds:6},{shot:"Wade's one-line tip",onScreenText:"Ask us in store",seconds:4}],
    brief:"Film vertically in the Herston showroom with natural light. Use the actual Calacatta Grande sample board; no colour grading that shifts the white or the vein."},
   {id:"demo-ttc-07",brand:"ttc",title:"Behind the Scenes: new samples landing in Herston",series:"Behind the Scenes",channel:"Instagram",format:"Story",scheduledAt:at(0,3,12),status:"AI Draft",productIds:[],
    caption:"New sample boards just landed in Herston. Come and have a feel.",hashtags:[],shots:[{shot:"Boxes being unpacked",onScreenText:"Fresh samples",seconds:4},{shot:"Hands placing a board on the display",onScreenText:"Now in Herston",seconds:4}]},
   {id:"demo-ttc-08",brand:"ttc",title:"Perfect Match: hexagon floors, fluted walls",series:"Perfect Match",channel:"Instagram",format:"Carousel",scheduledAt:at(1,0,18),status:"Needs Review",productIds:["p-hex","p-fluted"],
    caption:"Perfect Match: Onyx Hexagon on the floor, Linea Fluted on the wall.\n\nDeep charcoal grounds the room; chalk-white texture lifts it. Contrast, done softly.",
    hashtags:["thetilecollective","perfectmatch","hexagontiles","bathroominspo"],slides:[{heading:"Perfect Match",body:"Floor and wall, paired."},{heading:"The floor",body:"Onyx Hexagon, matt charcoal."},{heading:"The wall",body:"Linea Fluted, chalk white."},{heading:"Together",body:"Contrast, done softly."}]},
   {id:"demo-ttc-09",brand:"ttc",title:"Tile of the Week: Urban Concrete",series:"Tile of the Week",channel:"Instagram",format:"Single image",scheduledAt:at(1,2,18),status:"Changes Requested",productIds:["p-concrete"],reviewNote:"Lead with indoor–outdoor flow, and check the slip rating wording with Wade.",
    caption:"Tile of the Week: Urban Concrete.\n\nA cool mid-grey with a matt finish that pairs with almost anything.",hashtags:["thetilecollective","tileoftheweek","concretelook"]},
   {id:"demo-ttc-10",brand:"ttc",title:"Customer Projects: the Paddington ensuite",series:"Customer Projects",channel:"Instagram",format:"Single image",scheduledAt:at(1,4,18),status:"AI Draft",productIds:["p-zellige"],
    caption:"From our customers: a Paddington ensuite with a sage zellige shower niche. Thank you for sharing your finished space with us.",hashtags:["thetilecollective","customerprojects","ensuite"]},
   {id:"demo-ttc-11",brand:"ttc",title:"Summer alfresco tile edit",series:"Seasonal Inspiration",channel:"Pinterest",format:"Pin",scheduledAt:at(1,5,10),status:"Idea",productIds:["p-paver","p-concrete"],caption:"",hashtags:[]},
   {id:"demo-ttc-12",brand:"ttc",title:"Seasonal Inspiration: entertaining outdoors",series:"Seasonal Inspiration",channel:"Instagram",format:"Carousel",scheduledAt:at(2,0,18),status:"Idea",productIds:["p-paver"],caption:"",hashtags:[]},
   {id:"demo-ttc-13",brand:"ttc",title:"December newsletter: the summer edit",series:"Campaigns",channel:"Email",format:"Email",scheduledAt:at(2,3,9),status:"Idea",productIds:[],caption:"",hashtags:[]},
   {id:"demo-cto-01",brand:"cto",title:"Big look, small spend: marble-look picks",series:"Inspiration",channel:"Instagram",format:"Carousel",scheduledAt:at(0,0,18),status:"Approved",productIds:["c-carrara","c-grey"],
    caption:"Love the marble look? So do we. Here are our favourite marble-look and polished picks for bathrooms and living areas. Shop online, delivered to your door.",hashtags:["cheaptilesonline","marblelook","bathroomreno"],slides:[{heading:"The marble look",body:"For less."},{heading:"Carrara Look",body:"Gloss 300 × 600 mm wall tile."},{heading:"Polished Grey",body:"600 × 600 mm floor tile."}]},
   {id:"demo-cto-02",brand:"cto",title:"Tile of the Week: Classic Subway",series:"Tile of the Week",channel:"Instagram",format:"Single image",scheduledAt:at(0,2,18),status:"Needs Review",productIds:["c-subway"],
    caption:"Tile of the Week: Classic Subway. The splashback that never dates. Bevelled, glossy and easy to style. Order online today.",hashtags:["cheaptilesonline","subwaytiles","splashback"]},
   {id:"demo-cto-03",brand:"cto",title:"Bathroom reno checklist",series:"Tile School with Wade",channel:"Instagram",format:"Carousel",scheduledAt:at(0,4,18),status:"Idea",productIds:[],caption:"",hashtags:[]}
  ];
  const items=raw.map(r=>({...b,...r,createdAt:iso(-2,0,9),updatedAt:iso(-1,0,9)}));
  const approvals=[],audit=[];
  items.forEach(it=>{
    if(["Approved","Scheduled","Published"].includes(it.status)){
      const fp=fingerprint(it),id="ap-"+it.id;
      const snapshot={};FP_FIELDS.forEach(k=>snapshot[k]=it[k]===undefined?null:it[k]);
      approvals.push({id,contentId:it.id,brand:it.brand,title:it.title,fingerprint:fp,snapshot,approvedBy:"demo",approvedAt:iso(-1,0,10),demo:true});
      it.approvedFingerprint=fp;it.approvalId=id;
      if(it.status==="Published"){it.publishStatus="Posted — confirmed manually";it.publishedAt=it.scheduledAt}
    }
  });
  const log=(id,action,it,detail,w,d,h,kind="person")=>audit.push({id,at:iso(w,d,h),actor:"demo",actorKind:kind,action,contentId:it.id,title:it.title,brand:it.brand,detail,demo:true});
  log("au-1","AI draft created",items[6],"Created by the AI assistant",-1,5,9,"ai");
  log("au-2","Submitted for review",items[5],"",-1,5,11);
  log("au-3","Changes requested",items[8],items[8].reviewNote,0,0,8);
  log("au-4","Approved",items[4],"Version "+items[4].approvedFingerprint,0,0,9);
  log("au-5","Marked scheduled in Later",items[3],"",0,0,9);
  return {items,approvals,audit};
}
/*DEMO-END*/
