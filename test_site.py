import json
import re
import shutil
import subprocess
from pathlib import Path


ROOT = Path(__file__).parent


def test_public_page():
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    for asset in re.findall(r'(?:src|href)="(\./(?:data|src)/[^"]+)"', html):
        assert (ROOT / asset.split("?", 1)[0]).is_file()
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    preview = re.search(r'!\[[^]]+\]\((assets/[^)]+)\)', readme)
    assert preview and (ROOT / preview.group(1)).is_file()

    content = (ROOT / "data/content.js").read_text(encoding="utf-8")
    route, _ = json.JSONDecoder().raw_decode(content.split("const route=", 1)[1])
    assert [stop["id"] for stop in route] == list(range(1, 21))
    assert [sum(stop["stage"] == stage for stop in route) for stage in (1, 2, 3)] == [6, 8, 6]
    assert route[0]["name"] == "妈阁庙" and route[-1]["name"] == "美高梅"
    assert all(stop["source"].startswith("https://") and len(stop["story"]) >= 2 for stop in route)

    shops, _ = json.JSONDecoder().raw_decode(content.split("const shops=", 1)[1])
    assert [shop["id"] for shop in shops] == [f"shop-{i}" for i in range(1, 15)]
    assert all(shop["kind"] == "shop" and shop["address"] for shop in shops)
    for shop in shops:
        if shop["lat"] is None:
            assert shop["lon"] is None and "待确认" in shop["address"]
        else:
            assert 22.1 < shop["lat"] < 22.22 and 113.5 < shop["lon"] < 113.6
            assert shop["source"].startswith("https://")
    fireworks, _ = json.JSONDecoder().raw_decode(content.split("const fireworks=", 1)[1])
    assert fireworks["year"] == 2026
    assert [day["date"] for day in fireworks["dates"]] == ["2026-10-01", "2026-10-04"]
    assert all(day["times"] == ["21:00", "21:40"] for day in fireworks["dates"])
    assert [view["label"] for view in fireworks["views"]] == [f"V{i}" for i in range(1, 6)]
    assert len(fireworks["views"][-1]["coast"]) >= 2
    # The dialog must stay inside the fullscreen element, before the sidebar.
    assert html.index('id="map-panel"') < html.index('id="history-overlay"') < html.index('<aside')


