import { STATIONS, STATION_BY_ID, PERSONAS, createWorld, stepWorld, intervene, snapshot, fatePull, destinationScores, installModernPois, removeModernPois } from "./core.mjs";
import { buildModernStations } from "./poi-world.mjs";
import { buildMapModel, mapModelSignature, poiKey } from "./map/map-model.mjs";
import { makeModernRouteRequest } from "./map/route-contract.mjs";
import { resolveRouteProvider, createRouteClient, routeFailureLabel } from "./map/route-provider.mjs";
import { createModernMap } from "./map/modern-map.mjs";
import { buildAgentObservations } from "./map/agent-observation.mjs";

import { loadPoiSample, distanceMeters } from "./openpoi.mjs";
import { FATE_RULES, chapterMetrics } from "./fate.mjs";
import { createHistoricalGeoRequest } from "./geography-bridge.mjs";
import { buildFateStages, readinessView, upcomingCheckpoints, endingLabel, createTrail, recordTrail, truncateTrail, chartModel, applyObservationScenario, CHART, CHART_COMPACT, LEADER_ID } from "./map/fate-timeline.mjs";

const q = selector => document.querySelector(selector);
const svgNS = "http://www.w3.org/2000/svg";
const sourceLinks = {
  H01: ["国立公文書館（屋島・壇ノ浦）", "https://www.archives.go.jp/exhibition/digital/heikemonogatari/contents/07.html"],
  H02: ["兵庫県立歴史博物館（人物）", "https://rekihaku.pref.hyogo.lg.jp/digital_museum/etoki/byoubu_character/"],
  H03: ["青森県史（平家物語・嗣信最期）", "https://kenshi-archives.pref.aomori.lg.jp/il/meta_pub/G0000004txt_Anci-1-2-2069a"],
  H04: ["国会図書館レファレンス（田口成良）", "https://crd.ndl.go.jp/reference/detail?page=ref_view&id=1000151120"],
  H05: ["國學院大學（那須与一・実在性）", "https://www.kokugakuin.ac.jp/article/306438"],
  H06: ["国立公文書館（年表）", "https://www.archives.go.jp/exhibition/digital/heikemonogatari/contents/history.html"],
  H07: ["国立公文書館（水島合戦）", "https://www.archives.go.jp/exhibition/digital/heikemonogatari/contents/05.html"],
  H08: ["『吾妻鏡』巻四（公開翻刻）", "https://zh.wikisource.org/wiki/吾妻鏡/卷004"],
  H09: ["国立公文書館（史料の比較）", "https://www.archives.go.jp/exhibition/digital/heikemonogatari/contents/20.html"],
};

const evidenceLabels = {
  secondary_supported: ["研究・解説", ""],
  exhibition_summary_checked: ["展示解説", ""],
  reference_summary_checked: ["辞典の摘要", ""],
  gunki_excerpt_checked: ["軍記本文抄出", "caution"],
  gunki_summary_checked: ["軍記の解説", "caution"],
  later_chronicle_text_located: ["後世史書の記録", "caution"],
  scholarly_interpretation: ["研究上の仮説", "caution"],
  disputed_secondary: ["異説あり", "caution"],
  historical_not_assessed: ["史実性未確認", "unverified"],
  not_assessed: ["未確認", "unverified"],
  not_located: ["所在未確認", "unverified"],
  needs_source_review: ["要追加照合", "unverified"],
};

let roster = [];
let claims = [];
let selected = "C036";
let world = createWorld(1185);
// MAP-04 observation trail of the leader (UI-only; rebuilt from the same deterministic steps).
let trail = recordTrail(createTrail(), world);
let checkpoint = null;
let timer = null;
let loadedModernPois = [];
let poiEnabled = false;
let heritageSites = [];
let modernMap = null;
let poiListSignature = "";
let observedPoiKey = null;
// MAP-03B route preview state. Keys are facility name + real coordinates.
const routeProvider = resolveRouteProvider(location.search, location.hostname);
const routeClient = createRouteClient({ provider: routeProvider });
let routeOriginKey = null;
let routeDestinationKey = null;
let routeShownFor = null;
let routeBusy = false;
let routeEndpointsSignature = null;

const element = (tag, cls, value) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (value !== undefined) e.textContent = value;
  return e;
};
const svgNode = (name, attrs = {}) => {
  const e = document.createElementNS(svgNS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
};

// Read CSV as data, never markup. Handles quoted delimiters and escaped quotes.
export function parseCSV(text) {
  const rows = []; let row = []; let field = ""; let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') { field += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) { row.push(field); field = ""; }
    else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some(x => x !== "")) rows.push(row);
      row = []; field = "";
    } else field += char;
  }
  if (inQuotes) throw new Error("CSVの引用符が閉じていません");
  if (field || row.length) { row.push(field); rows.push(row); }
  if (rows.length < 2) throw new Error("人物資料の行数が不足しています");
  const [head, ...data] = rows;
  return data.map(cells => Object.fromEntries(head.map((name, i) => [name, cells[i] ?? ""])));
}


