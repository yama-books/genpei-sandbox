// MAP-04: read-only view model for the Yashima chapter's causal chain.
// It never decides anything: stages and reasons come from world.fate.decisions /
// resolution written by fate.mjs. Live resource values use the raw numbers the
// rules compare, floored for display so 14.96 reads "14.9" (below 15), never "15".
import { FATE_RULES } from "../fate.mjs";

export const FATE_TIMELINE_VERSION = "0.1";
export const LEADER_ID = "C036";
export const TRAIL_EVENT_KINDS = Object.freeze(["facility", "intervention", "warning", "fate"]);
const BATTLE = new Set(["upper_hand", "stalemate", "setback"]);

export const ENDING_LABELS = Object.freeze({
  upper_hand: "交戦・優勢", stalemate: "交戦・膠着", setback: "交戦・頓挫", parley: "交渉",
  retreat: "屋島で撤退", empty: "到着時すでに退避", missed: "屋島へ到達せず",
});

export const floorTenth = n => Number.isFinite(n) ? Math.floor(n * 10 + 1e-9) / 10 : null;

export function endingLabel(resolution) {
  if (!resolution) return "";
  if (resolution.kind !== "withdrawal") return ENDING_LABELS[resolution.kind] ?? resolution.kind;
  // Chapter-deadline withdrawals are a lost opportunity regardless of where the leader stands.
  if (resolution.resolvedAt >= FATE_RULES.closingTick) return "時機を逸して断念";
  return resolution.metrics?.atDecisionSite === false ? "屋島の外で攻勢断念" : "攻勢断念";
}

// Status of the leader's resources against the battle floors (raw values, as fate.mjs compares).
export function readinessView(leader, metrics) {
  if (!leader) return null;
  const item = (label, raw, min, unit = "") => ({ label, value: floorTenth(raw), min, ok: raw >= min, unit });
  return {
    energy: item("体力", leader.energy, FATE_RULES.minimumBattleEnergy),
    provisions: item("食料", leader.provisions, FATE_RULES.minimumBattleProvisions),
    // readiness is already the rounded integer the rule itself compares with 46.
    readiness: { label: "行動余力", value: metrics?.readiness ?? null, min: 46, ok: (metrics?.readiness ?? 0) >= 46, unit: "" },
    money: floorTenth(leader.money),
    atSite: leader.currentStationId === "yashima",
  };
}

const last = (list, kind) => [...list].reverse().find(d => d.kind === kind) ?? null;

// Four compact stages: opening -> decision -> reconsideration -> ending.
export function buildFateStages(fate, tick) {
  const decisions = fate?.decisions ?? [];
  const res = fate?.resolution ?? null;
  const opening = last(decisions, "opening");
  const postponed = decisions.find(d => d.kind === "postponed") ?? null;
  const reconsidered = last(decisions, "reconsidered");
  const stages = [];

  stages.push(opening
    ? { id: "opening", label: "機会が近づく", status: "done", tick: opening.tick }
    : { id: "opening", label: "機会が近づく", status: "upcoming", tick: FATE_RULES.openingTick, note: "第" + FATE_RULES.openingTick + "刻から" });

  if (postponed) stages.push({ id: "decision", label: "攻撃を延期", status: "done", tick: postponed.tick, causes: postponed.causes ?? [], tone: "warn" });
  else if (res) stages.push({ id: "decision", label: BATTLE.has(res.kind) ? "攻撃を決断" : res.kind === "parley" ? "交渉を選択" : "決断に至らず", status: "done", tick: res.resolvedAt });
  else if (tick >= FATE_RULES.earliestDecisionTick) stages.push({ id: "decision", label: "決断の刻", status: "current", note: "到着と準備しだい" });
  else stages.push({ id: "decision", label: "決断の刻", status: "upcoming", note: "第" + FATE_RULES.earliestDecisionTick + "刻以降" });

  if (!postponed) stages.push({ id: "reconsider", label: "再判断", status: res ? "skipped" : "upcoming", note: res ? "延期なし" : "延期したときのみ" });
  else if (reconsidered && !res) stages.push({ id: "reconsider", label: "回復・帰還待ち", status: "current", tick: reconsidered.tick, causes: reconsidered.causes ?? [] });
  else if (reconsidered) stages.push({ id: "reconsider", label: "回復・帰還待ち", status: "done", tick: reconsidered.tick, causes: reconsidered.causes ?? [] });
  else if (res) stages.push({ id: "reconsider", label: "猶予後に判断", status: "done", tick: res.resolvedAt });
  else stages.push({ id: "reconsider", label: "再判断", status: "current", tick: fate.postponedUntil, note: "第" + fate.postponedUntil + "刻に準備を再判断" });

  stages.push(res
    ? { id: "ending", label: endingLabel(res), status: "done", tick: res.resolvedAt, tone: BATTLE.has(res.kind) || res.kind === "parley" ? "" : "warn" }
    : { id: "ending", label: "結末", status: "upcoming", note: "第" + FATE_RULES.closingTick + "刻までに確定" });
  return stages;
}

// Upcoming clock checkpoints, shown as plain facts from FATE_RULES and fate state.
export function upcomingCheckpoints(fate, tick) {
  if (fate?.resolution) return [];
  const list = [];
  if (tick < FATE_RULES.openingTick) list.push({ tick: FATE_RULES.openingTick, label: "機会の接近" });
  if (fate?.phase === "postponed" && fate.postponedUntil !== null && tick < fate.postponedUntil && !fate.decisions.some(d => d.kind === "reconsidered"))
    list.push({ tick: fate.postponedUntil, label: "延期の猶予が終わる" });
  if (tick < FATE_RULES.departureTick) list.push({ tick: FATE_RULES.departureTick, label: "相手勢力が退避（ゲーム設定）" });
  if (tick < FATE_RULES.closingTick) list.push({ tick: FATE_RULES.closingTick, label: "章の締切" });
  return list.sort((a, b) => a.tick - b.tick);
}

