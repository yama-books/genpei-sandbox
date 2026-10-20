// node --test tests/fate-timeline.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { createWorld, stepWorld, logEvent, rngNext, snapshot } from "../prototype/core.mjs";
import { advanceFate, chapterMetrics, FATE_RULES } from "../prototype/fate.mjs";
import { buildFateStages, readinessView, upcomingCheckpoints, endingLabel, floorTenth, createTrail, recordTrail, truncateTrail, chartModel, applyObservationScenario, OBSERVATION_SCENARIOS } from "../prototype/map/fate-timeline.mjs";

const advance = w => advanceFate(w, 100, logEvent, rngNext);
// Same construction as tests/sim03-fate.test.mjs: rules are exercised, never re-implemented.
function world({ energy = 85, food = 72, morale = 100, away = false, tick = 50, bias = 0 } = {}) {
  const w = createWorld(1185); w.tick = tick; w.fate.negotiationBias = bias;
  Object.assign(w.agents[0], { energy, provisions: food, morale, currentStationId: away ? null : "yashima", visitedYashima: true, arrivedAtYashimaTick: 40 });
  for (const a of w.agents.slice(1)) a.currentStationId = "yashima";
  return w;
}
const ids = stages => stages.map(s => s.id + ":" + s.status);

test("延期→回復・帰還待ち→結末を、fate.mjsの記録だけから4段階で示す", () => {
  const w = world({ energy: 10, food: 5 });
  w.fate.decisions.push({ tick: 35, kind: "opening", title: "x" });
  advance(w);
  let stages = buildFateStages(w.fate, w.tick);
  assert.deepEqual(ids(stages), ["opening:done", "decision:done", "reconsider:current", "ending:upcoming"]);
  assert.equal(stages[1].label, "攻撃を延期");
  assert.ok(stages[1].causes.some(c => /疲労|食料欠乏/.test(c)), "causes are copied from the recorded decision");
  assert.match(stages[2].note, new RegExp("第" + w.fate.postponedUntil + "刻"));

  Object.assign(w.agents[0], { energy: 90, provisions: 90, currentStationId: null, target: "rest" });
  w.tick = 65; advance(w); w.tick = 66; advance(w);
  stages = buildFateStages(w.fate, w.tick);
  assert.equal(stages[2].label, "回復・帰還待ち"); assert.equal(stages[2].status, "current");
  assert.equal(upcomingCheckpoints(w.fate, w.tick).some(c => /猶予/.test(c.label)), false, "grace no longer pending");

  w.agents[0].currentStationId = "yashima"; advance(w);
  stages = buildFateStages(w.fate, w.tick);
  assert.equal(stages[2].status, "done"); assert.equal(stages[3].status, "done");
  assert.ok(["交戦・優勢", "交戦・膠着", "交戦・頓挫"].includes(stages[3].label));
});

test("屋島の外での攻勢断念と、屋島での撤退を区別して表示する", () => {
  const off = world({ energy: 10, food: 5 }); advance(off);
  Object.assign(off.agents[0], { currentStationId: null }); off.tick = off.fate.postponedUntil; advance(off);
  assert.equal(off.fate.resolution.kind, "withdrawal");
  assert.equal(endingLabel(off.fate.resolution), "屋島の外で攻勢断念");
  assert.equal(buildFateStages(off.fate, off.tick)[2].label, "猶予後に判断");

  const site = world({ energy: 10, food: 5 }); advance(site);
  site.tick = site.fate.postponedUntil; advance(site);
  assert.equal(site.fate.resolution.kind, "retreat");
  assert.equal(endingLabel(site.fate.resolution), "屋島で撤退");

  const late = world({ tick: FATE_RULES.closingTick }); late.agents[0].currentStationId = null; advance(late);
  assert.equal(late.fate.resolution.kind, "withdrawal");
  assert.equal(endingLabel(late.fate.resolution), "時機を逸して断念", "closing-time withdrawal with arrival is not 'off-site'");
});