def test_map_views_and_fullscreen():
    """Exercise the shipped JavaScript with a small native DOM/canvas stand-in."""
    assert shutil.which("node"), "Node.js is required for the interaction check"
    result = subprocess.run(["node", "-e", r'''
const fs=require('node:fs'), vm=require('node:vm'), assert=require('node:assert/strict');
const nodes=new Map(), listeners=new Map();
function element(){return {
 hidden:false, children:[], style:{}, dataset:{}, offsetHeight:80,
 classList:{toggle(){},add(){},remove(){}}, setAttribute(){}, focus(){}, scrollIntoView(){},
 addEventListener(){}, append(e){this.children.push(e)}, querySelectorAll(){return []},
 getBoundingClientRect(){return {width:800,height:710}}, click(){this.onclick?.()}
}}
const get=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id)};
const ctx=new Proxy({createLinearGradient:()=>({addColorStop(){}})}, {get:(o,k)=>o[k]||(()=>{})});
let size={width:800,height:710};
get('route-map').getContext=()=>ctx;
get('route-map').getBoundingClientRect=()=>size;
get('history-overlay').hidden=true;
get('map-panel').children=[get('route-map'),get('map-markers'),get('history-overlay')];
const surface=element();surface.children=get('map-panel').children;
const stageTabs=element(), nav=element(), sidebar=element();
const tabs=['route','shops','fireworks'].map(view=>{const e=element();e.dataset.view=view;return e});
const rows=Array.from({length:20},(_,i)=>{const e=element();e.dataset.routeId=String(i+1);return e});
const document={getElementById:get,createElement:element,querySelector:s=>s==='.map-surface'?surface:s==='.stage-tabs'?stageTabs:s==='.workspace-nav'?nav:s==='.route-panel'?sidebar:element(),querySelectorAll:s=>s==='[data-view]'?tabs:s==='.route-row'?rows:[],body:element(),activeElement:element(),fullscreenEnabled:false,
 addEventListener(name,fn){if(!listeners.has(name))listeners.set(name,[]);listeners.get(name).push(fn)}};
const sandbox={document,console,size,ResizeObserver:class{observe(){}},devicePixelRatio:1,requestAnimationFrame:()=>0};
vm.createContext(sandbox);
for(const file of ['data/map.js','data/content.js','src/app.js'])vm.runInContext(fs.readFileSync(file,'utf8'),sandbox);
vm.runInContext(`
 resize();
 for(const v of ['all','1','2','3','shops','fireworks']){
   setStage(v);const c=camera();if(!Number.isFinite(c.scale)||c.scale<=0)throw Error('Invalid camera: '+v);
   if(v==='shops'&&hits.filter(h=>String(h.id).startsWith('shop-')).length!==mappedShops.length)throw Error('Store overview clipped markers');
   const view=v==='shops'||v==='fireworks'?v:'route';
   for(const [name,id] of [['route','panel-route'],['shops','stores'],['fireworks','fireworks']]){
     if(document.getElementById(id).hidden!==(name!==view))throw Error('Wrong linked panel: '+v);
   }
   if(view==='route'&&hits.some(h=>String(h.id).startsWith('shop-')))throw Error('Route markers mixed with shop view');
   if(view==='route'&&document.querySelectorAll('.route-row').filter(r=>!r.hidden).length!==active().length)throw Error('Route segment list mismatch');
 }
 if(hits.filter(h=>String(h.id).startsWith('view-')).length!==5)throw Error('Missing viewing marker');
 for(const [width,height] of [[320,400],[375,400],[760,600],[800,710]]){
   size.width=width;size.height=height;resize();
   for(const view of ['all','shops','fireworks']){
     setStage(view);
     const count=view==='all'?hits.filter(h=>typeof h.id==='number').length:view==='shops'?hits.filter(h=>String(h.id).startsWith('shop-')).length:hits.filter(h=>String(h.id).startsWith('view-')).length;
     if(count!==(view==='all'?20:view==='shops'?mappedShops.length:5))throw Error('Clipped markers at '+width+' / '+view);
     for(let i=0;i<hits.length;i++)for(let j=i+1;j<hits.length;j++){
       if(Math.hypot(hits[i].x-hits[j].x,hits[i].y-hits[j].y)<39.9)throw Error('Overlapping marker targets at '+width+' / '+view);
     }
   }
 }
 size.width=800;size.height=710;resize();
 for(const s of mappedShops){locate(s.id);if(selected!==s.id||!hits.some(h=>h.id===s.id))throw Error('Store not reachable: '+s.id)}
 setStage('all');openHistory(13);
 if(historyOverlay.hidden||historyOpenId!==13)throw Error('History did not open');
 if(!document.querySelector('.workspace-nav').inert||!document.querySelector('.route-panel').inert)throw Error('History background remained interactive');
 closeHistory();if(!historyOverlay.hidden)throw Error('History did not close');
 if(document.querySelector('.workspace-nav').inert||document.querySelector('.route-panel').inert)throw Error('History did not restore background');
`,sandbox);
(async()=>{
 await get('fullscreen-toggle').onclick();
 assert.equal(vm.runInContext('mapExpanded()',sandbox),true);
 await get('fullscreen-toggle').onclick();
 assert.equal(vm.runInContext('mapExpanded()',sandbox),false);
 // Escape exits the expanded workspace after any place detail closes.
 await get('fullscreen-toggle').onclick();
 assert.equal(vm.runInContext('pageFullscreen',sandbox),true);
 vm.runInContext("document.getElementById('map-detail').hidden=true",sandbox);
 for(const fn of listeners.get('keydown'))fn({key:'Escape',preventDefault(){}});
 assert.equal(vm.runInContext('mapExpanded()',sandbox),false);
 console.log('Linked panels, marker reachability, history and workspace expansion passed');
})().catch(e=>{console.error(e);process.exitCode=1});
'''], cwd=ROOT, text=True, capture_output=True)
    assert result.returncode == 0, result.stdout + result.stderr
