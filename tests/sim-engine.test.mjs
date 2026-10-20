import test from "node:test";
import assert from "node:assert/strict";
import { createWorld, stepWorld, installModernPois, snapshot, STATIONS } from "../prototype/core.mjs";
import { POI_GAME_EFFECT } from "../prototype/poi-world.mjs";
import { SIM_POIS } from "./fixtures/sim-pois.mjs";
import { readFile } from "node:fs/promises";
import { SEEDS, simulate, verifyRun, runBatch } from "./sim-batch.mjs";

const cost = p => p.kind === "modern-poi" ? POI_GAME_EFFECT[p.action].cost : ({ supply: 9, rest: 6, leisure: 5 }[p.id] ?? 0);

test("bankrupt hungry agents choose only affordable destinations, including exploration", () => {
  for (const seed of SEEDS) for (const pois of [false, true]) {
    const w = createWorld(seed);
    if (pois) installModernPois(w, SIM_POIS);
    for (const a of w.agents) { a.money = 0; a.energy = 0; a.provisions = 0; a.morale = 0; a.target = null; }
    for (let i = 0; i < 40; i++) {
      stepWorld(w, 0);
      for (const a of w.agents) {
        const station = [...STATIONS, ...w.modernPois].find(p => p.id === (a.target ?? a.currentStationId));
        assert.ok(station, `missing destination for ${seed}/${a.id}`);
        assert.equal(cost(station), 0, `unaffordable target for ${seed}/${a.id}`);
        assert.equal(a.money, 0);
      }
    }
    assert.ok(!w.events.some(e => e.kind === "warning"));
  }
});

test("the exact facility price is affordable; the observer retains rejected scores", () => {
  const w = createWorld(123456789), a = w.agents[0];
  a.x = 388; a.y = 458; a.provisions = 0; a.energy = 100; a.money = 9; a.target = null;
  stepWorld(w, 0);
  assert.equal(a.currentStationId, "supply");
  assert.equal(a.money, 0);
  assert.equal(a.provisions, 43);
  a.target = null; a.provisions = 0;
  stepWorld(w, 0);
  assert.equal(a.lastScores.length, 6);
  assert.notEqual(a.target, "supply");
});

test("batch checks complete replay and save/resume across the finite intervention policy", () => {
  const r = verifyRun({ seed: SEEDS[7], gravity: 50, pois: true, interventions: true, ticks: 112 });
  assert.equal(r.replayMatches, true);
  assert.equal(r.resumeMatches, true);
  assert.equal(r.world.interventionBudget, 0);
  assert.equal(r.world.fate.phase, "resolved");
  const immutable = snapshot(r.world.fate.resolution);
  for (let i = 0; i < 40; i++) stepWorld(r.world, 0);
  assert.deepEqual(r.world.fate.resolution, immutable);
});

test("batch distinguishes chapter misses from arrivals after expiry", () => {
  const r = simulate({ seed: SEEDS[0], gravity: 0, pois: false, interventions: false });
  assert.equal(r.group, "not_arrived");
  assert.equal(r.arrivedInWindow, false);
  assert.equal(r.counts.invalidBalances + r.counts.invalidResources + r.counts.invalidPositions, 0);
});

test("batch detects invalid balances/resources/positions and actual immobility", () => {
  const broken = { createWorld, installModernPois, snapshot, stepWorld(w) {
    w.tick++;
    for (const a of w.agents) { a.target = "yashima"; a.currentStationId = null; a.money = -1; a.energy = 101; }
    w.agents[1].x = NaN;
  } };
  const r = simulate({ seed: 9, gravity: 0, pois: false, interventions: false, ticks: 112 }, broken);
  assert.ok(r.counts.invalidBalances > 0);
  assert.ok(r.counts.invalidResources > 0);
  assert.ok(r.counts.invalidPositions > 0);
  assert.equal(r.counts.stalledAgents, 2);
  assert.equal(r.group, "unresolved");
});


test("128 seeds x 12 conditions reproduce the published improved report", { timeout: 120000 }, async () => {
  const expected = JSON.parse(await readFile(new URL("../docs/reports/sim-01-improved.json", import.meta.url), "utf8"));
  const actual = await runBatch();
  assert.equal(actual.rows.length, 1536);
  assert.deepEqual(actual.seeds, expected.seeds);
  assert.deepEqual(actual.policy, expected.policy);
  assert.deepEqual(actual.sources, expected.sources);
  assert.deepEqual(actual.cells, expected.cells);
  for (const { totals: t, groups } of actual.cells) {
    assert.equal(t.moneyShortage + t.invalidBalances + t.invalidResources + t.invalidPositions +
      t.replayMismatch + t.resumeMismatch + t.stalledAgents, 0);
    assert.equal(groups.unresolved ?? 0, 0);
  }
  console.log("SIM-01: 1536 scenarios, 240 ticks; payment failures, invalid states, stalls, replay/resume mismatches: 0");
});
