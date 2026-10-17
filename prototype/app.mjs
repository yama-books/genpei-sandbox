import { STATIONS, STATION_BY_ID, PERSONAS, createWorld, stepWorld, intervene, snapshot, fatePull, destinationScores } from "./core.mjs";

import { loadPoiSample } from "./openpoi.mjs";

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
let checkpoint = null;
let timer = null;

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
    renderHeritageSites(data.sites);
    const precise = data.sites.filter(s => s.location?.precision === "verified_site_point").length;
    q("#heritage-status").textContent = data.sites.length + "地点登録。史跡単位の実測座標は" + precise + "件。現在地と伝承は分けて表示。";
  } catch (error) {
    q("#heritage-status").classList.add("error");
    q("#heritage-status").textContent = "史跡台帳の読み込みに失敗：" + error.message;
  }
}

async function fetchModernPoi() {
  const button = q("#fetch-poi");
  button.disabled = true;
  q("#poi-status").classList.remove("error");
  q("#poi-status").textContent = "OpenPOIから読み込み中…（ブラウザから直接通信）";
  try {
    const sample = await loadPoiSample();
    const root = q("#poi-list"); root.replaceChildren();
    q("#poi-status").textContent =
      "返却 " + sample.responseCount + "件／座標等の検査後 " + sample.returned +
      "件（分類unknown " + sample.unknown + "件、座標不正 " + sample.invalid +
      "件、範囲外 " + sample.outOfRange + "件）。" +
      (sample.saturated ? "上限50件に達しています。地域内の全施設ではありません。" : "施設網羅性は保証されません。");
    for (const item of sample.records.slice(0, 8)) {
      const card = element("div", "poi-card");
      const top = element("div", "poi-top");
      top.append(element("strong", "", item.name), element("span", "person-tag", item.distanceMeters + "m"));
      card.append(top);
      card.append(element("p", "", item.gameCategory + " ／ " + (item.address || "住所情報なし")));
      // Source licenses are retained in memory only; no raw API data is committed.
      card.title = "source: " + item.source + " / licenses: " + item.licenses.join(",") + " / attributions: " + item.attributions.join("; ");
      root.append(card);
    }
    if (sample.records.length === 0) root.append(element("p", "helper", "条件に合う施設がありません。"));
  } catch (error) {
    q("#poi-status").classList.add("error");
    q("#poi-status").textContent = "施設データを取得できません：" + error.message + "。APIの状態・CORS・通信環境を確認してください。";
  } finally {
    button.disabled = false;
  }
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
    b.addEventListener("click", () => { selected = p.candidate_id; render(); });
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
    parent.append(element("p", "stat-note", "目的地："+(STATION_BY_ID[agent.target]?.label || "再検討中")+" ／ 仮想所持金："+agent.money+" ／ "+agent.note));
  }
  q("#advise").disabled = !agent || world.interventionBudget === 0;
  q("#support").disabled = !agent || world.interventionBudget === 0;
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
  for (const v of destinationScores(a, Number(q("#gravity").value)).slice(0, 4)) {
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

function renderEvents() {
  const root = q("#events"); root.replaceChildren();
  for (const e of world.events.slice(0, 12)) {
    const row = element("div", "event " + e.kind);
    row.append(element("span", "stamp", String(e.tick).padStart(3, "0") + "刻"), element("span", "", e.text)); root.append(row);
  }
}

function render() {
  q("#clock").textContent = "第 " + world.tick + " 刻";
  q("#gravity-value").textContent = q("#gravity").value;
  renderRoster(); renderAgents(); renderStatus(); renderClaims(); renderDecision(); renderEvents();
}
function stop() {
  if (timer !== null) { clearInterval(timer); timer = null; }
  q("#play").textContent = "▶ 再生"; q("#play").setAttribute("aria-pressed", "false");
}
function tick() {
  const count = Number(q("#speed").value);
  for (let i = 0; i < count; i++) stepWorld(world, Number(q("#gravity").value));
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
q("#reset").addEventListener("click", reset);
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
  selected = checkpoint.selected;
  q("#gravity").value = checkpoint.gravity;
  world.events.unshift({ tick: world.tick, kind: "system", text: "記録地点に戻りました。介入前の世界を再実行できます。" });
  render();
});
document.addEventListener("visibilitychange", () => { if (document.hidden) stop(); });
q("#fetch-poi").addEventListener("click", fetchModernPoi);
await load();
await loadHeritageSites();
