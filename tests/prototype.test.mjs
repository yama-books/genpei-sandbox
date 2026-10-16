// node --test tests/prototype.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { createWorld, stepWorld, snapshot, intervene, destinationScores, fatePull, STATIONS } from "../prototype/core.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const read = async path => readFile(resolve(here, "..", path), "utf8");

test("11重点人物と33主張がCSV上で対応する", async () => {
  const people = await read("data/people/MASTER_INDEX.csv");
  const claims = await read("data/people/YASHIMA_MVP_CLAIMS.csv");
  const p0 = people.trim().split(/\r?\n/).slice(1).filter(x => x.includes('"P0"'));
  const rows = claims.trim().split(/\r?\n/).slice(1);
  assert.equal(people.trim().split(/\r?\n/).length - 1, 120);
  assert.equal(p0.length, 11);
  assert.equal(rows.length, 33);
  for (const line of rows) assert.match(line, /"YM\d{3}","C\d{3}"/);
});

test("同じ初期状態とシードで同じ結果になる", () => {
  const a = createWorld(1185), b = createWorld(1185);
  for (let i = 0; i < 100; i++) { stepWorld(a, 75); stepWorld(b, 75); }
  assert.deepEqual(a, b);
});

test("異なるシードで非固定の行動に分岐しうる", () => {
  const a = createWorld(1185), b = createWorld(2118);
  for (let i = 0; i < 200; i++) { stepWorld(a, 75); stepWorld(b, 75); }
  assert.notEqual(JSON.stringify(a.events), JSON.stringify(b.events));
});

test("引力が高いほど屋島への得点が上がる", () => {
  const a = createWorld().agents[0];
  assert.ok(fatePull(a, 90) > fatePull(a, 10));
  const low = destinationScores(a, 5).find(x => x.id === "yashima").score;
  const high = destinationScores(a, 95).find(x => x.id === "yashima").score;
  assert.ok(high > low);
});

test("施設利用では残高を無視せず負の数値を出さない", () => {
  const w = createWorld(2026);
  for (let i = 0; i < 500; i++) {
    stepWorld(w, 40);
    for (const a of w.agents) {
      assert.ok(a.money >= 0, a.name + " money");
      assert.ok(a.energy >= 0 && a.energy <= 100);
      assert.ok(a.provisions >= 0 && a.provisions <= 100);
      assert.ok(a.morale >= 0 && a.morale <= 100);
      assert.ok(a.x >= 0 && a.x <= 1000 && a.y >= 0 && a.y <= 640);
    }
  }
  assert.ok(STATIONS.every(s => s.x >= 0 && s.y >= 0));
});

test("介入は有限で、存在しない人物に使えない", () => {
  const w = createWorld();
  assert.equal(intervene(w, "NOT_A_PERSON", "support").ok, false);
  assert.equal(w.interventionBudget, 3);
  for (let i = 0; i < 3; i++) assert.equal(intervene(w, "C036", "support").ok, true);
  assert.equal(intervene(w, "C036", "support").ok, false);
  assert.equal(w.interventionBudget, 0);
});

test("スナップショットは後続の操作で変化しない", () => {
  const w = createWorld(2468);
  for (let i = 0; i < 23; i++) stepWorld(w);
  const saved = snapshot(w), before = JSON.stringify(saved);
  intervene(w, "C065", "support");
  for (let i = 0; i < 60; i++) stepWorld(w, 83);
  assert.equal(JSON.stringify(saved), before);
  assert.notDeepEqual(saved, w);
  const restarted = snapshot(saved);
  const control = snapshot(saved);
  for (let i = 0; i < 45; i++) { stepWorld(restarted, 65); stepWorld(control, 65); }
  assert.deepEqual(restarted, control);
});
