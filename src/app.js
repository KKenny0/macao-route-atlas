const mapLink=s=>s.mapUrl||`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((s.n||s.name)+' '+(s.address||'澳门'))}`;
const groups=['咖啡与茶','本地小吃','路氹餐饮'];
document.getElementById('store-groups').innerHTML=groups.map(g=>`<div class="store-group"><h3>${g}</h3><div class="store-grid">${shops.filter(s=>s.g===g).map(s=>`<article class="store"><span class="store-number">${s.label}</span><div><strong>${s.n}${s.extra?'<i class="store-flag">另列分店</i>':''}</strong><small>${s.address}</small><div class="store-actions"><button type="button" data-locate="${s.id}" ${Number.isFinite(s.lat)?'':'disabled'}>${Number.isFinite(s.lat)?'地图定位':'店址待确认'}</button><a href="${mapLink(s)}" target="_blank" rel="noreferrer">Google 地图 ↗</a></div></div></article>`).join('')}</div></div>`).join('');
document.getElementById('fireworks-schedule').innerHTML=fireworks.dates.map(d=>`<article><span>${Number(d.date.slice(5,7))} 月 ${Number(d.date.slice(8))} 日 · ${d.label}</span><strong>${d.times.join(' <i>／</i> ')}</strong><small>${d.teams}${d.closingDrone?'；'+d.closingDrone+' 另有无人机闭幕表演':''}</small></article>`).join('');
const fireworkTimes=fireworks.dates.map(d=>`${Number(d.date.slice(5,7))}/${Number(d.date.slice(8))} · ${d.times.join(' / ')}`).join('；');
document.getElementById('firework-views').innerHTML=fireworks.views.map(s=>`<button type="button" data-locate="${s.id}"><b>${s.label}</b><span>${s.name}<small>${s.note}</small></span><em>↗</em></button>`).join('');
const fireworkPlaces=[fireworks.launch,...fireworks.views];
const mappedShops=shops.filter(s=>Number.isFinite(s.lat)&&Number.isFinite(s.lon));
const allPlaces=[...route,hotel,...mappedShops,...fireworkPlaces];
document.getElementById('map-place').innerHTML='<option value="">选择地点…</option>'+[
 ['文化路线',route],['酒店',[hotel]],['收藏店铺',mappedShops],['烟花观赏',fireworkPlaces]
].map(([name,places])=>`<optgroup label="${name}">${places.map(s=>`<option value="${s.id}">${s.label||s.id} · ${s.n||s.name}</option>`).join('')}</optgroup>`).join('');
const ox=atlas.origin[0],oy=atlas.origin[1],toWorld=(lon,lat)=>[(lon-ox)*103000,(lat-oy)*111000];allPlaces.forEach(s=>s.p=toWorld(s.lon,s.lat));
const streets=atlas.roads;
const shores=atlas.coasts;
const buildings=atlas.buildings.map(b=>({p:b[0],h:b[1],y:b[0].reduce((a,q)=>a+q[1],0)/b[0].length})).sort((a,b)=>b.y-a.y);
let selected=1,stage='all';const canvas=document.getElementById('route-map'),ctx=canvas.getContext('2d');let W=0,H=0,dpr=1,angle=-.16,zoom=1,tilted=true,panX=0,panY=0,pending=0,hits=[],pointers=new Map(),tap=null,pinch=null;
canvas.setAttribute('aria-description','底图地名：'+atlas.labels.map(s=>s.name).join('、')+'。标注表示大概位置。');
const active=()=>['all','shops','fireworks'].includes(stage)?route:route.filter(s=>s.stage===Number(stage));
function camera(){
 const pts=(stage==='shops'?[...route,hotel,...mappedShops]:stage==='fireworks'?[...route,hotel,...fireworkPlaces]:active()).map(s=>s.p);
 if(stage==='all')pts.push(hotel.p);
 const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);
 const C={center:[(Math.min(...xs)+Math.max(...xs))/2,(Math.min(...ys)+Math.max(...ys))/2],scale:1,tilt:tilted?.54:0};
 // Fit projected coordinates, including rotation and perspective, so island shops stay visible.
 const projected=pts.map(p=>project(p,62,C)),px=projected.map(p=>p[0]-W/2-panX),py=projected.map(p=>p[1]-H/2-panY);
 const left=Math.min(...px),right=Math.max(...px),top=Math.min(...py),bottom=Math.max(...py);
 const header=document.querySelector('.map-top').offsetHeight+35;
 C.scale=Math.min(W*.72/Math.max(600,right-left),Math.max(100,H-header-110)*.9/Math.max(550,bottom-top),.85)*zoom;
 C.offsetX=-(left+right)/2*C.scale;
 C.offsetY=(header-90)/2-(top+bottom)/2*C.scale;
 return C;
}
function project(p,z,C){let x=p[0]-C.center[0],y=p[1]-C.center[1],cs=Math.cos(angle),sn=Math.sin(angle),xr=x*cs-y*sn,yr=x*sn+y*cs,ct=Math.cos(C.tilt),st=Math.sin(C.tilt),f=4300/(4300+yr*st-z*ct);return [W/2+panX+(C.offsetX||0)+xr*C.scale*f,H/2+panY+(C.offsetY||0)-(yr*ct+z*st)*C.scale*f]}
function path(points,z,C){ctx.beginPath();let started=false;for(const p of points){if(!p){started=false;continue}let q=project(p,z,C);if(!started){ctx.moveTo(q[0],q[1]);started=true}else ctx.lineTo(q[0],q[1])}}
// Numbered route and viewing markers use short leaders when their targets overlap.
function markerLocation(q,used){
 const top=document.querySelector('.map-top').offsetHeight+25;
 const candidates=[];
 for(let x=-3;x<=3;x++)for(let y=-3;y<=3;y++)candidates.push([q[0]+x*42,q[1]+y*42]);
 // A viewport grid gives dense overviews somewhere to place labels without covering tools.
 for(let x=22;x<W-22;x+=42)for(let y=top;y<H-110;y+=42)candidates.push([x,y]);
 let best=q,bestScore=-Infinity;
 for(const [x,y] of candidates){
   const closest=used.length?Math.min(...used.map(p=>Math.hypot(p[0]-x,p[1]-y))):100;
   const edge=Math.min(x-22,W-x-22,y-top,H-y-110);
   if(edge<0)continue;
   const score=Math.min(closest,42)-Math.hypot(x-q[0],y-q[1])*.1-Math.max(0,42-closest)*10;
   if(score>bestScore){bestScore=score;best=[x,y]}
 }
 used.push(best);return best;
}
const markerButtons=new Map();
for(const s of allPlaces){
 const button=document.createElement('button');button.type='button';
 button.className='map-marker '+(s.kind|| (s.id==='hotel'?'hotel':'route'));
 button.textContent=s.label||s.id;button.hidden=true;
 button.setAttribute('aria-label',`${s.label||s.id} · ${s.n||s.name}，${typeof s.id==='number'?'阅读历史':'查看地点'}`);
 button.onclick=()=>typeof s.id==='number'?openHistory(s.id):locate(s.id);
 markerButtons.set(s.id,button);document.getElementById('map-markers').append(button);
}
const clusterButtons=mappedShops.map(()=>{
 const button=document.createElement('button');button.type='button';button.className='map-marker shop cluster';button.hidden=true;
 document.getElementById('map-markers').append(button);return button;
});
function setZoom(value){zoom=Math.max(.3,Math.min(8,value))}
function panTo(p){const q=project(p,0,camera());panX+=W/2-q[0];panY+=(document.querySelector('.map-top').offsetHeight+25+H-110)/2-q[1]}
function shopGroups(C){
 const groups=mappedShops.map(s=>[s]);
 // ponytail: pairwise screen-distance grouping is bounded to 13 shops; use a spatial index for large collections.
 if(zoom<8)for(let i=0;i<groups.length;i++)for(let j=i+1;j<groups.length;j++){
   if([...groups[i],...groups[j]].some(s=>s.id===selected&&!document.getElementById('map-detail').hidden))continue;
   if(groups[i].some(a=>groups[j].some(b=>{const p=project(a.p,62,C),q=project(b.p,62,C);return Math.hypot(p[0]-q[0],p[1]-q[1])<48}))){groups[i].push(...groups.splice(j,1)[0]);i=-1;break}
 }
 return groups;
}
function drawLabels(C,occupied,routeLabels){
 const boxes=[...routeLabels,...occupied.map(p=>[p[0]-23,p[1]-23,p[0]+23,p[1]+23])];
 for(const s of atlas.labels){
   if(C.scale<(s.minScale||0))continue;
   const origin=project(toWorld(s.lon,s.lat),0,C),region=s.kind==='region';
   ctx.font=`${region?'650 15':'500 11'}px system-ui`;
   const width=ctx.measureText(s.name).width;
   const candidates=(region?[[0,0],[0,-28],[55,0],[-55,0],[0,28],[55,-28],[-55,-28],[55,28],[-55,28],[75,0],[-75,0]]:[[0,0]]).map(([x,y])=>[origin[0]+x,origin[1]+y]);
   const q=candidates.find(([x,y])=>{
     const box=[x-width/2-6,y-12,x+width/2+6,y+12];
     return box[0]>=12&&box[2]<=W-12&&box[1]>=document.querySelector('.map-top').offsetHeight+25&&box[3]<=H-70&&!boxes.some(b=>box[0]<b[2]&&box[2]>b[0]&&box[1]<b[3]&&box[3]>b[1]);
   });
   if(!q)continue;
   const box=[q[0]-width/2-6,q[1]-12,q[0]+width/2+6,q[1]+12];
   ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineWidth=4;ctx.strokeStyle='#102c38';ctx.strokeText(s.name,...q);ctx.fillStyle=region?'#e0e6d6':s.kind==='water'?'#88c2cf':'#afc5c0';ctx.fillText(s.name,...q);boxes.push(box);
 }
 const a=project(C.center,0,C),b=project([C.center[0],C.center[1]+100],0,C);
 document.getElementById('north-needle').style.transform=`rotate(${Math.atan2(b[0]-a[0],a[1]-b[1])*180/Math.PI}deg)`;
}
function draw(){if(!W)return;const C=camera();ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#102c38';ctx.fillRect(0,0,W,H);
 for(const [r,p] of streets){path(p,0,C);ctx.lineCap='round';ctx.lineJoin='round';const width=r<2?Math.max(2,7*C.scale):r<4?Math.max(1,4*C.scale):Math.max(.5,2*C.scale);if(r<3){ctx.lineWidth=width+2;ctx.strokeStyle='#193b47';ctx.stroke()}ctx.lineWidth=width;ctx.strokeStyle=r<2?'#698080':r<4?'#3f626a':'#274954';ctx.stroke()}
 for(const p of shores){path(p,0,C);ctx.lineWidth=5;ctx.strokeStyle='#203f47';ctx.stroke();ctx.lineWidth=1.5;ctx.strokeStyle='#7eaaa4';ctx.stroke()}
 for(const b of buildings){let p=b.p;if(p.length<4)continue;let bottom=p.map(q=>project(q,0,C)),top=p.map(q=>project(q,b.h,C));for(let i=0;i<p.length-1;i++){ctx.beginPath();ctx.moveTo(bottom[i][0],bottom[i][1]);ctx.lineTo(bottom[i+1][0],bottom[i+1][1]);ctx.lineTo(top[i+1][0],top[i+1][1]);ctx.lineTo(top[i][0],top[i][1]);ctx.closePath();ctx.fillStyle=i%2?'rgba(72,106,108,.80)':'rgba(40,76,86,.85)';ctx.fill()}ctx.beginPath();top.forEach((q,i)=>i?ctx.lineTo(q[0],q[1]):ctx.moveTo(q[0],q[1]));ctx.closePath();ctx.fillStyle='rgba(180,199,172,.62)';ctx.fill();ctx.strokeStyle='rgba(201,217,189,.22)';ctx.lineWidth=.5;ctx.stroke()}
 const reference=stage==='shops'||stage==='fireworks',seq=active();
 ctx.beginPath();seq.forEach((s,i)=>{let q=project(s.p,reference?0:30,C);i?ctx.lineTo(q[0],q[1]):ctx.moveTo(q[0],q[1])});ctx.strokeStyle='#c9eb86';ctx.globalAlpha=.13;ctx.lineWidth=10;ctx.lineCap='round';ctx.lineJoin='round';ctx.stroke();ctx.globalAlpha=reference?.7:.95;ctx.setLineDash([7,5]);ctx.lineWidth=2.7;ctx.stroke();ctx.setLineDash([]);ctx.globalAlpha=1;
 if(stage==='fireworks'){
   path(fireworks.views[4].coast.map(p=>toWorld(...p)),0,C);
   ctx.strokeStyle='#d8b9ff';ctx.lineWidth=5;ctx.stroke();
 }
 hits=[];const used=reference?seq.map(s=>project(s.p,0,C)):[],routeLabels=[];
 const groups=stage==='shops'?shopGroups(C):[];
 const visible=[...(reference?[]:seq),hotel,...(stage==='fireworks'?fireworkPlaces:groups.filter(g=>g.length===1).flat())];
 if(reference){
   // Keep route dots at their geographic positions; labels appear where the current zoom gives them room.
   const points=seq.map(s=>project(s.p,0,C));
   points.forEach((q,i)=>{
     if(q[0]<0||q[0]>W||q[1]<0||q[1]>H)return;
     const s=seq[i],space=points.every((p,j)=>i===j||Math.hypot(p[0]-q[0],p[1]-q[1])>22);
     ctx.beginPath();ctx.arc(q[0],q[1],selected===s.id?5:3,0,Math.PI*2);ctx.fillStyle='#c9eb86';ctx.fill();
     if(space||s.id===1||s.id===20){
       const label=s.id===1?'1 · 妈阁庙':s.id===20?'20 · 美高梅':String(s.id);
       const x=q[0]+(s.id===1?-7:7);
       ctx.font='600 11px system-ui';ctx.textAlign=s.id===1?'right':'left';ctx.textBaseline='middle';ctx.lineWidth=3;ctx.strokeStyle='#102c38';ctx.strokeText(label,x,q[1]);ctx.fillText(label,x,q[1]);
       const width=ctx.measureText(label).width;
       routeLabels.push([s.id===1?x-width-3:x-3,q[1]-10,s.id===1?x+3:x+width+3,q[1]+10]);
     }
     hits.push({id:s.id,x:q[0],y:q[1]});
   });
 }
 for(const button of markerButtons.values())button.hidden=true;
 for(const button of clusterButtons)button.hidden=true;
 let clusterIndex=0;
 for(const places of groups.filter(g=>g.length>1)){
   const p=[0,1].map(i=>places.reduce((sum,s)=>sum+s.p[i],0)/places.length),foot=project(p,0,C),origin=project(p,62,C);
   if(origin[0]<-30||origin[0]>W+30||origin[1]<65||origin[1]>H-65)continue;
   const head=markerLocation(origin,used),button=clusterButtons[clusterIndex++];
   button.hidden=false;button.style.left=head[0]+'px';button.style.top=head[1]+'px';button.textContent=places.length+'家';
   button.setAttribute('aria-label',`${places.length} 家店铺：${places.map(s=>s.n).join('、')}，放大展开`);
   button.placeIds=places.map(s=>s.id);
   button.onclick=()=>{setZoom(zoom*2);panTo(p);document.getElementById('map-detail').hidden=true;draw();const target=markerButtons.get(places[0].id);(target.hidden?clusterButtons.find(b=>!b.hidden&&b.placeIds.includes(places[0].id)):target)?.focus({preventScroll:true})};
   ctx.strokeStyle='#f6c779';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(...foot);ctx.lineTo(...head);ctx.stroke();
   hits.push({id:'cluster-'+places[0].id,x:head[0],y:head[1],members:places.map(s=>s.id)});
 }
 for(const s of visible){
   const foot=project(s.p,0,C),origin=project(s.p,62,C);
   if(origin[0]<-30||origin[0]>W+30||origin[1]<65||origin[1]>H-65)continue;
   const head=markerLocation(origin,used),button=markerButtons.get(s.id);
   ctx.strokeStyle=s.kind==='shop'?'#f6c779':s.kind==='firework'?'#d8b9ff':s.id==='hotel'?'#95dadd':'#c9eb86';
   ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(...foot);ctx.lineTo(...head);ctx.stroke();
   button.hidden=false;button.style.left=head[0]+'px';button.style.top=head[1]+'px';
   button.classList.toggle('selected',selected===s.id);
   hits.push({id:s.id,x:head[0],y:head[1]});
 }
 drawLabels(C,used,routeLabels);
}
function schedule(){if(pending)return;pending=requestAnimationFrame(()=>{pending=0;draw()})}
function resize(){let r=canvas.getBoundingClientRect();dpr=Math.min(2,devicePixelRatio||1);W=r.width;H=r.height;canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);draw()}
new ResizeObserver(resize).observe(canvas);
function reset(){zoom=1;angle=-.16;tilted=true;panX=panY=0;document.querySelector('[data-control="tilt"]').textContent='2D';draw()}
function select(id,showPopup=false){
 const s=allPlaces.find(x=>x.id===id);if(!s)return;selected=id;
 let detail;
 if(id==='hotel')detail='<div class="mini">酒店 · H 独立标记</div><h4>澳门十六浦索菲特酒店</h4><a target="_blank" rel="noreferrer" href="https://all.accor.com/hotel/6480/index.zh.shtml">酒店官网 ↗</a>';
 else if(typeof id==='number')detail=`<div class="mini">路线标记 ${String(id).padStart(2,'0')} / 20</div><h4>${s.name}</h4><div class="action-line"><button type="button" class="history-open" data-open-history="${id}">阅读完整历史 ↗</button><a target="_blank" rel="noreferrer" href="${mapLink(s)}">实时地图 ↗</a></div>`;
 else detail=`<div class="mini">${s.kind==='shop'?'独立店铺':'2026 烟花'} · ${s.label}</div><h4>${s.n||s.name}</h4><p>${s.address||s.note}</p>${s.kind==='shop'&&s.note?`<p>${s.note}</p>`:''}${s.kind==='firework'?`<p>${fireworkTimes}</p>`:''}<div class="detail-links"><a target="_blank" rel="noreferrer" href="${mapLink(s)}">Google 地图 ↗</a>${s.source?`<a target="_blank" rel="noreferrer" href="${s.source}">资料来源 ↗</a>`:''}</div>`;
 document.getElementById('route-detail').innerHTML=detail;
 document.getElementById('map-detail-body').innerHTML=detail;
 document.getElementById('map-detail').hidden=!showPopup;
 document.getElementById('map-place').value=String(id);
 document.querySelectorAll('.route-row').forEach(b=>b.classList.toggle('selected',b.dataset.routeId===String(id)));
 document.querySelectorAll('[data-locate]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.locate===String(id))));
 draw();
}
function locate(id){
 const s=allPlaces.find(x=>String(x.id)===String(id));if(!s)return;
 if(typeof s.id==='number'){openHistory(s.id);return}
 const target=s.kind==='shop'?'shops':s.kind==='firework'?'fireworks':stage;
 if(stage!==target)setStage(target);
 const q=project(s.p,62,camera());
 if(q[0]<35||q[0]>W-35||q[1]<document.querySelector('.map-top').offsetHeight+25||q[1]>H-110)panTo(s.p);
 select(s.id,true);
 // The map and list already share a workspace; selecting a place keeps the page still.
 document.getElementById('map-detail-close').focus({preventScroll:true});
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-locate]');if(b)locate(b.dataset.locate)});

document.getElementById('map-place').onchange=e=>locate(e.target.value);
document.getElementById('map-detail-close').onclick=()=>{document.getElementById('map-detail').hidden=true;markerButtons.get(selected)?.focus({preventScroll:true})};

const stageNames={1:'南段 · 内港与山城',2:'老城 · 世界遗产',3:'东段 · 新口岸'};
document.getElementById('route-list').innerHTML=route.map(s=>`<button type="button" class="route-row" data-route-id="${s.id}" aria-label="路线第 ${s.id} 站 ${s.name}，打开完整历史档案"><span class="route-no">${s.id}</span><span>${s.name}<small class="section-label">${stageNames[s.stage]}</small></span></button>`).join('');document.querySelectorAll('.route-row').forEach(b=>b.onclick=()=>{let s=route.find(x=>x.id===Number(b.dataset.routeId));openHistory(s.id)});
function setStage(v){
 stage=v;zoom=1;panX=panY=0;
 const view=v==='shops'||v==='fireworks'?v:'route';
 document.querySelectorAll('[data-view]').forEach(b=>{const on=b.dataset.view===view;b.setAttribute('aria-selected',String(on));b.tabIndex=on?0:-1});
 for(const [name,id] of [['route','panel-route'],['shops','stores'],['fireworks','fireworks']])document.getElementById(id).hidden=name!==view;
 document.querySelector('.stage-tabs').hidden=view!=='route';
 document.getElementById('map-caption').textContent=view==='shops'?'文化路线 + 收藏店铺':view==='fireworks'?'文化路线 + 烟花观赏':'妈阁庙 → 美高梅';
 document.querySelectorAll('.stage-tabs button').forEach(b=>{b.classList.toggle('active',b.dataset.stage===v);b.setAttribute('aria-pressed',String(b.dataset.stage===v))});
 document.querySelectorAll('.route-row').forEach(b=>b.hidden=view==='route'&&v!=='all'&&route[Number(b.dataset.routeId)-1].stage!==Number(v));
 select(v==='shops'?mappedShops[0].id:v==='fireworks'?fireworks.launch.id:active()[0].id);
}
const viewTabs=[...document.querySelectorAll('[data-view]')];
viewTabs.forEach((b,i)=>{
 const activate=()=>{setStage(b.dataset.view==='route'?'all':b.dataset.view);if(mapPanel.getBoundingClientRect().top<0&&!mapExpanded())mapPanel.scrollIntoView({block:'start',behavior:'instant'})};
 b.onclick=activate;
 b.addEventListener('keydown',e=>{if(e.ctrlKey||e.metaKey||e.altKey)return;let next;if(e.key==='ArrowRight')next=(i+1)%viewTabs.length;else if(e.key==='ArrowLeft')next=(i+viewTabs.length-1)%viewTabs.length;else if(e.key==='Home')next=0;else if(e.key==='End')next=viewTabs.length-1;else return;e.preventDefault();viewTabs[next].focus({preventScroll:true});viewTabs[next].click()});
});
document.querySelectorAll('.stage-tabs button').forEach(b=>b.onclick=()=>setStage(b.dataset.stage));document.querySelectorAll('.controls button').forEach(b=>b.onclick=()=>{switch(b.dataset.control){case'rotate':angle+=Math.PI/9;break;case'tilt':tilted=!tilted;b.textContent=tilted?'2D':'3D';break;case'minus':setZoom(zoom/1.2);break;case'plus':setZoom(zoom*1.2);break;case'reset':reset();return}draw()});
canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);let r=canvas.getBoundingClientRect();pointers.set(e.pointerId,{x:e.clientX-r.left,y:e.clientY-r.top});tap=pointers.size===1?{x:e.clientX-r.left,y:e.clientY-r.top,moved:false}:null;if(pointers.size>1)pinch=null});
canvas.addEventListener('pointermove',e=>{if(!pointers.has(e.pointerId))return;let r=canvas.getBoundingClientRect(),p={x:e.clientX-r.left,y:e.clientY-r.top},old=pointers.get(e.pointerId);pointers.set(e.pointerId,p);if(pointers.size===1){if(tap&&Math.hypot(p.x-tap.x,p.y-tap.y)>6)tap.moved=true;panX+=p.x-old.x;panY+=p.y-old.y;schedule()}else if(pointers.size===2){let a=[...pointers.values()],dist=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y),mid={x:(a[0].x+a[1].x)/2,y:(a[0].y+a[1].y)/2};if(pinch){setZoom(zoom*dist/Math.max(1,pinch.dist));panX+=mid.x-pinch.mid.x;panY+=mid.y-pinch.mid.y;schedule()}pinch={dist,mid}}});
function pointerEnd(e){if(!pointers.has(e.pointerId))return;pointers.delete(e.pointerId);if(pointers.size<2)pinch=null;if(pointers.size===0&&tap&&!tap.moved){let r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top,near=hits.map(h=>({...h,d:Math.hypot(h.x-x,h.y-y)})).sort((a,b)=>a.d-b.d)[0];if(near&&near.d<28){if(typeof near.id==='number')openHistory(near.id);else locate(near.id)}}tap=null}canvas.addEventListener('pointerup',pointerEnd);canvas.addEventListener('pointercancel',pointerEnd);
canvas.addEventListener('wheel',e=>{e.preventDefault();setZoom(zoom*(e.deltaY>0?.91:1.09));schedule()},{passive:false});canvas.addEventListener('keydown',e=>{let handled=true;if(e.key==='ArrowLeft')panX+=25;else if(e.key==='ArrowRight')panX-=25;else if(e.key==='ArrowUp')panY+=25;else if(e.key==='ArrowDown')panY-=25;else if(e.key==='+'||e.key==='=')setZoom(zoom*1.18);else if(e.key==='-')setZoom(zoom/1.18);else if(e.key.toLowerCase()==='r')reset();else handled=false;if(handled){e.preventDefault();draw()}});

