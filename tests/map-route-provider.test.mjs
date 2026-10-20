// node --test tests/map-route-provider.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { resolveRouteProvider, buildOsrmRouteUrl, osrmToContractAnswer, createRouteClient, isLoopbackEndpoint, routeFailureLabel, ROUTE_PROVIDERS } from "../prototype/map/route-provider.mjs";
import { makeModernRouteRequest, reviewModernRoute } from "../prototype/map/route-contract.mjs";
import { createWorld, installModernPois, STATIONS } from "../prototype/core.mjs";
import { normalizePoiResults } from "../prototype/openpoi.mjs";

const fixture = (name, category, lat, lng) => ({ name, category, lat, lng, address: "模擬", source: "fixture", licenses: ["CC BY 4.0"], attributions: ["Fixture"] });
function twoFacilities() {
  const world = createWorld(1185);
  installModernPois(world, normalizePoiResults({ results: [
    fixture("試験カフェA", "cafe", 34.3572, 134.1008),
    fixture("試験資料館B", "tourism", 34.3530, 134.0950),
  ] }).records);
  const [a, b] = world.modernPois;
  return { world, a, b, request: makeModernRouteRequest(a, b).request };
}
const osrmReply = (a, b, extra = {}) => ({
  code: "Ok",
  routes: [{ distance: 980, geometry: { type: "LineString", coordinates: [
    [a.modernLocation.lng + 0.0001, a.modernLocation.lat], [134.0980, 34.3550], [b.modernLocation.lng, b.modernLocation.lat + 0.0001],
  ] }, ...extra }],
});
const fossgis = () => resolveRouteProvider("?route=fossgis","localhost");
const jsonResponse = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

test("公開版の既定は経路プロバイダーなしで、外部依存を自動採用しない", () => {
  const p = resolveRouteProvider("");
  assert.equal(p.id, "none"); assert.equal(p.available, false);
  assert.equal(resolveRouteProvider("?route=osrm-demo").id, "none", "unknown providers fall back to none");
  const f = fossgis();
  assert.equal(f.id, "fossgis-osrm-foot"); assert.equal(f.evaluationOnly, true);
  assert.ok(f.minIntervalMs >= 1000, "honours the one-request-per-second policy");
  assert.match(f.attributionHtml, /OpenStreetMap contributors/); assert.match(f.attributionHtml, /openstreetmap\.org\/copyright/);
  assert.equal(resolveRouteProvider("?route=fossgis").id,"none","no host proof means evaluation is disabled");
  assert.equal(resolveRouteProvider("?route=fossgis","yama-books.github.io").id,"none", "public Pages URL cannot opt in");
  assert.equal(resolveRouteProvider("?route=local&routeEndpoint=http://localhost:5000/","yama-books.github.io").id,"none");
  assert.equal(resolveRouteProvider("?route=fossgis","127.0.0.1").id,"fossgis-osrm-foot");
  assert.ok(f.attributionHtml.includes("openstreetmap.org/fixthemap"),"fix-the-map link is required");
  assert.equal(f.license, "ODbL-1.0");
  for (const provider of Object.values(ROUTE_PROVIDERS)) assert.ok(!JSON.stringify(provider).match(/key=|token=|apikey/i), "no API keys in client code");
});

test("ローカル経路サーバーはループバックのURLだけ受け付ける", () => {
  const local = resolveRouteProvider("?route=local&routeEndpoint=" + encodeURIComponent("http://127.0.0.1:5000/route/v1/foot"),"localhost");
  assert.equal(local.id, "local-osrm-foot"); assert.equal(local.endpoint, "http://127.0.0.1:5000/route/v1/foot/");
  assert.equal(resolveRouteProvider("?route=local&routeEndpoint=" + encodeURIComponent("https://example.com/route/v1/foot/")).id, "none");
  assert.equal(isLoopbackEndpoint("http://user:pw@localhost:5000/"), false);
  assert.equal(isLoopbackEndpoint("http://localhost:5000/route/v1/foot/?x=1"), false);
  assert.equal(isLoopbackEndpoint("javascript:alert(1)"), false);
  assert.equal(resolveRouteProvider("?route=local&routeEndpoint="+encodeURIComponent("http://127.0.0.1:5000/route/v1/foot")).id,"none","no runtime host means no local route");
});

