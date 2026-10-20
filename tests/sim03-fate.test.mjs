import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, snapshot, logEvent, rngNext, stepWorld } from '../prototype/core.mjs';
import { advanceFate, FATE_RULES } from '../prototype/fate.mjs';
const battle=new Set(['upper_hand','stalemate','setback']);
const advance=w=>advanceFate(w,100,logEvent,rngNext);
function world({energy=85,food=72,morale=100,away=false,tick=50,bias=0}={}) {
  const w=createWorld(1185);w.tick=tick;w.fate.negotiationBias=bias;
  Object.assign(w.agents[0],{energy,provisions:food,morale,currentStationId:away?null:'yashima',visitedYashima:true,arrivedAtYashimaTick:40});
  for(const a of w.agents.slice(1)) a.currentStationId='yashima';
  return w;
}
test('SIM-03: allies and morale cannot compensate for raw resource floors',()=>{
  for(const [energy,food] of [[0,100],[14.9,100],[100,0],[100,11.9]]) {
    const w=world({energy,food}),rng=w.rng;
    advance(w);
    assert.equal(w.fate.phase,'postponed');assert.equal(w.rng,rng);
    assert.ok(w.fate.decisions.at(-1).causes.some(c=>/疲労|食料欠乏/.test(c)));
  }
  for(const [energy,food] of [[15,100],[100,12]]) {
    const w=world({energy,food});advance(w);assert.ok(battle.has(w.fate.resolution.kind));
  }
});
test('SIM-03: floors do not disable viable talks; readiness still constrains both routes',()=>{
  const talks=world({energy:0,food:100,bias:25});advance(talks);
  assert.equal(talks.fate.resolution.kind,'parley');
  for(const bias of [0,25]) {
    const w=world({energy:15,food:12,morale:0,bias});
    w.agents.slice(1).forEach(a=>a.currentStationId=null);advance(w);
    assert.equal(w.fate.phase,'postponed');
  }
});
test('SIM-03: off-site shortage is reconsidered exactly at grace, without moving anyone',()=>{
  const w=world({energy:10,food:5});advance(w);
  w.agents[0].currentStationId=null;w.agents[0].target='rest';
  const agents=snapshot(w.agents),rng=w.rng;
  w.tick=64;advance(w);assert.equal(w.fate.resolution,null);
  w.tick=65;advance(w);
  assert.equal(w.fate.resolution.kind,'withdrawal');
  assert.equal(w.fate.resolution.resolvedAt,65);
  assert.equal(w.fate.resolution.metrics.atDecisionSite,false);
  assert.match(w.fate.resolution.summary,/屋島の外/);
  assert.deepEqual(w.agents,agents);assert.equal(w.rng,rng);
});
test('SIM-03: recovered traveller can return to fight or talk, never from afar',()=>{
  for(const bias of [0,25]) {
    const w=world({energy:10,food:5});advance(w);
    Object.assign(w.agents[0],{energy:90,provisions:90,currentStationId:null,target:'rest'});
    w.fate.negotiationBias=bias;w.tick=65;
    const agents=snapshot(w.agents),rng=w.rng;advance(w);
    assert.equal(w.fate.resolution,null);assert.deepEqual(w.agents,agents);assert.equal(w.rng,rng);
    w.tick=66;advance(w);
    assert.equal(w.fate.decisions.filter(d=>d.kind==='reconsidered').length,1);
    assert.equal(w.fate.postponedUntil,65);
    w.agents[0].currentStationId='yashima';advance(w);
    assert.ok(bias?w.fate.resolution.kind==='parley':battle.has(w.fate.resolution.kind));
  }
});
test('SIM-03: recovery for talks keeps an exhausted traveller pending, until return',()=>{
  const w=world({energy:0,food:0,morale:0});advance(w);
  Object.assign(w.agents[0],{energy:0,provisions:100,morale:100,currentStationId:null});
  w.fate.negotiationBias=25;w.tick=65;advance(w);assert.equal(w.fate.resolution,null);
  w.agents[0].currentStationId='yashima';advance(w);assert.equal(w.fate.resolution.kind,'parley');
});
test('SIM-03: a recovery observation does not freeze later shortage decisions',()=>{
  const w=world({energy:10,food:5});advance(w);
  Object.assign(w.agents[0],{energy:90,provisions:90,currentStationId:null});
  w.tick=65;advance(w);assert.equal(w.fate.resolution,null);
  w.agents[0].provisions=0;w.tick=66;advance(w);
  assert.equal(w.fate.resolution.kind,'withdrawal');
});
test('SIM-03: return during grace waits, shortages at the site retreat, late arrivals stay empty',()=>{
  const w=world({energy:10,food:5});advance(w);
  Object.assign(w.agents[0],{energy:90,provisions:90});w.tick=64;advance(w);
  assert.equal(w.fate.resolution,null);w.tick=65;advance(w);assert.ok(battle.has(w.fate.resolution.kind));
  const low=world({energy:10,food:5});advance(low);low.tick=65;advance(low);
  assert.equal(low.fate.resolution.kind,'retreat');
  const late=world({energy:10,food:5});advance(late);late.tick=82;advance(late);
  assert.equal(late.fate.resolution.kind,'empty');
});
test('SIM-03: away recovery cannot extend the opportunity; closing remains authoritative',()=>{
  const w=world({energy:10,food:5});advance(w);
  Object.assign(w.agents[0],{energy:90,provisions:90,currentStationId:null});
  w.tick=81;advance(w);assert.equal(w.fate.resolution,null);
  w.tick=82;advance(w);assert.equal(w.fate.resolution.kind,'withdrawal');
  assert.match(w.fate.resolution.summary,/相手勢力が退避/);
  // A late initial postponement does not reopen an already departed opponent.
  const late=world({energy:10,food:5,tick:80});advance(late);
  late.agents[0].currentStationId=null;late.tick=82;advance(late);assert.equal(late.fate.resolution,null);
  late.tick=95;advance(late);
  assert.equal(late.fate.resolution.kind,'withdrawal');
  const closed=world({energy:10,food:5,tick:111});closed.agents[0].currentStationId=null;
  closed.tick=112;advance(closed);assert.equal(closed.fate.resolution.kind,'withdrawal');
});
test('SIM-03: unpostponed absence remains free, even after a prior visit',()=>{
  const w=world({away:true,energy:0,food:0});advance(w);assert.equal(w.fate.resolution,null);
  w.tick=82;advance(w);assert.equal(w.fate.resolution,null);
  w.tick=112;advance(w);assert.equal(w.fate.resolution.kind,'withdrawal');
  assert.equal(FATE_RULES.departureTick,82);assert.equal(FATE_RULES.closingTick,112);
});
test('SIM-03: JSON resume mid-postponement reproduces free movement and immutable resolution',()=>{
  const w=world({energy:10,food:5});advance(w);
  w.agents[0].currentStationId=null;w.agents[0].target='rest';
  const restored=snapshot(w),initial=snapshot(w.agents[0]);
  for(let i=0;i<90;i++) {stepWorld(w,0);stepWorld(restored,0);}
  assert.deepEqual(w,restored);assert.notEqual(w.agents[0].x,initial.x);
  assert.equal(w.fate.phase,'resolved');
  const resolution=snapshot(w.fate.resolution);
  for(let i=0;i<10;i++) stepWorld(w,0);
  assert.deepEqual(w.fate.resolution,resolution);
});
