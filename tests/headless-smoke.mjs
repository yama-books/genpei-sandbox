// Headless UI acceptance checks for the static prototype.
// Run: (from repo root) python3 -m http.server 8765 &
//      npm install --no-save playwright@1.56.1
//      npx playwright install chromium
//      node tests/headless-smoke.mjs
import assert from "node:assert/strict";
import { chromium } from "playwright";

const URL = process.env.TEST_BASE_URL || "http://127.0.0.1:8765";
const failures = [];
const browser = await chromium.launch({ headless: true, channel: "chrome", args: ["--no-sandbox"] });
try {
  for (const viewport of [{ width: 1280, height: 850 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport, reducedMotion: "reduce" });
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.goto(URL + "/", { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForURL("**/prototype/**", { timeout: 10000 });
    await page.locator("#people-list .person-item").first().waitFor({ timeout: 12000 });
    assert.equal(await page.locator("#people-list .person-item").count(), 11, "11 people");
    assert.equal(await page.locator("#heritage-sites .heritage-card").count(), 8, "8 heritage sites");
    assert.equal(await page.locator("#claims .claim-card").count(), 3, "3 provenance claims");
    assert.match(await page.locator("#poi-status").innerText(), /未取得/, "POI not fetched without user action");
    await page.locator("#step").click();
    assert.match(await page.locator("#clock").innerText(), /1 刻/, "one tick");
    await page.locator("#gravity").evaluate(el => { el.value = "90"; el.dispatchEvent(new Event("input", { bubbles: true })); });
    assert.equal(await page.locator("#gravity-value").innerText(), "90", "gravity slider");
    await page.locator("#save").click();
    await page.locator("#step").click();
    assert.match(await page.locator("#clock").innerText(), /2 刻/, "two ticks");
    await page.locator("#restore").click();
    assert.match(await page.locator("#clock").innerText(), /1 刻/, "restore prior tick");
    await page.locator("#people-list .person-item").first().click();
    assert.equal(await page.locator("#person-title").innerText(), "平宗盛", "select another person");
    assert.equal(await page.locator("#claims .claim-card").count(), 3, "other person's claims");
    await page.locator("#people-list .person-item").filter({ hasText: "源義経" }).click();
    assert.equal(await page.locator("#budget").innerText(), "残り 3 回");
    await page.locator("#support").click();
    assert.equal(await page.locator("#budget").innerText(), "残り 2 回", "support spends one budget");
    assert.match(await page.locator("#events").innerText(), /支援/, "support appears in event log");
    const play = page.locator("#play");
    await play.click();
    assert.match(await play.innerText(), /停止/, "started");
    await play.click();
    assert.match(await play.innerText(), /再生/, "paused");
    // The chapter resolves independently of arrival, and never rewrites historical claims.
    await page.locator("#mediate").click();
    assert.equal(await page.locator("#budget").innerText(), "残り 1 回", "mediation uses intervention budget");
    await page.locator("#to-fate").click();
    assert.match(await page.locator("#fate-phase").innerText(), /結末/, "chapter resolves when skipping ahead");
    const outcome = await page.locator("#fate-description").innerText();
    assert.ok(outcome.length>25, "chapter outcome contains a causal explanation");
    assert.ok(await page.locator("#fate-reasons .fate-reason").count()>=2, "display resolution reasons");
    assert.equal(await page.locator("#claims .claim-card").count(),3, "historical claims unaffected");
    await page.locator("#step").click();
    assert.equal(await page.locator("#fate-description").innerText(),outcome, "fate result remains fixed after free exploration");
    // Independent browser test of real-POI response wiring, without reliance on the live API.
    await page.route(url => url.toString().includes("api.openpoiapi.com/v1/search"), route => route.fulfill({
      status:200,
      contentType:"application/json",
      body:JSON.stringify({count:2,results:[
        {name:"試験カフェA",address:"高松市内の模擬施設",category:"cafe",lat:34.3572,lng:134.1008,source:"fixture",licenses:["CC BY 4.0"],attributions:["Fixture"]},
        {name:"試験資料館B",address:"高松市内の模擬施設",category:"tourism",lat:34.3578,lng:134.1011,source:"fixture",licenses:["CC BY 4.0"],attributions:["Fixture"]},
      ]}),
    }));
    await page.locator("#reset").click();
    assert.equal(await page.locator("#modern-station-layer circle").count(),0,"modern POIs not preloaded");
    await page.locator("#fetch-poi").click();
    await page.locator("#activate-poi").click();
    assert.equal(await page.locator("#modern-station-layer circle").count(),2,"two sourced POI nodes adopted");
    assert.match(await page.locator("#poi-integration-status").innerText(),/2 件/,"integration reports candidates");
    await page.locator("#step").click();
    await page.locator("#remove-poi").click();
    assert.equal(await page.locator("#modern-station-layer circle").count(),0,"modern POIs removable");
    await page.locator("#activate-poi").click();
    await page.locator("#reset").click();
    assert.equal(await page.locator("#modern-station-layer circle").count(),2,"reset retains activated POI dataset");
    // MAP-01: optional modern map. Tiles are stubbed (desktop) or blocked (mobile) to cover the fallback.
    const tilesBlocked = viewport.width < 600;
    await page.route(url => url.toString().includes("cyberjapandata.gsi.go.jp"), route => tilesBlocked
      ? route.abort()
      : route.fulfill({ status:200, contentType:"image/png", body:Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=","base64") }));
    assert.ok(await page.locator("#map-view").isHidden(), "schematic is the default view");
    assert.equal(await page.locator("script[data-leaflet]").count(), 0, "map library is not loaded until requested");
    await page.locator("#view-map").click();
    await page.locator("#modern-map.leaflet-container").waitFor({ timeout: 10000 });
    assert.ok(await page.locator("#schematic-view").isHidden(), "schematic hidden while map is shown");
    assert.equal(await page.locator("#view-map").getAttribute("aria-pressed"), "true");
    assert.equal(await page.locator("path.map-poi--adopted").count(), 2, "adopted POIs drawn at real coordinates");
    assert.equal(await page.locator("path.map-heritage").count(), 1, "only the geocoded heritage area point is drawn");
    assert.match(await page.locator("#map-view .map-banner").innerText(), /人物の地図上の位置は未対応/, "agents are not shown on the real map");
    const credit = await page.locator(".leaflet-control-attribution").innerText();
    assert.match(credit, /地理院タイル/, "tile attribution"); assert.match(credit, /OpenPOI/, "POI attribution");
    await page.locator(".poi-card .poi-locate").first().click();
    const popup = await page.locator(".leaflet-popup-content").innerText();
    assert.match(popup, /出典/); assert.match(popup, /ライセンス/); assert.match(popup, /営業/, "existence/opening not asserted");
    if (tilesBlocked) {
      await page.waitForFunction(() => /背景地図を取得できません/.test(document.querySelector("#map-status").innerText), null, { timeout: 10000 });
      assert.equal(await page.locator("path.map-poi").count(), 2, "markers stay usable without tiles");
    }
    // MAP-02: deterministic fixture journey; facility positions never become agent positions.
    await page.locator('#map-observation button[data-agent-id="C115"]').click();
    assert.match(await page.locator(".map-agent-detail").innerText(), /那須与一.*移動中/s);
    assert.match(await page.locator(".map-interests").innerText(), /見物.*仮想得点|仮想得点.*見物/s);
    assert.equal(await page.locator(".map-destination").count(), 0, "abstract destination has no map focus");
    for(let i=0;i<21;i++) await page.locator("#step").click();
    assert.match(await page.locator(".map-agent-detail").innerText(), /第 21 刻.*試験資料館B/s);
    assert.match(await page.locator(".map-agent-detail").innerText(), /直近の選択理由：見物/);
    assert.equal(await page.locator("path.map-poi--observed").count(), 1, "selected agent highlights destination facility");
    await page.locator(".map-destination").click();
    assert.match(await page.locator(".leaflet-popup-content").innerText(), /那須与一：移動中/);
    assert.match(await page.locator(".map-facility-detail").innerText(), /人物の現在地.*示しません/);
    await page.locator("#save").click();
    for(let i=0;i<7;i++) await page.locator("#step").click();
    assert.match(await page.locator(".map-agent-detail").innerText(), /到着（模式空間）/);
    assert.match(await page.locator(".map-facility-detail").innerText(), /那須与一：到着/);
    if(process.env.MAP_SCREENSHOT_DIR) await page.locator("#map-view").screenshot({path:process.env.MAP_SCREENSHOT_DIR+"/map02-"+viewport.width+".png"});
    await page.locator("#restore").click();
    assert.match(await page.locator(".map-agent-detail").innerText(), /第 21 刻.*試験資料館B/s);
    assert.match(await page.locator(".map-facility-detail").innerText(), /那須与一：移動中/);
    if(await page.locator(".leaflet-popup-close-button").count()) await page.locator(".leaflet-popup-close-button").click();
    await page.locator("path.map-poi").first().click({force:true});
    assert.match(await page.locator(".map-facility-detail").innerText(), /試験カフェA/);
    assert.match(await page.locator(".map-facility-detail").innerText(), /現在の関心/);
    await page.locator("#people-list .person-item").first().click();
    assert.match(await page.locator("#map-observation").innerText(), /資料のみ/);
    assert.equal(await page.locator("#modern-map .leaflet-overlay-pane path").count(), 4,
      "only search circle, two facilities and heritage; no agents or routes");
    await page.locator('#map-observation button[data-agent-id="C115"]').click();
    await page.locator(".map-destination").click();
    const mapDims = await page.evaluate(() => ({clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth}));
    assert.ok(mapDims.scrollWidth <= mapDims.clientWidth + 4, "no horizontal overflow with map: " + JSON.stringify(mapDims));
    // MAP-03B default: no route provider on the public build, so nothing is fetched or drawn.
    assert.match(await page.locator("#route-provider").innerText(), /未設定/);
    await page.locator("#route-origin").selectOption({ label: "試験カフェA（行動候補）" });
    await page.locator("#route-destination").selectOption({ label: "試験資料館B（行動候補）" });
    assert.match(await page.locator("#route-check").innerText(), /直線距離は約\d+m（道路経路ではありません）.*未設定/s);
    assert.ok(await page.locator("#route-fetch").isDisabled(), "no provider, no route request");
    assert.equal(await page.locator("path.map-route-preview").count(), 0, "no fabricated route line");
    await page.locator("#remove-poi").click();
    assert.equal(await page.locator(".map-interest").count(), 0, "removal clears interests");
    assert.match(await page.locator(".map-facility-detail").innerText(), /人物はいません/);
    assert.equal(await page.locator("path.map-poi--adopted").count(), 0, "map follows removal");
    assert.equal(await page.locator("path.map-poi--eligible").count(), 2, "removed POIs remain as eligible, not adopted");
    await page.locator("#view-schematic").click();
    assert.ok(await page.locator("#schematic-view").isVisible(), "back to schematic");
    await page.locator("#activate-poi").click();
    assert.equal(await page.locator("#modern-station-layer circle").count(),2,"schematic still owns abstract POI markers");
    const dimensions = await page.evaluate(() => ({clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth}));
    assert.ok(dimensions.scrollWidth <= dimensions.clientWidth + 4, "no horizontal document overflow: " + JSON.stringify(dimensions));
    assert.deepEqual(errors, [], "uncaught browser console errors");
    console.log("PASS browser UI " + viewport.width + "px: people, sources, historic places, slider, save, interventions, fate ending, play/pause, modern map" + (tilesBlocked ? " (tiles blocked)" : ""));
    await page.close();
  }
  // Map library failure must not break the rest of the prototype.
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.route(url => url.toString().includes("/vendor/leaflet-"), route => route.fulfill({ status: 404, body: "" }));
  await page.goto(URL + "/prototype/", { waitUntil: "domcontentloaded", timeout: 15000 });
  await page.locator("#people-list .person-item").first().waitFor({ timeout: 12000 });
  await page.locator("#view-map").click();
  await page.waitForFunction(() => /地図ライブラリ/.test(document.querySelector("#map-status").innerText), null, { timeout: 10000 });
  assert.match(await page.locator("#map-status").innerText(), /模式図と施設一覧は引き続き使えます/);
  assert.equal(await page.locator("#map-observation button[data-agent-id]").count(), 3, "observations work without Leaflet");
  await page.locator('#map-observation button[data-agent-id="C115"]').click();
  assert.match(await page.locator(".map-agent-detail").innerText(), /那須与一/);
  await page.locator("#view-schematic").click();
  await page.locator("#step").click();
  assert.match(await page.locator("#clock").innerText(), /1 刻/, "simulation runs after map failure");
  assert.equal(await page.locator("#people-list .person-item").count(), 11);
  assert.deepEqual(errors, [], "no uncaught errors on map library failure");
  console.log("PASS map library failure fallback");
  await page.close();
  // MAP-03B opt-in evaluation provider, fully stubbed: no live routing request leaves the test.
  const routeFixture = { code: "Ok", routes: [{ distance: 95, geometry: { type: "LineString", coordinates: [[134.1008,34.3572],[134.10095,34.35752],[134.1011,34.3578]] } }] };
  for (const viewport of [{ width: 1280, height: 850 }, { width: 390, height: 844 }]) {
    const rp = await browser.newPage({ viewport, reducedMotion: "reduce" });
    const routeErrors = [], routeCalls = [];
    let routeReply = { status: 200, body: routeFixture };
    rp.on("pageerror", e => routeErrors.push(e.message));
    await rp.route(url => url.toString().includes("cyberjapandata.gsi.go.jp"), route => route.abort());
    await rp.route(url => url.toString().includes("api.openpoiapi.com/v1/search"), route => route.fulfill({
      status:200, contentType:"application/json", body:JSON.stringify({count:3,results:[
        {name:"試験カフェA",address:"模擬",category:"cafe",lat:34.3572,lng:134.1008,source:"fixture",licenses:["CC BY 4.0"],attributions:["Fixture"]},
        {name:"試験資料館B",address:"模擬",category:"tourism",lat:34.3578,lng:134.1011,source:"fixture",licenses:["CC BY 4.0"],attributions:["Fixture"]},
        {name:"未分類C",address:"模擬",category:"unknown",lat:34.3561,lng:134.1020,source:"fixture",licenses:["CC BY 4.0"],attributions:["Fixture"]},
      ]}) }));
    await rp.route(url => url.toString().includes("routing.openstreetmap.de"), route => {
      routeCalls.push(route.request().url());
      return route.fulfill({ status: routeReply.status, contentType: "application/json", body: JSON.stringify(routeReply.body) });
    });
    await rp.goto(URL + "/prototype/?route=fossgis", { waitUntil: "domcontentloaded", timeout: 15000 });
    await rp.locator("#people-list .person-item").first().waitFor({ timeout: 12000 });
    await rp.locator("#fetch-poi").click();
    await rp.locator("#view-map").click();
    await rp.locator("#modern-map.leaflet-container").waitFor({ timeout: 10000 });
    assert.match(await rp.locator("#route-provider").innerText(), /FOSSGIS/);
    assert.match(await rp.locator("#route-provider-note").innerText(), /無保証.*1秒1回/s);
    await rp.waitForFunction(() => document.querySelectorAll("#route-origin option").length === 3, null, { timeout: 10000 });
    const options = await rp.locator("#route-origin option").allInnerTexts();
    assert.deepEqual(options.slice(1), ["試験カフェA（採用可）", "試験資料館B（採用可）"], "unclassified POIs cannot be endpoints");
    await rp.locator("#route-origin").selectOption({ index: 1 });
    assert.ok(await rp.locator("#route-fetch").isDisabled(), "needs two facilities");
    await rp.locator("#route-destination").selectOption({ index: 1 });
    assert.match(await rp.locator("#route-check").innerText(), /同じ施設/);
    await rp.locator("#route-destination").selectOption({ index: 2 });
    await rp.locator("#route-fetch").click();
    await rp.locator("path.map-route-preview").waitFor({ timeout: 10000 });
    assert.equal(routeCalls.length, 1);
    assert.match(routeCalls[0], /134\.1008,34\.3572;134\.1011,34\.3578/, "facility coordinates in lng,lat order");
    const result = await rp.locator("#route-result").innerText();
    assert.match(result, /経路長 約95m/); assert.match(result, /ODbL/); assert.match(result, /人物の移動.*ではありません/s);
    assert.match(await rp.locator(".leaflet-control-attribution").innerText(), /OpenStreetMap contributors/, "route attribution shown");
    assert.equal(await rp.locator("#map-observation button[data-agent-id]").count(), 3, "agents remain observation-only");
    if(process.env.MAP_SCREENSHOT_DIR) await rp.locator("#map-view").screenshot({path:process.env.MAP_SCREENSHOT_DIR+"/map03b-"+viewport.width+".png"});
    const routeDims = await rp.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    assert.ok(routeDims[0] <= routeDims[1] + 4, "no horizontal overflow with route panel: " + routeDims);
    await rp.locator("#route-swap").click();
    assert.equal(await rp.locator("path.map-route-preview").count(), 0, "changing endpoints clears the old line");
    assert.doesNotMatch(await rp.locator(".leaflet-control-attribution").innerText(), /FOSSGIS/, "route credit removed with the line");
    routeReply = { status: 400, body: { code: "NoRoute" } };
    await rp.locator("#route-fetch").click();
    await rp.waitForFunction(() => /直線や推定の線は描きません/.test(document.querySelector("#route-result").innerText), null, { timeout: 10000 });
    assert.match(await rp.locator("#route-result").innerText(), /徒歩経路を見つけられません/);
    assert.equal(await rp.locator("path.map-route-preview").count(), 0, "failed route is not drawn");
    await rp.locator("#route-swap").click();
    await rp.locator("#route-fetch").click();
    await rp.locator("path.map-route-preview").waitFor({ timeout: 10000 });
    assert.equal(routeCalls.length, 2, "repeat pair served from memory cache");
    assert.match(await rp.locator("#route-result").innerText(), /前回の取得結果/);
    await rp.locator("#route-clear").click();
    assert.equal(await rp.locator("path.map-route-preview").count(), 0, "clear removes the line");
    assert.deepEqual(routeErrors, [], "no uncaught errors in route preview");
    console.log("PASS route preview " + viewport.width + "px (stubbed provider, no-route fallback, cache, attribution)");
    await rp.close();
  }
} catch(e) {
  failures.push(e instanceof Error ? e.stack : String(e));
} finally {
  await browser.close();
}
if(failures.length) {
  for (const e of failures) console.error(e);
  process.exitCode = 1;
}