function renderHeritageSites(sites) {
  const root = q("#heritage-sites"); root.replaceChildren();
  for (const site of sites) {
    const card = element("div", "heritage-card");
    const header = element("div", "heritage-card-head");
    header.append(element("strong", "", site.name), element("span", "person-tag", site.designation || "地域の伝承地"));
    card.append(header);
    const history = element("p", "", site.narrative_association);
    card.append(history);
    const prec = site.location?.precision === "area_representative_not_event_point"
      ? "屋島全体の代表点。事件が起きた位置ではありません"
      : "史跡・伝承地の正確な座標は未照合";
    card.append(element("div", "claim-note", prec));
    const source = site.source_urls?.[0];
    if (typeof source === "string" && source.startsWith("https://")) {
      const link = element("a", "heritage-source", "根拠の資料を見る ↗");
      link.href = source; link.target = "_blank"; link.rel = "noopener noreferrer";
      card.append(link);
    }
    root.append(card);
  }
}

async function loadHeritageSites() {
  try {
    const response = await fetch("../data/places/YASHIMA_SITE_REGISTRY.json", {cache:"no-cache"});
    if (!response.ok) throw new Error("史跡台帳を取得できません");
    const data = await response.json();
    if (!Array.isArray(data.sites) || !data.sites.length) throw new Error("史跡台帳の形式が異なります");
    heritageSites = data.sites;
    renderHeritageSites(data.sites);
    renderModernMap();
    const precise = data.sites.filter(s => s.location?.precision === "verified_site_point").length;
    q("#heritage-status").textContent = data.sites.length + "地点登録。史跡単位の実測座標は" + precise + "件。現在地と伝承は分けて表示。";
  } catch (error) {
    q("#heritage-status").classList.add("error");
    q("#heritage-status").textContent = "史跡台帳の読み込みに失敗：" + error.message;
  }
}

function renderPoiIntegrationStatus() {
  const count=world.modernPois?.length||0;
  q("#activate-poi").disabled=loadedModernPois.length===0 || buildModernStations(loadedModernPois).length===0;
  q("#remove-poi").disabled=count===0;
  q("#poi-integration-status").textContent=count
    ? "現代施設 "+count+" 件を自律行動へ反映中"
    : (loadedModernPois.length ? "行動候補への追加待ち" : "仮想施設のみで行動中");
}
function activateModernPois() {
  stop();
  const result=installModernPois(world,loadedModernPois);
  if(result.added===0){ q("#poi-status").textContent="用途・出典を確認できる行動候補がありません。"; return; }
  poiEnabled=true;
  render();
}
function deactivateModernPois() {
  stop(); removeModernPois(world);poiEnabled=false;render();
}
function renderModernStations() {
  const layer=q("#modern-station-layer");layer.replaceChildren();
  for(const p of world.modernPois||[]) {
    const item=svgNode("g",{"aria-label":"現代施設："+p.label});
    const dot=svgNode("circle",{cx:p.x,cy:p.y,r:8,class:"modern-station-dot"});
    const title=svgNode("title");
    title.textContent=p.label+"（実在施設の所在地を模式図に簡略投影。道路ではありません）";
    dot.append(title);
    item.append(dot);
    layer.append(item);
  }
}

async function fetchModernPoi() {
  const button=q("#fetch-poi");
  button.disabled=true;
  q("#poi-status").classList.remove("error");
  q("#poi-status").textContent="OpenPOIから読み込み中…";
  try {
    const sample=await loadPoiSample();
    loadedModernPois=sample.records;
    const usable=buildModernStations(loadedModernPois);
    q("#poi-status").textContent="返却 "+sample.responseCount+"件／検査済み "+sample.returned+
      "件／行動候補 "+usable.length+"件（用途未分類 "+sample.unknown+"件、不正座標 "+sample.invalid+
      "件、範囲外 "+sample.outOfRange+"件）。"+
      (sample.saturated?"検索上限に達しているため全施設ではありません。":"施設の網羅性・営業状況は保証されません。");
    poiListSignature="";
  } catch(error) {
    q("#poi-status").classList.add("error");
    q("#poi-status").textContent="施設情報を取得できません："+error.message+"。通信環境・CORS・API状態を確認してください。";
  } finally {
    button.disabled=false;
    renderPoiIntegrationStatus();
    renderModernMap();
    if(modernMap?.ready) setMapStatus("ready");
  }
}

// Cards reflect the live adoption state: adopted / eligible / reference only.
function renderPoiList(model) {
  const signature=mapModelSignature(model)+"|"+loadedModernPois.length;
  if(signature===poiListSignature) return;
  poiListSignature=signature;
  const list=q("#poi-list");list.replaceChildren();
  if(!loadedModernPois.length) return;
  const featured=model.pois.filter(p=>p.status==="adopted"||p.status==="eligible");
  const extras=model.pois.filter(p=>p.status!=="adopted"&&p.status!=="eligible").slice(0,4);
  for(const p of [...featured,...extras]) {
    const card=element("div","poi-card");
    const top=element("div","poi-top");
    top.append(element("strong","",p.name),element("span","person-tag",p.distanceMeters+"m"));
    card.append(top);
    const css=p.status==="adopted"?"adopted":p.status==="eligible"?"eligible":"ref";
    const meta=element("p","");
    meta.append(element("span","person-tag poi-status "+css,p.statusLabel),document.createTextNode(p.actionLabel+" ／ "+(p.address||"住所情報なし")));
    card.append(meta);
    card.append(element("p","poi-source","出典："+p.source+" ／ "+p.licenses.join(", ")));
    card.append(element("p","poi-source","帰属："+p.attributions.join("; ")));
    const locate=element("button","button quiet poi-locate","地図で位置を見る");
    locate.type="button";
    locate.dataset.poiKey=p.key;
    locate.addEventListener("click",()=>showOnMap(p.key));
    card.append(locate);
    list.append(card);
  }
  if(model.pois.length===0) list.append(element("p","helper","近くの施設が取得できませんでした。"));
  if(featured.length===0) list.append(element("p","helper","行動へ利用できる分類・出典付き施設はありません。"));
}

