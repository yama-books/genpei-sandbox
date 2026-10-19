import { newFateState, advanceFate, adviseParley } from "./fate.mjs";

// Genpei Sandbox / PROTOTYPE v0.2
// All values and locations below are hypothetical game mechanics,
// NOT historical reconstructions or measured geographical coordinates.

export const STATIONS = Object.freeze([
  { id: "awa", label: "阿波方面", x: 118, y: 515, kind: "transit", summary: "起点となる仮想地点" },
  { id: "supply", label: "補給施設（仮）", x: 388, y: 458, kind: "service", summary: "現代施設の効果を試す仮想設備" },
  { id: "leisure", label: "娯楽施設（仮）", x: 292, y: 165, kind: "service", summary: "誘惑と時間消費の仮想設備" },
  { id: "rest", label: "休息施設（仮）", x: 520, y: 175, kind: "service", summary: "疲労回復の仮想設備" },
  { id: "yashima", label: "屋島（運命の場所）", x: 744, y: 300, kind: "fate", summary: "史跡群を代表する抽象ノード" },
  { id: "sea", label: "海上退避（仮）", x: 912, y: 100, kind: "transit", summary: "航路・港の実データではない" },
]);
export const STATION_BY_ID = Object.fromEntries(STATIONS.map(p => [p.id, p]));

export const PERSONAS = Object.freeze([
  {
    id: "C036", short: "義経", name: "源義経", x: 174, y: 496,
    affinity: 0.93, curiosity: 0.16, trust: 0.78, emblem: "源",
    initialTarget: "yashima", note: "ゲーム仮定：屋島を長期目標にする"
  },
  {
    id: "C065", short: "嗣信", name: "佐藤嗣信", x: 252, y: 460,
    affinity: 0.72, curiosity: 0.18, trust: 0.89, emblem: "源",
    initialTarget: "supply", note: "ゲーム仮定：補給と主君への随行を優先"
  },
  {
    id: "C115", short: "与一", name: "那須与一", x: 332, y: 335,
    affinity: 0.84, curiosity: 0.82, trust: 0.62, emblem: "物",
    initialTarget: "leisure", note: "ゲーム仮定：娯楽に寄り道しやすい"
  },
]);

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const round = v => Math.round(v * 10) / 10;
const getStation = id => STATION_BY_ID[id] ?? STATION_BY_ID.awa;
const distance = (x, y, p) => Math.hypot(x - p.x, y - p.y);

export function rngNext(world) {
  // xorshift32; deterministic per seed when calls occur in the same order.
  let x = world.rng | 0;
  if (x === 0) x = 0x6d2b79f5;
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  world.rng = x >>> 0;
  return world.rng / 4294967296;
}

export function createWorld(seed = 1185) {
  const intSeed = (Math.trunc(Number(seed)) >>> 0) || 1185;
  return {
    seed: intSeed,
    rng: intSeed,
    tick: 0,
    interventionBudget: 3,
    fate: newFateState(),
    events: [{
      tick: 0, kind: "system",
      text: "架空の地理・施設で観察を開始しました。人物の性格や初期位置はすべてゲーム上の仮定です。"
    }],
    agents: PERSONAS.map(p => ({
      ...p, energy: 85, provisions: 72, money: 45, morale: 65,
      target: p.initialTarget, arrivals: 0, adviceUntil: 0,
      lastDecision: "初期配置：ゲーム上の仮定", lastScores: [],
      visitedYashima: false, arrivedAtYashimaTick: null, recentlyVisited: null, cooldownUntil: 0, clock: 0,
    }))
  };
}

export function fatePull(agent, gravity = 65) {
  return Math.round(clamp(gravity, 0, 100) * agent.affinity);
}