test("照会URLは施設の実座標だけを経度,緯度の順で送る", () => {
  const { world, a, b, request } = twoFacilities();
  const url = new URL(buildOsrmRouteUrl(fossgis(), request));
  assert.equal(url.origin, "https://routing.openstreetmap.de");
  assert.ok(url.pathname.endsWith("/" + a.modernLocation.lng + "," + a.modernLocation.lat + ";" + b.modernLocation.lng + "," + b.modernLocation.lat));
  assert.equal(url.searchParams.get("geometries"), "geojson");
  for (const agent of world.agents) assert.ok(!url.href.includes(String(agent.x)) || !url.href.includes(String(agent.y)), "no abstract agent coordinates");
  assert.throws(() => buildOsrmRouteUrl(resolveRouteProvider(""), request), /route_provider_unavailable/);
  assert.equal(makeModernRouteRequest(STATIONS[0], a).ok, false, "fictional stations cannot be endpoints");
});

test("OSRM応答は契約の審査を通ったときだけ描画候補になり、人物は動かさない", () => {
  const { a, b, request } = twoFacilities();
  const adapted = osrmToContractAnswer(fossgis(), request, osrmReply(a, b), "2026-10-20T00:00:00.000Z");
  assert.equal(adapted.ok, true);
  const reviewed = reviewModernRoute(request, adapted.answer);
  assert.equal(reviewed.ok, true); assert.equal(reviewed.canDrawPreview, true); assert.equal(reviewed.canMoveAgent, false);
  assert.equal(reviewed.routePreview.provenance.confidence, "estimated");
  assert.ok(reviewed.routePreview.claims.includes("not_a_character_location"));
  assert.equal(osrmToContractAnswer(fossgis(), request, { code: "NoRoute" }).reason, "no_route");
  assert.equal(osrmToContractAnswer(fossgis(), request, { code: "InvalidQuery" }).reason, "provider_error");
  const detached = osrmToContractAnswer(fossgis(), request, { code: "Ok", routes: [{ distance: 980, geometry: { type: "LineString", coordinates: [[134.11, 34.36], [134.12, 34.37]] } }] }, "2026-10-20T00:00:00Z");
  assert.equal(reviewModernRoute(request, detached.answer).reason, "route_not_connected_to_places", "a route that misses the facilities is rejected");
});

test("経路クライアントは1秒間隔・メモリキャッシュ・失敗の分類を守る", async () => {
  const { a, b, request } = twoFacilities();
  let clock = 10_000; const sleeps = []; const calls = [];
  const client = createRouteClient({
    provider: fossgis(), now: () => clock, sleep: async ms => { sleeps.push(ms); clock += ms; },
    fetchFn: async (url, init) => { calls.push({ url, init }); return jsonResponse(osrmReply(a, b)); },
  });
  const first = await client.fetchRoute(request);
  assert.equal(first.ok, true); assert.equal(calls.length, 1);
  assert.equal(calls[0].init.credentials, "omit");
  const again = await client.fetchRoute(request);
  assert.equal(again.cached, true); assert.equal(calls.length, 1, "identical pair served from memory cache");
  const reverse = makeModernRouteRequest(b, a).request;
  const rev = await client.fetchRoute(reverse);
  assert.equal(calls.length, 2); assert.ok(sleeps[0] >= 1000, "second network request waits for the interval");
  assert.equal(rev.ok, false, "reversed fixture does not connect and is rejected, not drawn");

  const fails = async (fetchFn, reason) => {
    const c = createRouteClient({ provider: fossgis(), fetchFn, sleep: async () => {} });
    const r = await c.fetchRoute(request);
    assert.equal(r.ok, false); assert.equal(r.reason, reason); assert.equal(r.canDrawPreview, false);
    assert.equal(c.cacheSize, 0, "failures are not cached");
  };
  await fails(async () => { throw new TypeError("Failed to fetch"); }, "network_error");
  await fails(async () => jsonResponse({}, 429), "rate_limited");
  await fails(async () => jsonResponse({ code: "NoRoute" }, 400), "no_route");
  await fails(async () => jsonResponse(null, 502), "provider_error");
  await fails(async () => { const e = new Error("aborted"); e.name = "AbortError"; throw e; }, "timeout");
  const none = await createRouteClient({ provider: resolveRouteProvider("") }).fetchRoute(request);
  assert.equal(none.reason, "provider_unavailable");
});

test("失敗理由は日本語で表示できる", () => {
  assert.match(routeFailureLabel("route_not_connected_to_places"), /100m/);
  assert.match(routeFailureLabel("unknown_reason_x"), /unknown_reason_x/);
});
