import json
import re
import shutil
import subprocess
from pathlib import Path


ROOT = Path(__file__).parent


def test_public_page():
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    for asset in re.findall(r'(?:src|href)="(\./(?:data|src)/[^"]+)"', html):
        assert (ROOT / asset).is_file()
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
get('route-map').getContext=()=>ctx;
get('history-overlay').hidden=true;
get('map-panel').children=[get('route-map'),get('map-markers'),get('history-overlay')];
const document={getElementById:get,createElement:element,querySelector:()=>element(),querySelectorAll:()=>[],body:element(),activeElement:element(),fullscreenEnabled:false,
 addEventListener(name,fn){if(!listeners.has(name))listeners.set(name,[]);listeners.get(name).push(fn)}};
const sandbox={document,console,ResizeObserver:class{observe(){}},devicePixelRatio:1,requestAnimationFrame:()=>0};
vm.createContext(sandbox);
for(const file of ['data/map.js','data/content.js','src/app.js'])vm.runInContext(fs.readFileSync(file,'utf8'),sandbox);
vm.runInContext(`
 resize();
 for(const v of ['all','1','2','3','shops','fireworks']){
   setStage(v);const c=camera();if(!Number.isFinite(c.scale)||c.scale<=0)throw Error('Invalid camera: '+v);
   if(v==='shops'&&hits.filter(h=>String(h.id).startsWith('shop-')).length!==mappedShops.length)throw Error('Store overview clipped markers');
 }
 if(hits.filter(h=>String(h.id).startsWith('view-')).length!==5)throw Error('Missing viewing marker');
 for(const s of mappedShops){locate(s.id);if(selected!==s.id||!hits.some(h=>h.id===s.id))throw Error('Store not reachable: '+s.id)}
 setStage('all');openHistory(13);
 if(historyOverlay.hidden||historyOpenId!==13)throw Error('History did not open');
 closeHistory();if(!historyOverlay.hidden)throw Error('History did not close');
`,sandbox);
(async()=>{
 await get('fullscreen-toggle').onclick();
 assert.equal(vm.runInContext('mapExpanded()',sandbox),true);
 await get('fullscreen-toggle').onclick();
 assert.equal(vm.runInContext('mapExpanded()',sandbox),false);
 // A rejected native request must still expand the map.
 document.fullscreenEnabled=true;
 get('map-panel').requestFullscreen=()=>Promise.reject(Error('Unavailable'));
 await get('fullscreen-toggle').onclick();
 assert.equal(vm.runInContext('pageFullscreen',sandbox),true);
 vm.runInContext("document.getElementById('map-detail').hidden=true",sandbox);
 for(const fn of listeners.get('keydown'))fn({key:'Escape',preventDefault(){}});
 assert.equal(vm.runInContext('mapExpanded()',sandbox),false);
 get('map-panel').requestFullscreen=async()=>{document.fullscreenElement=get('map-panel');for(const fn of listeners.get('fullscreenchange'))fn()};
 document.exitFullscreen=async()=>{document.fullscreenElement=null;for(const fn of listeners.get('fullscreenchange'))fn()};
 await get('fullscreen-toggle').onclick();
 assert.equal(vm.runInContext('mapExpanded()',sandbox),true);
 assert.equal(vm.runInContext('pageFullscreen',sandbox),false);
 await get('fullscreen-toggle').onclick();
 assert.equal(vm.runInContext('mapExpanded()',sandbox),false);
 console.log('Map views, shop reachability, history and fullscreen fallback passed');
})().catch(e=>{console.error(e);process.exitCode=1});
'''], cwd=ROOT, text=True, capture_output=True)
    assert result.returncode == 0, result.stdout + result.stderr