const historyOverlay=document.getElementById('history-overlay');let historyOpenId=null,historyReturnFocus=null;
function renderHistory(id){const s=route[id-1];if(!s)return;historyOpenId=id;document.getElementById('history-kicker').textContent=`沿途档案 · ${String(id).padStart(2,'0')} / 20 · ${stageNames[s.stage]}`;document.getElementById('history-title').textContent=s.name;document.getElementById('history-era').textContent=s.era;document.getElementById('history-dek').textContent=s.dek;document.getElementById('history-prose').innerHTML=s.story.map(p=>`<p>${p}</p>`).join('');document.getElementById('history-source').innerHTML=`资料来源：<a href="${s.source}" target="_blank" rel="noreferrer">${s.sourceLabel} ↗</a><br>文字据资料整理；街道与现代酒店的沿革按各自来源表述。`;document.getElementById('history-count').textContent=`${String(id).padStart(2,'0')} / 20`;document.getElementById('history-prev').disabled=id===1;document.getElementById('history-next').disabled=id===20;document.getElementById('history-scroll').scrollTop=0}
function openHistory(id){const s=route[id-1];if(!s)return;const firstOpen=historyOverlay.hidden;if(firstOpen)historyReturnFocus=document.activeElement;if(!['all','shops','fireworks'].includes(stage)&&stage!==String(s.stage))setStage(String(s.stage));select(id);renderHistory(id);[...document.querySelector('.map-surface').children].filter(e=>e!==historyOverlay).forEach(e=>e.inert=true);document.querySelector('.workspace-nav').inert=true;document.querySelector('.route-panel').inert=true;historyOverlay.hidden=false;document.body.classList.add('history-active');if(firstOpen)document.getElementById('history-close').focus()}
function closeHistory(){if(historyOverlay.hidden)return;historyOverlay.hidden=true;[...document.querySelector('.map-surface').children].forEach(e=>e.inert=false);document.querySelector('.workspace-nav').inert=false;document.querySelector('.route-panel').inert=false;historyOpenId=null;document.body.classList.remove('history-active');historyReturnFocus?.focus?.()}
document.getElementById('history-close').onclick=closeHistory;
historyOverlay.addEventListener('click',e=>{if(e.target===historyOverlay)closeHistory()});
document.getElementById('history-prev').onclick=()=>{if(historyOpenId>1)openHistory(historyOpenId-1)};
document.getElementById('history-next').onclick=()=>{if(historyOpenId<20)openHistory(historyOpenId+1)};
document.addEventListener('click',e=>{const b=e.target.closest('[data-open-history]');if(b)openHistory(Number(b.dataset.openHistory))});
document.addEventListener('keydown',e=>{if(historyOverlay.hidden)return;if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();closeHistory();return}if(e.key!=='Tab')return;const items=[...historyOverlay.querySelectorAll('button:not(:disabled),a[href]')];const first=items[0],last=items[items.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}});
const mapPanel=document.getElementById('map-panel'),fullscreenButton=document.getElementById('fullscreen-toggle');
let pageFullscreen=false;
const mapExpanded=()=>pageFullscreen;
function syncFullscreen(){const expanded=mapExpanded();mapPanel.classList.toggle('map-expanded',expanded);document.body.classList.toggle('map-fullscreen',expanded);fullscreenButton.textContent=expanded?'⛶ 退出全屏':'⛶ 全屏';fullscreenButton.setAttribute('aria-label',expanded?'退出地图全屏':'全屏展开地图');fullscreenButton.setAttribute('aria-pressed',String(expanded));if(!expanded)fullscreenButton.focus({preventScroll:true})}
// Expand the workspace in the page so tabs and details stay available on every browser.
fullscreenButton.onclick=()=>{pageFullscreen=!pageFullscreen;syncFullscreen()};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&historyOverlay.hidden){if(!document.getElementById('map-detail').hidden){document.getElementById('map-detail-close').click();e.preventDefault()}else if(pageFullscreen){pageFullscreen=false;syncFullscreen();e.preventDefault()}}});
setStage('all');