function currentMapModel() {
  // Saved/adopted facilities remain observable even after a different search result.
  const records=[...loadedModernPois];
  for(const p of world.modernPois ?? []) records.push({name:p.label,...p.modernLocation,...p.provenance});
  const model=buildMapModel({records,adoptedPois:world.modernPois,sites:heritageSites});
  if(!model.pois.some(p=>p.key===observedPoiKey)) observedPoiKey=null;
  model.observations=buildAgentObservations(world,Number(q("#gravity").value));
  model.selectedAgentId=selected;
  model.selectedPoiKey=observedPoiKey;
  return model;
}
function renderModernMap() {
  const model=currentMapModel();
  renderPoiList(model);
  renderMapObservation(model);
  modernMap?.update(model);
  renderRoutePanel();
}

// Endpoints are sourced modern facilities only (adopted or eligible). Reference-only
// POIs, fictional stations, heritage points and characters can never be selected.
function routeEndpoints() {
  const out=new Map();
  const adopted=world.modernPois ?? [];
  for(const p of [...adopted,...buildModernStations(loadedModernPois)]) {
    const key=poiKey(p.label,p.modernLocation.lat,p.modernLocation.lng);
    if(!out.has(key)) out.set(key,{key,place:p,adopted:adopted.includes(p)});
  }
  return out;
}
function fillRouteSelect(select,endpoints,value) {
  select.replaceChildren(new Option("— 施設を選択 —",""));
  for(const e of endpoints.values()) select.append(new Option(e.place.label+(e.adopted?"（行動候補）":"（採用可）"),e.key));
  select.value=value ?? "";
}
function selectedRouteRequest(endpoints=routeEndpoints()) {
  const o=endpoints.get(routeOriginKey), d=endpoints.get(routeDestinationKey);
  if(!o || !d) return null;
  return {o,d,result:makeModernRouteRequest(o.place,d.place)};
}
function clearRoute(message="") {
  modernMap?.clearRoute();
  routeShownFor=null;
  const result=q("#route-result");
  result.className="route-result";
  result.textContent=message;
}
function renderRoutePanel() {
  const endpoints=routeEndpoints();
  const signature=[...endpoints.values()].map(e=>e.key+(e.adopted?"*":"")).join(",");
  if(signature!==routeEndpointsSignature) {
    routeEndpointsSignature=signature;
    if(!endpoints.has(routeOriginKey)) routeOriginKey=null;
    if(!endpoints.has(routeDestinationKey)) routeDestinationKey=null;
    fillRouteSelect(q("#route-origin"),endpoints,routeOriginKey);
    fillRouteSelect(q("#route-destination"),endpoints,routeDestinationKey);
    if(routeShownFor && !(endpoints.has(routeShownFor.origin) && endpoints.has(routeShownFor.destination)))
      clearRoute("選択した施設が候補から外れたため、経路を消しました。");
  }
  q("#route-provider").textContent="経路："+routeProvider.label;
  q("#route-provider-note").textContent=routeProvider.note;
  const check=q("#route-check");
  const picked=selectedRouteRequest(endpoints);
  let ok=false;
  if(endpoints.size<2) check.textContent="経路の端点にできる施設が2件以上必要です。「周辺施設を取得」後に選べます（参照のみの施設は対象外）。";
  else if(!picked) check.textContent="出発施設と到着施設を選んでください。";
  else if(!picked.result.ok) check.textContent=routeFailureLabel(picked.result.reason)+"。";
  else {
    ok=true;
    const straight=Math.round(distanceMeters(picked.o.place.modernLocation,picked.d.place.modernLocation));
    check.textContent="照会できます。施設間の直線距離は約"+straight+"m（道路経路ではありません）。"+
      (routeProvider.available?"":"経路プロバイダーが未設定のため、道路経路は取得しません。");
  }
  check.classList.toggle("warn",Boolean(picked) && !ok);
  q("#route-fetch").disabled=!ok || !routeProvider.available || routeBusy;
  q("#route-fetch").textContent=routeBusy?"問い合わせ中…":"経路を取得";
  q("#route-clear").disabled=!routeShownFor && !q("#route-result").textContent;
}
async function fetchRoute() {
  const picked=selectedRouteRequest();
  if(!picked?.result.ok || !routeProvider.available || routeBusy) return;
  const keys={origin:picked.o.key,destination:picked.d.key};
  routeBusy=true;
  clearRoute("経路を問い合わせ中…（"+routeProvider.label+"）");
  renderRoutePanel();
  const reviewed=await routeClient.fetchRoute(picked.result.request);
  routeBusy=false;
  // A reply for an outdated selection is discarded rather than drawn.
  if(routeOriginKey!==keys.origin || routeDestinationKey!==keys.destination) { clearRoute(); renderRoutePanel(); return; }
  const result=q("#route-result");
  if(!reviewed.ok) {
    clearRoute();
    result.className="route-result error";
    result.textContent=routeFailureLabel(reviewed.reason)+"。直線や推定の線は描きません。";
  } else {
    const preview=reviewed.routePreview;
    const drawn=Boolean(modernMap?.showRoute(preview,routeProvider.attributionHtml));
    routeShownFor=keys;
    result.className="route-result";
    result.replaceChildren(
      element("p","",picked.o.place.label+" → "+picked.d.place.label),
      element("p","","経路長 約"+Math.round(preview.distanceMeters)+"m（提供元の推定・徒歩）"+(reviewed.cached?"／前回の取得結果":"")),
      element("p","poi-source","提供元："+preview.provenance.attribution+" ／ ライセンス："+preview.provenance.license+" ／ 取得："+preview.provenance.retrievedAt),
      element("p","poi-source","人物の移動・所要時間・1185年の道ではありません。通行可否・安全は未確認です。"));
    if(!drawn) result.append(element("p","poi-source","地図を表示できないため、線は描いていません。"));
  }
  renderRoutePanel();
}

