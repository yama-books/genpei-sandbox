// node --test tests/modern-map.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { buildMapModel, buildPoiMarkers, buildHeritageMarkers, isRealCoordinate, mapModelSignature, poiKey, TILE_SOURCE, TILE_ATTRIBUTION_HTML, POI_ATTRIBUTION_HTML } from "../prototype/map/map-model.mjs";
import { createWorld, installModernPois, removeModernPois, snapshot, STATIONS } from "../prototype/core.mjs";
import { normalizePoiResults } from "../prototype/openpoi.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const read = async path => readFile(resolve(here, "..", path), "utf8");
const fixture = (name, category, lat, lng, extra = {}) => ({
  name, category, lat, lng, address: "高松市内の模擬施設", source: "fixture",
  licenses: ["CC BY 4.0"], attributions: ["Fixture"], ...extra,
});
const sample = () => normalizePoiResults({ results: [
  fixture("試験カフェA", "cafe", 34.3572, 134.1008),
  fixture("試験資料館B", "tourism", 34.3578, 134.1011),
  fixture("未分類C", "unknown", 34.3561, 134.1020),
  fixture("出典なしD", "restaurant", 34.3560, 134.1000, { licenses: [], attributions: [] }),
  { name: "座標不正E", category: "cafe", lat: "x", lng: 134.1 },
] });

test("地図には現代POIの実座標がそのまま渡り、模式図のx/yは使わない", () => {
  const records = sample().records;
  const world = createWorld(1185);
  installModernPois(world, records);
  const model = buildMapModel({ records, adoptedPois: world.modernPois });
  assert.equal(model.positionDomain, "real_geo");
  assert.equal(model.agentsOnMap, false, "agents are not placed on the real map");
  for (const p of model.pois) {
    const src = records.find(r => r.name === p.name);
    assert.equal(p.lat, src.lat); assert.equal(p.lng, src.lng);
    assert.ok(!("x" in p) && !("y" in p), "no abstract stage coordinates on map markers");
  }
  for (const s of STATIONS) assert.ok(!model.pois.some(p => p.name === s.label), "fictional stations never appear on the map");
});

test("採用中・採用可・参照のみを区別し、未分類や出典不足を確定扱いしない", () => {
  const records = sample().records;
  const before = buildPoiMarkers(records, []);
  const byName = Object.fromEntries(before.map(p => [p.name, p]));
  assert.equal(byName["試験カフェA"].status, "eligible");
  assert.equal(byName["試験資料館B"].status, "eligible");
  assert.equal(byName["未分類C"].status, "unclassified");
  assert.equal(byName["未分類C"].actionLabel, "用途未分類");
  assert.equal(byName["出典なしD"].status, "unsourced");
  assert.equal(before.length, 4, "invalid coordinates dropped by normalization");

  const world = createWorld(7);
  installModernPois(world, records);
  const after = buildMapModel({ records, adoptedPois: world.modernPois });
  assert.equal(after.counts.adopted, 2);
  assert.equal(after.counts.eligible, 0);
  assert.notEqual(mapModelSignature(after), mapModelSignature(buildMapModel({ records })), "signature follows adoption");

  removeModernPois(world);
  assert.equal(buildMapModel({ records, adoptedPois: world.modernPois }).counts.adopted, 0);
});

test("保存復帰した世界でも採用状態を復元できる", () => {
  const records = sample().records;
  const world = createWorld(1185);
  installModernPois(world, records);
  const restored = snapshot(snapshot(world));
  assert.equal(buildMapModel({ records, adoptedPois: restored.modernPois }).counts.adopted, 2);
});

test("候補上限を超えた有効施設は参照のみとして表示する", () => {
  const many = Array.from({ length: 6 }, (_, i) => fixture("食堂" + i, "restaurant", 34.3566 + i * 0.0002, 134.1012));
  const markers = buildPoiMarkers(normalizePoiResults({ results: many }).records, []);
  assert.equal(markers.filter(p => p.status === "eligible").length, 4, "meal cap from poi-world");
  assert.equal(markers.filter(p => p.status === "capped").length, 2);
});

test("史跡は検証済み座標のある登録だけを地図に置き、精度の注意を付ける", async () => {
  const registry = JSON.parse(await read("data/places/YASHIMA_SITE_REGISTRY.json"));
  const heritage = buildHeritageMarkers(registry.sites);
  assert.equal(registry.sites.length, 8);
  assert.deepEqual(heritage.map(h => h.id), ["YS001"], "null-coordinate sites are not geocoded or guessed");
  assert.match(heritage[0].precisionLabel, /合戦や伝承の位置ではありません/);
  assert.equal(buildHeritageMarkers([{ site_id: "X", name: "x", location: { lat: 34, lng: 134, precision: "locality_only" } }]).length, 0);
});

test("座標検査と重複除去", () => {
  assert.equal(isRealCoordinate(34.3, 134.1), true);
  assert.equal(isRealCoordinate(0, 0), false);
  assert.equal(isRealCoordinate(91, 134), false);
  assert.equal(isRealCoordinate(NaN, 134), false);
  const dup = [fixture("同名", "cafe", 34.3566, 134.1012), fixture("同名 ", "cafe", 34.3566, 134.1012)];
  assert.equal(buildPoiMarkers(dup).length, 1);
  assert.equal(poiKey(" 同名 ", 34.3566, 134.1012), "同名|34.35660|134.10120");
});

test("タイルと施設の出典表示を持つ", () => {
  assert.match(TILE_SOURCE.url, /^https:\/\/cyberjapandata\.gsi\.go\.jp\/xyz\/pale\/\{z\}\/\{x\}\/\{y\}\.png$/);
  assert.ok(TILE_SOURCE.minZoom >= 9, "stay within the Japan-only tile range");
  assert.match(TILE_ATTRIBUTION_HTML, /地理院タイル/);
  assert.match(TILE_ATTRIBUTION_HTML, /maps\.gsi\.go\.jp\/development\/ichiran\.html/);
  assert.match(POI_ATTRIBUTION_HTML, /openpoiapi\.com\/attribution\.html/);
});

test("同梱した地図ライブラリにライセンス文書がある", async () => {
  const license = await read("prototype/vendor/leaflet-1.9.4/LICENSE");
  assert.match(license, /BSD 2-Clause/);
  const js = await read("prototype/vendor/leaflet-1.9.4/leaflet.js");
  assert.match(js.slice(0, 200), /Leaflet 1\.9\.4/);
});
