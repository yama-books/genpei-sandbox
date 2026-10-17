// node --test tests/prototype.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { createWorld, stepWorld, snapshot, intervene, destinationScores, fatePull, STATIONS } from "../prototype/core.mjs";
import { makePoiSampleUrl, normalizePoiResults, classifyPoi, loadPoiSample, YASHIMA_SAMPLE_CENTER } from "../prototype/openpoi.mjs";

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


test("屋島の現在の史跡8件は出典付きで、伝承座標を捏造していない", async () => {
  const data = JSON.parse(await read("data/places/YASHIMA_SITE_REGISTRY.json"));
  assert.equal(data.sites.length, 8);
  assert.equal(new Set(data.sites.map(s=>s.site_id)).size, 8);
  assert.ok(data.sites.every(s => s.source_urls?.length >= 1));
  assert.ok(data.sites.every(s => s.source_urls.every(url => url.startsWith("https://"))));
  const geocoded = data.sites.filter(s => s.location.lat !== null);
  assert.equal(geocoded.length, 1);
  assert.equal(geocoded[0].location.precision, "area_representative_not_event_point");
  assert.ok(data.sites.some(s=>s.name==="佐藤継信の墓" && s.notes.includes("移設")));
});

test("OpenPOIの中心指定は経度・緯度順、半径と取得数に制限がある", () => {
  const url = new URL(makePoiSampleUrl());
  assert.equal(url.hostname, "api.openpoiapi.com");
  assert.equal(url.searchParams.get("center"), "134.1012,34.3566");
  assert.equal(url.searchParams.get("radius"), "1200");
  assert.equal(url.searchParams.get("limit"), "50");
  assert.equal(classifyPoi("unknown"), "用途未分類（分類未確認）");
});

test("OpenPOIで座標異常・範囲外を除外し、ライセンスを保持する", () => {
  const json = {results:[
    {name:"試験飲食店",lat:34.357,lng:134.101,category:"restaurant",source:"fixture",licenses:["Apache-2.0"],attributions:["Test source"]},
    {name:"未分類の候補",lat:34.3572,lng:134.102,category:"unknown",source:"fixture"},
    {name:"遠隔の誤座標",lat:35.357,lng:135.101,category:"tourism"},
    {name:"座標が不正",lat:"bad",lng:134.101,category:"station"},
  ]};
  const result=normalizePoiResults(json);
  assert.equal(result.responseCount,4);
  assert.equal(result.returned,2);
  assert.equal(result.invalid,1);
  assert.equal(result.outOfRange,1);
  assert.equal(result.unknown,1);
  assert.deepEqual(result.records[0].licenses,["Apache-2.0"]);
  assert.deepEqual(result.records[0].attributions,["Test source"]);
  assert.equal(result.saturated,false);
});

test("OpenPOIの通信は明示的に呼ばれるまで実行されない", async () => {
  let calls=0;
  const mockFetch=async(url) => {
    calls++;
    assert.ok(String(url).includes("center=134.1012%2C34.3566"));
    return {ok:true, json:async()=>({count:0,results:[]})};
  };
  assert.equal(calls,0);
  const sample=await loadPoiSample(mockFetch);
  assert.equal(calls,1);
  assert.equal(sample.returned,0);
});