function renderMapObservation(model) {
  const root=q("#map-observation");root.replaceChildren();
  const people=element("div","map-observation-people");
  for(const a of model.observations) {
    const button=element("button","button quiet",a.name);
    button.type="button";button.dataset.agentId=a.agentId;
    button.setAttribute("aria-pressed",String(a.agentId===selected));
    button.addEventListener("click",()=>{selected=a.agentId;observedPoiKey=null;render();});
    people.append(button);
  }
  root.append(people);
  const a=model.observations.find(a=>a.agentId===selected);
  if(!a) root.append(element("p","helper","選択人物は資料のみ表示。仮想移動の対象ではありません。"));
  else {
    const detail=element("div","map-agent-detail");
    detail.append(element("strong","",a.name+"｜"+a.statusLabel),
      element("p","","第 "+a.tick+" 刻 ／ "+(a.movementStatus==="arrived"?"到着先：":"目的地：")+a.stationLabel),
      element("p","","直近の選択理由："+a.lastDecision));
    if(a.blockedReason) detail.append(element("p","helper","観測データの診断："+a.blockedReason+"（道路障害の判定ではありません）"));
    if(a.facilityKey && model.pois.some(p=>p.key===a.facilityKey)) {
      const locate=element("button","button map-destination",(a.movementStatus==="arrived"?"到着先":"目的地")+"施設の位置を見る");locate.type="button";
      locate.addEventListener("click",()=>showOnMap(a.facilityKey));detail.append(locate);
    } else detail.append(element("p","helper","実座標を持つ目的地施設はありません。人物の位置は模式図で確認できます。"));
    root.append(detail);
    const interests=element("div","map-interests");
    interests.append(element("p","helper","現代施設への現在の関心（仮想得点・訪問予測ではありません）"));
    for(const interest of a.interests.slice(0,3)) {
      const row=element("div","map-interest");
      row.append(element("span","",interest.label+"："+interest.why+" ／ "+interest.score));
      if(model.pois.some(p=>p.key===interest.key)) {
        const b=element("button","button quiet","施設を見る");b.type="button";
        b.addEventListener("click",()=>showOnMap(interest.key));row.append(b);
      }
      interests.append(row);
    }
    if(!a.interests.length) interests.append(element("p","helper","現代施設の行動候補は未追加です。"));
    root.append(interests);
  }
  const p=model.pois.find(p=>p.key===observedPoiKey);
  if(p) {
    const facility=element("div","map-facility-detail");
    facility.append(element("strong","",p.name+"｜"+p.statusLabel));
    const related=model.observations.filter(a=>a.facilityKey===p.key);
    facility.append(element("p","",related.length?related.map(a=>a.name+"："+a.statusLabel).join(" ／ "):"この施設を目的地・到着先とする人物はいません。"));
    for(const person of model.observations) {
      const interest=person.interests.find(i=>i.key===p.key);
      if(interest) facility.append(element("p","",person.name+"の現在の関心："+interest.why+" ／ "+interest.score+"（仮想得点）"));
    }
    facility.append(element("p","helper","施設の座標を表示しています。人物の現在地・実際の到着を示しません。"));
    root.append(facility);
  }
}
// A tile warning stays visible once raised; the "not fetched" hint follows POI state.
function setMapStatus(kind,text) {
  const status=q("#map-status");
  if(kind==="warning" || (kind!=="error" && modernMap?.tilesFailed)) {
    status.className="load-status map-status warning";
    status.textContent=kind==="warning"?text:status.textContent;
    return;
  }
  status.className="load-status map-status"+(kind==="error"?" error":"");
  status.textContent=kind==="ready"
    ? (loadedModernPois.length?"":"現代施設は未取得です。下の「周辺施設を取得」で地図に表示されます。")
    : text;
}
async function setView(mode) {
  const showMap=mode==="map";
  q("#schematic-view").hidden=showMap;
  q("#map-view").hidden=!showMap;
  q("#view-schematic").setAttribute("aria-pressed",String(!showMap));
  q("#view-map").setAttribute("aria-pressed",String(showMap));
  if(!showMap) return false;
  if(!modernMap) modernMap=createModernMap({container:q("#modern-map"),onStatus:setMapStatus,onPoiSelect:key=>{
    observedPoiKey=key;renderModernMap();
  }});
  modernMap.update(currentMapModel());
  return modernMap.open();
}
async function showOnMap(key) {
  observedPoiKey=key;
  renderModernMap();
  const ok=await setView("map");
  if(ok) modernMap.focus(key);
  q("#map-view").scrollIntoView({block:"nearest"});
}

