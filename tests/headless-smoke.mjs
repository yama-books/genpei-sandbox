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
    const dimensions = await page.evaluate(() => ({clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth}));
    assert.ok(dimensions.scrollWidth <= dimensions.clientWidth + 4, "no horizontal document overflow: " + JSON.stringify(dimensions));
    assert.deepEqual(errors, [], "uncaught browser console errors");
    console.log("PASS browser UI " + viewport.width + "px: people, sources, historic places, slider, save, interventions, fate ending, play/pause");
    await page.close();
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
