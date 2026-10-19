// node --test tests/fate.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { createWorld, stepWorld, intervene, snapshot, rngNext, logEvent } from "../prototype/core.mjs";
import { FATE_RULES, advanceFate, chapterMetrics } from "../prototype/fate.mjs";
import { CHAPTER_GEO_CONTEXT, createHistoricalGeoRequest, validateHistoricalGeoResponse } from "../prototype/geography-bridge.mjs";

function readyWorld(tick=50) {
  const w=createWorld(1185);
  w.tick=tick;
  w.agents[0].visitedYashima=true;
  w.agents[0].arrivedAtYashimaTick=42;
  return w;
}
const advance=(w,gravity=65)=>advanceFate(w,gravity,logEvent,rngNext);

test("歴史地理へのインターフェースは年代・典拠を求め、道路を捏造しない",()=>{
  const r=createHistoricalGeoRequest();
  assert.equal(r.asOfYear,1185);
  assert.equal(r.feature.legacySiteId,"YS001");
  assert.equal(r.feature.provinceLabel,"讃岐国");
  assert.equal(CHAPTER_GEO_CONTEXT.externalProvinceId,null);
  assert.equal(CHAPTER_GEO_CONTEXT.historicalRoutes,null);
  assert.equal(validateHistoricalGeoResponse(null).ok,false);
  assert.equal(validateHistoricalGeoResponse({asOfYear:1185}).ok,false);
  assert.equal(validateHistoricalGeoResponse({asOfYear:1689,provenance:{sourceId:"x"},confidence:"documented",location:{siteId:"YS001"}}).ok,false);
  assert.deepEqual(validateHistoricalGeoResponse({asOfYear:1185,provenance:{sourceId:"x"},confidence:"estimated",location:{siteId:"YS001"}}),
    {ok:true,status:"ready_for_review",usableForMovement:false});
});

test("訪問と結末は別扱いで、機会が開く前の訪問は強制戦闘とならない",()=>{
  const w=readyWorld(25);
  advance(w);
  assert.equal(w.fate.phase,"watching");
  assert.equal(w.fate.resolution,null);
  w.tick=35;advance(w);
  assert.equal(w.fate.phase,"approaching");
  assert.equal(w.fate.resolution,null);
});

test("到着かつ余力がある時、ゲーム上の交戦結果で章を閉じる",()=>{
  const w=readyWorld(50);
  advance(w);
  assert.ok(["upper_hand","stalemate","setback"].includes(w.fate.resolution.kind));
  assert.equal(w.fate.resolution.provenance,"fictional_simulation");
  assert.equal(w.fate.resolution.geographicRef,"YS001");
  const n=w.fate.decisions.length;
  w.tick=100;advance(w);
  assert.equal(w.fate.decisions.length,n,"resolution must be emitted exactly once");
});

test("交渉助言を受けた場合、戦闘を強制せず交渉へ",()=>{
  const w=readyWorld(51);
  w.fate.negotiationBias=25;
  advance(w);
  assert.equal(w.fate.resolution.kind,"parley");
  assert.equal(w.fate.resolution.factors.length,2);
});

test("補給不足なら延期し、回復できなければ撤退になる",()=>{
  const w=readyWorld(50),a=w.agents[0];
  a.provisions=5;a.energy=10;a.morale=20;
  advance(w);
  assert.equal(w.fate.phase,"postponed");
  assert.equal(w.fate.resolution,null);
  w.tick=60;advance(w);
  assert.equal(w.fate.resolution,null);
  w.tick=65;advance(w);
  assert.equal(w.fate.resolution.kind,"retreat");
});

test("延期後の支援で回復した場合、再び決断できる",()=>{
  const w=readyWorld(50),a=w.agents[0];
  a.provisions=2;a.energy=10;a.morale=22;
  advance(w);
  assert.equal(w.fate.phase,"postponed");
  a.provisions=90;a.energy=90;a.morale=65;
  w.tick=65;advance(w);
  assert.notEqual(w.fate.resolution,null);
  assert.ok(["upper_hand","stalemate","setback"].includes(w.fate.resolution.kind));
});

test("遅れて到着したら空振りに、到着しなければ時限終了になる",()=>{
  const late=readyWorld(84);
  late.agents[0].arrivedAtYashimaTick=83;
  advance(late);
  assert.equal(late.fate.resolution.kind,"empty");
  const absent=createWorld(1185);
  absent.tick=FATE_RULES.closingTick;
  advance(absent);
  assert.equal(absent.fate.resolution.kind,"missed");
  assert.match(absent.fate.resolution.summary,/訪れない/);
});

test("交渉助言は義経専用で、成功すると意向が強まる。終章後は受けられない",()=>{
  const w=createWorld(1185);
  assert.equal(intervene(w,"C065","mediate").ok,false);
  assert.equal(w.interventionBudget,3);
  const outcome=intervene(w,"C036","mediate");
  assert.equal(outcome.ok,true);
  assert.equal(w.interventionBudget,2);
  assert.equal(w.fate.negotiationBias,outcome.accepted?25:0);
  w.tick=FATE_RULES.closingTick;advance(w);
  assert.equal(intervene(w,"C036","mediate").ok,false);
  assert.equal(w.interventionBudget,2);
});

test("介入とシードが同一なら結末・記録は再現し、章の後も日常が続く",()=>{
  const w=createWorld(2026),copy=snapshot(w);
  for(let i=0;i<150;i++){stepWorld(w,65);stepWorld(copy,65);}
  assert.deepEqual(w,copy);
  assert.equal(w.fate.phase,"resolved");
  const result=snapshot(w.fate.resolution);
  for(let i=0;i<20;i++)stepWorld(w,30);
  assert.deepEqual(w.fate.resolution,result);
  assert.equal(w.tick,170);
});

test("未到着の集団を自動的に屋島へ移動させない",()=>{
  const w=createWorld(1185);
  assert.equal(chapterMetrics(w).arrived,false);
  w.tick=FATE_RULES.closingTick;
  advance(w);
  assert.ok(w.agents.every(a=>a.visitedYashima===false));
});