function renderStations() {
  const root = q("#station-layer"); root.replaceChildren();
  for (const p of STATIONS) {
    const group = svgNode("g", { "aria-label": p.label });
    const circle = svgNode("circle", { cx: p.x, cy: p.y, r: p.kind === "fate" ? 12 : 9, class: "station-icon " + (p.kind === "fate" ? "fate" : "") });
    const title = svgNode("title"); title.textContent = p.summary;
    circle.append(title);
    const label = svgNode("text", { x: p.x + 16, y: p.y - 10, class: "station-label" });
    label.textContent = p.label;
    group.append(circle, label);
    root.append(group);
  }
}

function renderAgents() {
  const root = q("#agent-layer"); root.replaceChildren();
  for (const a of world.agents) {
    const group = svgNode("g", { "aria-label": a.name });
    const kind = a.id === "C115" ? "story" : "source";
    const circle = svgNode("circle", {
      cx: a.x, cy: a.y, r: 21,
      class: "agent-ring " + kind + (selected === a.id ? " selected" : "")
    });
    const title = svgNode("title"); title.textContent = a.name + "（架空の行動・座標）";
    circle.append(title);
    const symbol = svgNode("text", { x: a.x, y: a.y, class: "agent-text" });
    symbol.textContent = a.short.substring(0, 2);
    const label = svgNode("text", { x: a.x, y: a.y + 40, class: "agent-name" });
    label.textContent = a.name;
    group.append(circle, symbol, label);
    root.append(group);
  }
}

function renderRoster() {
  const root = q("#people-list"); root.replaceChildren();
  for (const p of roster) {
    const b = element("button", "person-item" + (p.candidate_id === selected ? " active" : ""));
    b.type = "button";
    b.setAttribute("aria-pressed", p.candidate_id === selected ? "true" : "false");
    b.addEventListener("click", () => { selected = p.candidate_id; observedPoiKey=null; render(); });
    const left = element("div", "person-main");
    left.append(element("div", "person-name", p.display_name));
    left.append(element("div", "person-small", p.research_group.replace("東国武士・鎌倉勢力・義経郎党", "東国・義経郎党").replace("実在・人物像の監査重点（文学・伝承）", "軍記・伝承の監査重点")));
    const right = element("div", "person-right");
    if (world.agents.some(a => a.id === p.candidate_id)) right.append(element("span", "person-activity", "● 移動試験中"));
    right.append(element("span", "person-tag", p.research_state === "draft_not_verified" ? "個票草稿" : "候補"));
    b.append(left, right); root.append(b);
  }
}

function renderStatus() {
  const entry = roster.find(r => r.candidate_id === selected);
  const agent = world.agents.find(a => a.id === selected);
  q("#person-title").textContent = entry?.display_name ?? "人物を選択";
  q("#person-stage").textContent = "史実監査 未完了";
  q("#person-subtitle").textContent = entry
    ? "区分：" + entry.research_group + "　／　" + entry.candidate_id + "　※解説は原史料の認定ではありません"
    : "人物名簿の読み込みを確認してください。";
  const parent = q("#agent-status"); parent.replaceChildren();
  if (!agent) {
    parent.append(element("strong", "stat-title", "人物資料のみ表示"));
    parent.append(element("p", "stat-note", "この人物は仮想移動の3名には含まれません。史実上の所在を推定してマップに置くことはしていません。"));
  } else {
    const head = element("div", "stat-head");
    head.append(element("span", "stat-title", "運命の引力（ゲーム値）"), element("strong", "mononum", String(fatePull(agent, Number(q("#gravity").value))) + " / 100"));
    parent.append(head);
    for (const [name, value, cls] of [
      ["運命", fatePull(agent, Number(q("#gravity").value)), "fate"],
      ["体力", agent.energy, ""], ["食料", agent.provisions, ""], ["士気", agent.morale, ""]
    ]) {
      const r = element("div", "meter-row"); const bar = element("div", "track");
      const fill = element("div", "fill " + cls); fill.style.width = Math.round(value) + "%";
      bar.append(fill); r.append(element("span", "", name), bar, element("span", "mononum", String(Math.round(value)))); parent.append(r);
    }
    const destination=STATION_BY_ID[agent.target] ?? world.modernPois?.find(p=>p.id===agent.target);
    parent.append(element("p", "stat-note", "目的地："+(destination?.label || "再検討中")+" ／ 所持金："+agent.money+" ／ "+agent.note));
  }
  q("#advise").disabled = !agent || world.interventionBudget === 0;
  q("#support").disabled = !agent || world.interventionBudget === 0;
  q("#mediate").disabled = !agent || agent.id !== "C036" || world.interventionBudget === 0 || Boolean(world.fate?.resolution);
  q("#budget").textContent = "残り " + world.interventionBudget + " 回";
}