export function destinationScores(agent, gravity = 65) {
  const pull = fatePull(agent, gravity);
  return STATIONS.map(p => {
    const cost = distance(agent.x, agent.y, p) * 0.062;
    let base = 7;
    let why = "探索";
    if (p.id === "yashima") { base = 16 + pull * 0.92 - (agent.visitedYashima ? 80 : 0); why = "歴史的引力"; }
    if (p.id === "supply") { base = 12 + (100 - agent.provisions) * 1.15; why = "補給"; }
    if (p.id === "rest") { base = 10 + (100 - agent.energy) * 1.12; why = "疲労"; }
    if (p.id === "leisure") { base = 7 + agent.curiosity * 67 + (100 - agent.morale) * 0.16; why = "娯楽への関心"; }
    if (p.id === "sea") { base = 2; why = "海上（仮）"; }
    if (p.id === "awa") { base = 1; why = "移動"; }
    if (agent.recentlyVisited === p.id && agent.cooldownUntil > agent.clock) base -= 85;
    if (p.id === "supply" && agent.money < 9) base -= 120;
    if (p.id === "rest" && agent.money < 6) base -= 120;
    if (p.id === "leisure" && agent.money < 5) base -= 120;
    return { id: p.id, label: p.label, why, score: round(base - cost) };
  }).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

export function logEvent(world, kind, text, personId = null) {
  world.events.unshift({ tick: world.tick, kind, text, personId });
  if (world.events.length > 140) world.events.length = 140;
}

function chooseTarget(world, agent, gravity) {
  const scores = destinationScores(agent, gravity);
  agent.lastScores = scores;
  // Top 2 get random exploration; both deterministically seeded.
  const chosen = rngNext(world) < (0.10 + agent.curiosity * 0.12)
    ? (scores[1] || scores[0]) : scores[0];
  const changed = chosen.id !== agent.target;
  agent.target = chosen.id;
  agent.lastDecision = chosen.why + "（得点 " + chosen.score + "）";
  if (changed) logEvent(world, "decision", agent.short + "が「" + chosen.label + "」に向かうと判断", agent.id);
}

function arrive(world, agent, station) {
  agent.arrivals++;
  agent.recentlyVisited = station.id;
  agent.cooldownUntil = world.tick + 10;
  if (station.id === "supply") {
    if (agent.money >= 9) {
      agent.money -= 9;
      agent.provisions = clamp(agent.provisions + 43, 0, 100);
      logEvent(world, "facility", agent.short + "が補給を行った（資金を消費）", agent.id);
    } else logEvent(world, "warning", agent.short + "は資金不足で補給できなかった", agent.id);
  } else if (station.id === "rest") {
    if (agent.money >= 6) {
      agent.money -= 6;
      agent.energy = clamp(agent.energy + 60, 0, 100);
      agent.morale = clamp(agent.morale + 7, 0, 100);
      logEvent(world, "facility", agent.short + "が休息した（資金を消費）", agent.id);
    } else logEvent(world, "warning", agent.short + "は資金不足で休めなかった", agent.id);
  } else if (station.id === "leisure") {
    if (agent.money >= 5) {
      agent.money -= 5;
      agent.morale = clamp(agent.morale + 22, 0, 100);
      agent.energy = clamp(agent.energy - 6, 0, 100);
      logEvent(world, "facility", agent.short + "が娯楽施設へ寄り道した", agent.id);
    } else logEvent(world, "warning", agent.short + "は費用不足で娯楽施設を利用しなかった", agent.id);
  } else if (station.id === "yashima") {
    agent.morale = clamp(agent.morale + 9, 0, 100);
    agent.visitedYashima = true;
    if(agent.arrivedAtYashimaTick===null) agent.arrivedAtYashimaTick=world.tick;
    logEvent(world, "fate", agent.short + "が運命の場所へ接近した（史実の再現・イベント成立ではない）", agent.id);
  } else logEvent(world, "movement", agent.short + "が「" + station.label + "」へ到達", agent.id);
  agent.target = null; // Re-evaluate next tick, rather than staying permanently.
}

export function stepWorld(world, gravity = 65) {
  world.tick++;
  for (const agent of world.agents) {
    agent.clock = world.tick;
    agent.provisions = round(clamp(agent.provisions - 0.32, 0, 100));
    agent.energy = round(clamp(agent.energy - 0.45, 0, 100));
    if (agent.provisions === 0) agent.energy = round(clamp(agent.energy - 0.65, 0, 100));
    if (agent.energy < 12 || agent.provisions < 12) agent.morale = round(clamp(agent.morale - 0.3, 0, 100));
    if (!agent.target || (world.tick % 10 === 1 && world.tick > agent.adviceUntil)) {
      chooseTarget(world, agent, gravity);
    }
    const p = getStation(agent.target);
    const d = distance(agent.x, agent.y, p);
    const step = agent.energy < 15 ? 5 : 15; // Virtual distance per tick; not km/h.
    if (d <= step) {
      agent.x = p.x; agent.y = p.y;
      arrive(world, agent, p);
    } else {
      agent.x = round(agent.x + ((p.x - agent.x) / d) * step);
      agent.y = round(agent.y + ((p.y - agent.y) / d) * step);
    }
  }
  advanceFate(world, gravity, logEvent, rngNext);
  return world;
}

export function intervene(world, id, action, gravity = 65) {
  const a = world.agents.find(p => p.id === id);
  if (!a || !["advise", "support", "mediate"].includes(action)) return { ok: false, reason: "対象外" };
  if (action === "mediate") return adviseParley(world, a, rngNext, logEvent);
  if (world.interventionBudget <= 0) return { ok: false, reason: "介入可能回数がありません" };
  world.interventionBudget--;
  if (action === "support") {
    a.money = clamp(a.money + 20, 0, 120);
    a.provisions = clamp(a.provisions + 20, 0, 100);
    logEvent(world, "intervention", a.short + "に資金・食料を支援（現実の支出ではありません）", a.id);
    return { ok: true, accepted: true };
  }
  // An advice is not an enforced command. The acceptance ratio is fictional.
  const accepted = rngNext(world) < 0.3 + 0.65 * a.trust;
  if (accepted) {
    a.target = "yashima";
    a.adviceUntil = world.tick + 18;
    a.lastDecision = "プレイヤーの助言を受諾";
    logEvent(world, "intervention", a.short + "が「屋島へ向かう」助言を受諾", a.id);
  } else {
    logEvent(world, "intervention", a.short + "が「屋島へ向かう」助言を見送った", a.id);
  }
  return { ok: true, accepted };
}

export function snapshot(world) {
  return JSON.parse(JSON.stringify(world));
}
