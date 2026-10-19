import test from "node:test";
import assert from "node:assert/strict";
import { buildModernStations, abstractPoiPosition, gameActionForCategory, MAX_GAME_POIS } from "../prototype/poi-world.mjs";
import { createWorld, installModernPois, removeModernPois, destinationScores, stepWorld, snapshot } from "../prototype/core.mjs";

const realShape=(name, category, lat, lng, distanceMeters=100)=>({
  name,category,lat,lng,distanceMeters,
  address:"香川県高松市（テスト用）",
  source:"test_fixture",licenses:["CC BY 4.0"],attributions:["fixture"],gameCategory:"テスト",
});
const examples=[
  realShape("屋島のカフェ（テスト施設）","cafe",34.3573,134.1012,90),
  realShape("休息の宿（テスト施設）","lodging",34.3552,134.102,210),
  realShape("史跡の見物（テスト施設）","tourism",34.358,134.10,240),
  realShape("食料店（テスト施設）","grocery",34.356,134.103,220),
];

test("カテゴリーを確認できる施設にだけ仮のゲーム効果を割り当てる",()=>{
  assert.equal(gameActionForCategory("cafe"),"meal");
  assert.equal(gameActionForCategory("lodging"),"rest");
  assert.equal(gameActionForCategory("tourism"),"visit");
  assert.equal(gameActionForCategory("unknown"),null);
  assert.equal(gameActionForCategory("school"),null);
  const out=buildModernStations([...examples,realShape("用途不明","unknown",34.356,134.103)]);
  assert.equal(out.length,4);
  assert.deepEqual(out.map(x=>x.action),["meal","rest","visit","supplies"]);
});

test("出典・許諾・位置情報を保持し、不完全な情報から施設を作らない",()=>{
  const sourceMissing={...examples[0],source:""};
  const licensesMissing={...examples[0],licenses:[]};
  const out=buildModernStations([sourceMissing,licensesMissing,{...examples[0],name:""},examples[0]]);
  assert.equal(out.length,1);
  assert.equal(out[0].label,examples[0].name);
  assert.deepEqual(out[0].provenance.licenses,["CC BY 4.0"]);
  assert.deepEqual(out[0].provenance.attributions,["fixture"]);
  assert.equal(out[0].routing,"abstract_straight_line_only");
  assert.equal(out[0].modernLocation.lat,examples[0].lat);
  assert.equal(abstractPoiPosition(examples[0]).x>=70,true);
});

test("重複やカテゴリー集中は上限を超えない",()=>{
  const many=Array.from({length:50},(_,i)=>realShape("カフェ"+i,"cafe",34.356+i*.00001,134.101));
  const out=buildModernStations([many[0],many[0],...many]);
  assert.equal(out.length,4);
  assert.ok(out.length<=MAX_GAME_POIS);
  assert.equal(new Set(out.map(p=>p.id)).size,out.length);
});

test("人物が実在POI形状の登録先へ到達し、費用と食料の状態が変化する",()=>{
  const w=createWorld(1185);
  const installed=installModernPois(w,[examples[0]]);
  assert.equal(installed.added,1);
  const modern=w.modernPois[0],actor=w.agents[0];
  actor.x=modern.x;actor.y=modern.y;
  actor.provisions=14;actor.energy=35;actor.money=40;
  actor.target=modern.id;actor.clock=w.tick;
  const food=actor.provisions,cash=actor.money;
  stepWorld(w,0);
  assert.equal(actor.currentStationId,modern.id);
  assert.ok(actor.provisions>food);
  assert.ok(actor.money<cash);
  assert.match(w.events[0].text,/カフェ/);
  assert.equal(w.events[0].kind,"facility");
});

test("財布が空の人物は料金を払ったことにしない",()=>{
  const w=createWorld();
  installModernPois(w,[examples[0]]);
  const a=w.agents[0],p=w.modernPois[0];
  a.x=p.x;a.y=p.y;a.target=p.id;a.money=0;
  const food=a.provisions;
  stepWorld(w,0);
  assert.equal(a.money,0);
  assert.ok(a.provisions<=food);
  assert.match(w.events[0].text,/資金不足/);
});

test("施設の有無で目的地の得点が変わり、削除すると元の候補に戻る",()=>{
  const w=createWorld();
  const a=w.agents[1];
  assert.equal(destinationScores(a,50,w).length,6);
  installModernPois(w,examples);
  assert.equal(destinationScores(a,50,w).length,10);
  a.target=w.modernPois[0].id;
  removeModernPois(w);
  assert.equal(a.target,null);
  assert.equal(destinationScores(a,50,w).length,6);
});

test("取得済み施設を含む世界もシード・状態が同じなら完全再現",()=>{
  const a=createWorld(1912);
  installModernPois(a,examples);
  const b=snapshot(a);
  for(let i=0;i<180;i++){stepWorld(a,70);stepWorld(b,70);}
  assert.deepEqual(a,b);
  assert.deepEqual(a.modernPois,b.modernPois);
});