function renderClaims() {
  const root = q("#claims"); root.replaceChildren();
  const selectedClaims = claims.filter(c => c.candidate_id === selected);
  if (!selectedClaims.length) {
    root.append(element("p", "helper", "主張データが読み込まれていません。")); return;
  }
  for (const c of selectedClaims) {
    const article = element("article", "claim-card");
    const meta = element("div", "claim-meta");
    const [label, css] = evidenceLabels[c.evidence_status] ?? [c.evidence_status, "unverified"];
    meta.append(element("span", "claim-badge " + css, label), element("span", "", c.claim_id), element("span", "", c.reference_period));
    article.append(meta, element("p", "", c.claim_or_research_question));
    const info = element("div", "claim-note", "留保：" + (c.limitations || "追加の確認が必要"));
    article.append(info);
    const source = sourceLinks[c.source_id];
    const link = element("a", "", source ? "資料の参照先：" + source[0] + " ↗" : "出典ID：" + c.source_id + "（リンク未整備）");
    if (source) { link.href = source[1]; link.target = "_blank"; link.rel = "noopener noreferrer"; }
    article.append(link); root.append(article);
  }
}

function renderDecision() {
  const root = q("#decision"); root.replaceChildren();
  const a = world.agents.find(x => x.id === selected);
  if (!a) {
    root.append(element("p", "", "人物のゲーム人格を設定していないため、行動予測はありません。"));
    return;
  }
  root.append(element("p", "", "直近の選択理由：" + a.lastDecision));
  const list = element("div", "score-list");
  for (const v of destinationScores(a, Number(q("#gravity").value), world).slice(0, 4)) {
    const row = element("div", "score-row");
    const bar = element("div", "track");
    const fill = element("div", "fill"); fill.style.width = Math.max(0, Math.min(100, v.score)) + "%";
    bar.append(fill);
    row.append(element("span", "", v.label.replace("（仮）", "")), bar, element("span", "mononum", String(Math.round(v.score))));
    row.title = v.why + "を含む架空の評価得点";
    list.append(row);
  }
  root.append(list);
}

// MAP-04: the chapter as a short causal chain. Every stage, reason and ending is
// read from world.fate (fate.mjs); this view never re-derives a decision.
function renderFate() {
  const f=world.fate;
  const m=chapterMetrics(world, Number(q("#gravity").value));
  const leader=world.agents.find(a=>a.id===LEADER_ID);
  const label={watching:"運命はまだ遠い",approaching:"運命が近づく",postponed:"攻撃を延期",resolved:"屋島篇の結末"};
  const reconsidered=f.decisions.some(d=>d.kind==="reconsidered");
  q("#fate-phase").textContent=f.resolution?label.resolved:(f.phase==="postponed"&&reconsidered?"回復・帰還待ち":label[f.phase] || "観察中");

  const steps=q("#fate-steps");steps.replaceChildren();
  for(const stage of buildFateStages(f,world.tick)) {
    const li=element("li","fate-step "+stage.status+(stage.tone?" "+stage.tone:""));
    li.dataset.stage=stage.id;
    li.append(element("strong","",stage.label));
    li.append(element("span","fs-tick",stage.status==="done" ? "第 "+stage.tick+" 刻" : (stage.note || (stage.tick!=null ? "第 "+stage.tick+" 刻" : ""))));
    steps.append(li);
  }

  // The latest recorded decision's own causes are the authoritative "why".
  const causes=q("#fate-causes");causes.replaceChildren();
  const latest=[...f.decisions].reverse().find(d=>d.kind==="postponed"||d.kind==="reconsidered");
  if(latest && !f.resolution) {
    causes.append(element("span","fate-cause-label","第 "+latest.tick+" 刻の判定理由："));
    for(const c of latest.causes||[]) causes.append(element("span","fate-cause",c));
  }

  const status=q("#fate-status");status.replaceChildren();
  const chip=(text,cls="")=>status.append(element("span","fate-chip"+(cls?" "+cls:""),text));
  if(f.resolution) {
    const r=f.resolution;
    chip("第 "+r.resolvedAt+" 刻に確定："+endingLabel(r));
    chip(r.metrics?.atDecisionSite?"確定時：屋島にいた":"確定時：屋島の外");
  } else if(leader) {
    const v=readinessView(leader,m);
    chip(v.atSite?"現在地：屋島":"現在地：屋島の外");
    for(const k of ["energy","provisions","readiness"]) {
      const item=v[k];
      chip(item.label+" "+item.value+" / "+item.min+(item.ok?"":" 不足"),item.ok?"ok":"bad");
    }
    const next=upcomingCheckpoints(f,world.tick)[0];
    if(next) chip("次：第 "+next.tick+" 刻 "+next.label,"next");
  }

  const reasons=q("#fate-reasons");reasons.replaceChildren();
  const resolution=f.resolution;
  if(resolution){
    q("#fate-description").textContent=resolution.title+"。"+resolution.summary;
    reasons.append(element("div","fate-stamp","第 "+resolution.resolvedAt+" 刻｜分岐確定（ゲーム上の判定）"));
    for(const cause of resolution.factors) reasons.append(element("div","fate-reason",cause));
    if(resolution.journey?.length){
      reasons.append(element("div","fate-stamp","この周回の道中で起きたこと"));
      for(const stop of resolution.journey) reasons.append(element("div","fate-reason","第 "+stop.tick+" 刻： "+stop.text));
    }
    reasons.append(element("div","fate-footnote","世界の生活は続きます。再生すると章の結末を保持したまま人物が移動します。"));
  }else{
    q("#fate-description").textContent=
      f.phase==="postponed" && reconsidered ? "体力と食料は戻った。屋島へ戻れば、改めて交戦か交渉を判断する。" :
      f.phase==="postponed" ? "攻撃を延期中。第 "+f.postponedUntil+" 刻の再判断までに、体力と食料が戻るか。" :
      f.phase==="approaching" ? (m.arrived?"屋島に着いても、戦うとは限らない。準備が整うかどうか。":"機会は近い。義経はまだ屋島に着いていない。") :
      "人物の寄り道も、運命の結末を変える。";
    if(m.negotiationBias) reasons.append(element("div","fate-preview","交渉意向 "+m.negotiationBias+"（仮想値。助言の受諾で上がる）"));
  }

  renderFateChart();
  renderFateTrail();
  // Stable semantic ID only; the future historical-province engine supplies verified GIS separately.
  const geo=createHistoricalGeoRequest();
  q("#fate-title").title="地理連携待機中："+geo.feature.provinceLabel+"（旧国名エンジン側の地物ID・中世座標・経路は未接続）";
}

