import test from "node:test";
import assert from "node:assert/strict";
import { createWorld, installModernPois, removeModernPois, snapshot, stepWorld } from "../prototype/core.mjs";
import { buildAgentObservations } from "../prototype/map/agent-observation.mjs";
import { buildMapModel, mapModelSignature, poiKey } from "../prototype/map/map-model.mjs";
import { normalizePoiResults } from "../prototype/openpoi.mjs";

const records = normalizePoiResults({ results: [
  { name: "模擬カフェ", category: "cafe", lat: 34.3572, lng: 134.1008,
    source: "fixture", licenses: ["CC0-1.0"], attributions: ["Fixture"] },
] }).records;
function fixture() {
  const world = createWorld(1185);
  installModernPois(world, records);
  return world;
}

test("目的地・到着先は同じ施設キーで結び、出発後の古い滞在先を使わない", () => {
  const world = fixture(), a = world.agents[0], poi = world.modernPois[0];
  a.target = poi.id;
  let row = buildAgentObservations(world)[0];
  assert.equal(row.movementStatus, "moving");
  assert.equal(row.facilityKey, poiKey(poi.label, poi.modernLocation.lat, poi.modernLocation.lng));
  assert.equal(row.stationLabel, poi.label);
  assert.equal(row.lastDecision, a.lastDecision);
  a.target = null; a.currentStationId = poi.id;
  row = buildAgentObservations(world)[0];
  assert.equal(row.movementStatus, "arrived");
  assert.ok(row.facilityKey);
  a.target = "yashima";
  row = buildAgentObservations(world)[0];
  assert.equal(row.movementStatus, "moving");
  assert.equal(row.facilityKey, null);
  assert.match(row.stationLabel, /屋島/);
  a.target = null; a.currentStationId = null;
  assert.equal(buildAgentObservations(world)[0].movementStatus, "idle");
});

test("参照不正・座標不正は人物を施設の実位置に結びつけない", () => {
  const world = fixture(), a = world.agents[0];
  a.target = "missing";
  assert.equal(buildAgentObservations(world)[0].movementStatus, "blocked");
  assert.equal(buildAgentObservations(world)[0].facilityKey, null);
  a.target = world.modernPois[0].id; a.x = NaN;
  assert.equal(buildAgentObservations(world)[0].blockedReason, "invalid_abstract_position");
  assert.equal(buildAgentObservations(world)[0].facilityKey, null);
  a.x = 174; world.modernPois[0].modernLocation.lat = NaN;
  assert.equal(buildAgentObservations(world)[0].facilityKey, null);
});

test("候補評価は現在の関心として保持し、取得だけでは行動候補にならない", () => {
  const world = createWorld(1185);
  assert.equal(buildAgentObservations(world)[0].interests.length, 0);
  installModernPois(world, records);
  const row = buildAgentObservations(world)[0];
  assert.equal(row.interests.length, 1);
  assert.equal(row.interests[0].why, "空腹と食事");
  assert.ok(Number.isFinite(row.interests[0].score));
  assert.ok(row.interests[0].key);
});

test("観測と保存復帰は状態・乱数を変えず、解除後に古い施設関係を残さない", () => {
  const world = fixture(); world.agents[0].target = world.modernPois[0].id;
  const before = snapshot(world), observations = buildAgentObservations(world);
  assert.deepEqual(world, before);
  assert.deepEqual(buildAgentObservations(snapshot(world)), observations);
  const control = snapshot(world);
  for (let i = 0; i < 50; i++) {
    buildAgentObservations(world);
    stepWorld(world); stepWorld(control);
  }
  assert.deepEqual(world, control);
  removeModernPois(world);
  assert.ok(buildAgentObservations(world).every(a => a.facilityKey === null && !a.interests.length));
});

test("地図署名は選択・行動関係・POI情報の変更を反映し、人物座標を含めない", () => {
  const world = fixture();
  const model = buildMapModel({ records, adoptedPois: world.modernPois });
  model.observations = buildAgentObservations(world);
  const initial = mapModelSignature(model);
  world.agents[0].target = world.modernPois[0].id;
  model.observations = buildAgentObservations(world);
  assert.notEqual(mapModelSignature(model), initial);
  const moving = mapModelSignature(model);
  model.selectedAgentId = world.agents[0].id;
  assert.notEqual(mapModelSignature(model), moving);
  const selected = mapModelSignature(model);
  model.pois[0].source = "updated source";
  assert.notEqual(mapModelSignature(model), selected);
  for (const row of model.observations) {
    for (const key of ["position", "realGeo", "lat", "lng", "x", "y", "route"]) assert.ok(!(key in row));
  }
  assert.equal(model.agentsOnMap, false);
});