// Optional starting conditions for observing SIM-03 paths. "shortage" mirrors the
// composite-shortage scenario used in the SIM-03 batches (leader only); it changes
// initial values, never the decision rules. Applied only on reset.
export const OBSERVATION_SCENARIOS = Object.freeze({
  normal: Object.freeze({ id: "normal", label: "通常", resources: null }),
  shortage: Object.freeze({ id: "shortage", label: "資源不足で開始（義経：体力40・食料20・所持金0）", resources: Object.freeze({ energy: 40, provisions: 20, money: 0 }) }),
});
export function applyObservationScenario(world, id) {
  const scenario = OBSERVATION_SCENARIOS[id] ?? OBSERVATION_SCENARIOS.normal;
  const leader = world.agents.find(a => a.id === LEADER_ID);
  if (scenario.resources && leader) Object.assign(leader, scenario.resources);
  return scenario.id;
}

// Observation trail kept by the UI: one leader sample per tick plus the leader's
// facility/intervention/warning events. Pure helpers so restore/reset stay exact.
export function createTrail() { return { samples: [], events: [] }; }
export function recordTrail(trail, world) {
  const leader = world.agents.find(a => a.id === LEADER_ID);
  if (!leader) return trail;
  const sample = { tick: world.tick, energy: leader.energy, provisions: leader.provisions, atSite: leader.currentStationId === "yashima" };
  const i = trail.samples.findIndex(s => s.tick === world.tick);
  if (i >= 0) trail.samples[i] = sample; else { trail.samples.push(sample); trail.samples.sort((a, b) => a.tick - b.tick); }
  const seen = new Set(trail.events.map(e => e.tick + "|" + e.kind + "|" + e.text));
  for (const e of world.events) {
    if (e.tick > world.tick) continue;
    if (e.personId !== LEADER_ID) continue;
    if (!TRAIL_EVENT_KINDS.includes(e.kind)) continue;
    const key = e.tick + "|" + e.kind + "|" + e.text;
    if (!seen.has(key)) { seen.add(key); trail.events.push({ tick: e.tick, kind: e.kind, text: e.text }); }
  }
  trail.events.sort((a, b) => a.tick - b.tick);
  return trail;
}
// After restoring a checkpoint, history beyond its tick is no longer true.
export function truncateTrail(trail, tick) {
  trail.samples = trail.samples.filter(s => s.tick <= tick);
  trail.events = trail.events.filter(e => e.tick <= tick);
  return trail;
}

// Geometry for the compact chart (viewBox units). Time axis 0..closingTick.
export const CHART = Object.freeze({ width: 600, height: 150, left: 28, right: 14, top: 18, bottom: 26 });
// Narrow screens get their own coordinate system so text stays legible instead of shrinking.
export const CHART_COMPACT = Object.freeze({ width: 340, height: 150, left: 24, right: 12, top: 18, bottom: 26 });
export function chartModel(trail, fate, tick, dims = CHART) {
  const maxT = FATE_RULES.closingTick;
  const w = dims.width - dims.left - dims.right, h = dims.height - dims.top - dims.bottom;
  const x = t => Math.round((dims.left + Math.min(maxT, Math.max(0, t)) / maxT * w) * 10) / 10;
  const y = v => Math.round((dims.top + (1 - Math.min(100, Math.max(0, v)) / 100) * h) * 10) / 10;
  const pts = key => trail.samples.filter(s => s.tick <= maxT).map(s => x(s.tick) + "," + y(s[key])).join(" ");
  const postponed = fate?.decisions?.find(d => d.kind === "postponed");
  return {
    x, y, maxT, dims,
    energyPoints: pts("energy"), provisionsPoints: pts("provisions"),
    floors: [
      { key: "energy", value: FATE_RULES.minimumBattleEnergy, y: y(FATE_RULES.minimumBattleEnergy) },
      { key: "provisions", value: FATE_RULES.minimumBattleProvisions, y: y(FATE_RULES.minimumBattleProvisions) },
    ],
    markers: [
      { tick: FATE_RULES.openingTick, label: "機会", x: x(FATE_RULES.openingTick) },
      { tick: FATE_RULES.departureTick, label: "退避", x: x(FATE_RULES.departureTick) },
      { tick: FATE_RULES.closingTick, label: "締切", x: x(FATE_RULES.closingTick), anchor: "end" },
    ],
    grace: postponed && fate.postponedUntil !== null ? { x1: x(postponed.tick), x2: x(fate.postponedUntil) } : null,
    siteSpans: spans(trail.samples.filter(s => s.tick <= maxT), x),
    events: trail.events.filter(e => e.tick <= maxT && e.kind !== "fate").map(e => ({ ...e, x: x(e.tick) })),
    decisions: (fate?.decisions ?? []).filter(d => d.kind !== "opening" && d.tick <= maxT).map(d => ({ tick: d.tick, kind: d.kind, title: d.title, x: x(d.tick) })),
    now: tick <= maxT ? x(tick) : null,
  };
}
function spans(samples, x) {
  const out = []; let start = null;
  for (const s of samples) {
    if (s.atSite && start === null) start = s.tick;
    if (!s.atSite && start !== null) { out.push({ x1: x(start), x2: x(s.tick) }); start = null; }
  }
  if (start !== null && samples.length) out.push({ x1: x(start), x2: x(samples[samples.length - 1].tick) });
  return out;
}