function renderFateChart() {
  const svg=q("#fate-chart");
  const title=svg.querySelector("title");
  svg.replaceChildren(title);
  const dims=svg.clientWidth && svg.clientWidth<480 ? CHART_COMPACT : CHART;
  svg.setAttribute("viewBox","0 0 "+dims.width+" "+dims.height);
  const c=chartModel(trail,world.fate,world.tick,dims);
  const top=dims.top, bottom=dims.height-dims.bottom;
  const add=(name,attrs,text)=>{const n=svgNode(name,attrs);if(text!==undefined){const t=svgNode("title");t.textContent=text;n.append(t);}svg.append(n);return n;};
  // Grace first so a short stay at Yashima stays visible on top of it.
  if(c.grace) add("rect",{x:c.grace.x1,y:top,width:Math.max(1,c.grace.x2-c.grace.x1),height:bottom-top,class:"fc-grace"},"延期の猶予（再判断まで）");
  for(const s of c.siteSpans) add("rect",{x:s.x1,y:top,width:Math.max(2,s.x2-s.x1),height:bottom-top,class:"fc-site"},"屋島に滞在");
  for(const v of [0,50,100]) { const t=add("text",{x:dims.left-4,y:c.y(v)+3,class:"fc-axis","text-anchor":"end"}); t.textContent=String(v); }
  for(const mk of c.markers) {
    add("line",{x1:mk.x,x2:mk.x,y1:top,y2:bottom,class:"fc-mark"},"第 "+mk.tick+" 刻："+mk.label);
    const t=add("text",{x:mk.x,y:top-6,class:"fc-mark-label","text-anchor":mk.anchor||"middle"}); t.textContent=mk.label+" "+mk.tick;
  }
  for(const fl of c.floors) add("line",{x1:dims.left,x2:dims.width-dims.right,y1:fl.y,y2:fl.y,class:"fc-floor "+fl.key},(fl.key==="energy"?"体力":"食料")+"の交戦最低ライン "+fl.value);
  if(c.energyPoints) add("polyline",{points:c.energyPoints,class:"fc-line energy"},"体力の推移");
  if(c.provisionsPoints) add("polyline",{points:c.provisionsPoints,class:"fc-line provisions"},"食料の推移");
  for(const e of c.events) add("circle",{cx:e.x,cy:bottom+8,r:3.5,class:"fc-ev "+e.kind},"第 "+e.tick+" 刻："+e.text);
  for(const d of c.decisions) add("path",{d:"M"+d.x+","+(top-1)+"l5,5l-5,5l-5,-5z",class:"fc-dec "+d.kind},"第 "+d.tick+" 刻："+d.title);
  if(c.now!==null) add("line",{x1:c.now,x2:c.now,y1:top,y2:bottom,class:"fc-now"},"現在：第 "+world.tick+" 刻");
  const end=add("text",{x:dims.width-dims.right,y:dims.height-3,class:"fc-axis","text-anchor":"end"}); end.textContent=c.maxT+"刻";
  const start=add("text",{x:dims.left,y:dims.height-3,class:"fc-axis"}); start.textContent="0";
}

function renderFateTrail() {
  const list=q("#fate-trail-list");list.replaceChildren();
  const items=[...trail.events].reverse().slice(0,20);
  for(const e of items) {
    const li=element("li",e.kind);
    li.append(element("span","",String(e.tick).padStart(3,"0")+"刻"),element("span","",e.text));
    list.append(li);
  }
  if(!items.length) { const li=element("li",""); li.append(element("span","","—"),element("span","","まだ記録はありません")); list.append(li); }
  q("#fate-trail summary").textContent="義経の道中記録（"+trail.events.length+"件）";
}

function renderEvents() {
  const root = q("#events"); root.replaceChildren();
  for (const e of world.events.slice(0, 12)) {
    const row = element("div", "event " + e.kind);
    row.append(element("span", "stamp", String(e.tick).padStart(3, "0") + "刻"), element("span", "", e.text)); root.append(row);
  }
}