test("延期なしで決着した場合は再判断を飛ばす", () => {
  const w = world(); advance(w);
  const stages = buildFateStages(w.fate, w.tick);
  assert.equal(stages[2].status, "skipped"); assert.equal(stages[1].label, "攻撃を決断");
  const fresh = createWorld(1185);
  assert.deepEqual(ids(buildFateStages(fresh.fate, 0)), ["opening:upcoming", "decision:upcoming", "reconsider:upcoming", "ending:upcoming"]);
});

test("体力・食料は丸め前の実値で判定と一致させ、14.9を15と表示しない", () => {
  assert.equal(floorTenth(14.96), 14.9); assert.equal(floorTenth(15), 15); assert.equal(floorTenth(11.99), 11.9);
  for (const [energy, food] of [[14.96, 100], [100, 11.95]]) {
    const w = world({ energy, food });
    const m = chapterMetrics(w, 100);
    const v = readinessView(w.agents[0], m);
    advance(w);
    assert.equal(w.fate.phase, "postponed", "rule postpones");
    assert.equal(v.energy.ok && v.provisions.ok, false, "view also reports a shortage");
    assert.ok(v.energy.value < 15 || v.provisions.value < 12, "displayed value stays below the floor");
    assert.ok(m.energy === 15 || m.provisions === 12, "rounded metrics alone would hide the shortage");
  }
  const ok = readinessView(world({ energy: 15, food: 12 }).agents[0], chapterMetrics(world({ energy: 15, food: 12 }), 100));
  assert.equal(ok.energy.ok, true); assert.equal(ok.provisions.ok, true);
});

test("観察記録は保存復帰で巻き戻り、同じ手順なら同じ記録になる", () => {
  const run = () => {
    const w = createWorld(3); applyObservationScenario(w, "shortage");
    const t = recordTrail(createTrail(), w);
    for (let i = 0; i < 70; i++) { stepWorld(w, 65); recordTrail(t, w); }
    return { w, t };
  };
  const a = run(), b = run();
  assert.deepEqual(a.t, b.t);
  assert.equal(a.t.samples.length, 71);
  assert.ok(a.t.events.some(e => e.kind === "fate"), "fate entries are part of the trail");
  const saved = snapshot(createWorld(3));
  truncateTrail(a.t, saved.tick);
  assert.equal(a.t.samples.length, 1); assert.equal(a.t.events.filter(e => e.tick > 0).length, 0);
});

test("資源不足の観察条件はSIM-03の複合不足と同じ初期値で、判定規則は変えない", () => {
  assert.deepEqual({ ...OBSERVATION_SCENARIOS.shortage.resources }, { energy: 40, provisions: 20, money: 0 });
  const w = createWorld(3); const rng = w.rng;
  assert.equal(applyObservationScenario(w, "shortage"), "shortage");
  const leader = w.agents.find(a => a.id === "C036");
  assert.equal(leader.energy, 40); assert.equal(leader.provisions, 20); assert.equal(leader.money, 0);
  assert.equal(w.rng, rng, "no random draws");
  const n = createWorld(3); applyObservationScenario(n, "unknown");
  assert.deepEqual(n, createWorld(3), "unknown/normal leaves the world untouched");
  for (let i = 0; i < 200 && !w.fate.resolution; i++) stepWorld(w, 65);
  assert.deepEqual(w.fate.decisions.map(d => d.kind), ["opening", "postponed", "resolution"]);
  assert.equal(endingLabel(w.fate.resolution), "屋島の外で攻勢断念");
});

test("グラフは0〜112刻の範囲に収め、猶予帯と最低ラインを持つ", () => {
  const w = createWorld(3); applyObservationScenario(w, "shortage");
  const t = recordTrail(createTrail(), w);
  for (let i = 0; i < 120; i++) { stepWorld(w, 65); recordTrail(t, w); }
  const c = chartModel(t, w.fate, w.tick);
  assert.ok(c.grace && c.grace.x2 > c.grace.x1, "grace window drawn after postponement");
  assert.deepEqual(c.floors.map(f => f.value), [15, 12]);
  for (const p of c.energyPoints.split(" ")) { const [x, y] = p.split(",").map(Number); assert.ok(x >= 28 && x <= 592 && y >= 18 && y <= 124); }
  assert.equal(c.now, null, "beyond the chapter window the now-line is hidden");
  assert.ok(c.decisions.some(d => d.kind === "postponed"));
});