function render() {
  recordTrail(trail, world);
  q("#clock").textContent = "第 " + world.tick + " 刻";
  q("#gravity-value").textContent = q("#gravity").value;
  q("#to-fate").disabled = Boolean(world.fate.resolution);
  renderRoster(); renderModernStations(); renderAgents(); renderStatus(); renderClaims(); renderDecision(); renderFate(); renderEvents();
  renderPoiIntegrationStatus();
  renderModernMap();
}
function stop() {
  if (timer !== null) { clearInterval(timer); timer = null; }
  q("#play").textContent = "▶ 再生"; q("#play").setAttribute("aria-pressed", "false");
}
function tick() {
  const count = Number(q("#speed").value);
  for (let i = 0; i < count; i++) {
    const unresolved=!world.fate.resolution;
    stepWorld(world, Number(q("#gravity").value));
    recordTrail(trail, world);
    if(unresolved && world.fate.resolution){stop();break;}
  }
  render();
}
function toggle() {
  if (timer !== null) { stop(); return; }
  q("#play").textContent = "Ⅱ 停止"; q("#play").setAttribute("aria-pressed", "true");
  timer = setInterval(tick, 650);
}
function reset() {
  stop();
  world = createWorld(q("#seed").value);
  applyObservationScenario(world, q("#fate-scenario").value);
  if(poiEnabled && loadedModernPois.length) installModernPois(world,loadedModernPois);
  trail = createTrail();
  checkpoint = null;
  q("#restore").disabled = true;
  render();
}

async function load() {
  try {
    const urls = ["../data/people/MASTER_INDEX.csv", "../data/people/YASHIMA_MVP_CLAIMS.csv"];
    const responses = await Promise.all(urls.map(url => fetch(url, { cache: "no-cache" })));
    if (responses.some(r => !r.ok)) throw new Error("資料CSVを取得できません");
    const [people, sourceClaims] = await Promise.all(responses.map(r => r.text()));
    const fullRoster = parseCSV(people);
    roster = fullRoster.filter(x => x.priority === "P0");
    claims = parseCSV(sourceClaims);
    if (roster.length !== 11 || claims.length !== 33 || new Set(claims.map(c => c.candidate_id)).size !== 11)
      throw new Error("11人・33主張の整合性が取れません。データ更新内容を確認してください。");
    q("#load-status").textContent = "11人・33主張を読込済み。人物の史実性は未監査です。";
    q("#people-count").textContent = String(roster.length);
  } catch (err) {
    q("#load-status").classList.add("error");
    q("#load-status").textContent = "人物台帳を読み込めません：" + err.message +
      "。GitHub Pages等のHTTPサーバーで開いてください。ファイル直開きでは動作しません。";
  }
  render();
}

renderStations();
q("#play").addEventListener("click", toggle);
q("#step").addEventListener("click", () => { stop(); tick(); });
q("#to-fate").addEventListener("click", () => {
  stop();
  for(let i=0;i<200 && !world.fate.resolution;i++) { stepWorld(world,Number(q("#gravity").value)); recordTrail(trail, world); }
  render();
});
q("#reset").addEventListener("click", reset);
q("#fate-scenario").addEventListener("change", reset);
q("#gravity").addEventListener("input", render);
q("#advise").addEventListener("click", () => {
  const result = intervene(world, selected, "advise", Number(q("#gravity").value));
  if (!result.ok) window.alert(result.reason);
  render();
});
q("#support").addEventListener("click", () => {
  const result = intervene(world, selected, "support", Number(q("#gravity").value));
  if (!result.ok) window.alert(result.reason);
  render();
});
q("#mediate").addEventListener("click", () => {
  const result=intervene(world, selected, "mediate", Number(q("#gravity").value));
  if(!result.ok) window.alert(result.reason);
  render();
});
q("#save").addEventListener("click", () => {
  checkpoint = { world: snapshot(world), gravity: q("#gravity").value, selected };
  q("#restore").disabled = false;
  world.events.unshift({ tick: world.tick, kind: "system", text: "状態を一時記録しました。次に戻ると記録時点から再計算します。" });
  render();
});
q("#restore").addEventListener("click", () => {
  if (!checkpoint) return;
  stop();
  world = snapshot(checkpoint.world);
  truncateTrail(trail, world.tick);
  poiEnabled = Boolean(world.modernPois?.length);
  selected = checkpoint.selected;
  q("#gravity").value = checkpoint.gravity;
  world.events.unshift({ tick: world.tick, kind: "system", text: "記録地点に戻りました。介入前の世界を再実行できます。" });
  render();
});
document.addEventListener("visibilitychange", () => { if (document.hidden) stop(); });
window.addEventListener("resize", () => renderFateChart());
q("#fetch-poi").addEventListener("click", fetchModernPoi);
q("#activate-poi").addEventListener("click", activateModernPois);
q("#remove-poi").addEventListener("click", deactivateModernPois);
q("#view-schematic").addEventListener("click", () => setView("schematic"));
q("#view-map").addEventListener("click", () => setView("map"));
q("#route-origin").addEventListener("change", e => { routeOriginKey=e.target.value||null; if(routeShownFor) clearRoute(); renderRoutePanel(); });
q("#route-destination").addEventListener("change", e => { routeDestinationKey=e.target.value||null; if(routeShownFor) clearRoute(); renderRoutePanel(); });
q("#route-swap").addEventListener("click", () => {
  [routeOriginKey,routeDestinationKey]=[routeDestinationKey,routeOriginKey];
  q("#route-origin").value=routeOriginKey ?? ""; q("#route-destination").value=routeDestinationKey ?? "";
  if(routeShownFor) clearRoute();
  renderRoutePanel();
});
q("#route-fetch").addEventListener("click", fetchRoute);
q("#route-clear").addEventListener("click", () => { clearRoute(); renderRoutePanel(); });
await load();
await loadHeritageSites();
