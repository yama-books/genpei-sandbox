import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import * as api from '../prototype/core.mjs';
import { setup, runOne, loadEngine, SCENARIOS } from './sim-sensitivity.mjs';
import { advanceFate, chapterMetrics } from '../prototype/fate.mjs';
import { advanceFate as legacyAdvance } from './fixtures/sim02-fate.mjs';

test('sensitivity changes only leader resource and leaves the control untouched',()=>{
  const control=setup(api,123,SCENARIOS[0]);
  const changed=setup(api,123,SCENARIOS.find(s=>s.id==='food-0'));
  assert.equal(changed.agents[0].provisions,0);
  changed.agents[0].provisions=72;
  assert.deepEqual(control,changed);
  assert.equal(new Set(SCENARIOS.map(s=>s.id)).size,SCENARIOS.length);
});
test('layout translation preserves POI identity, spacing, effects and geographic metadata',()=>{
  const control=setup(api,123,{id:'control'}),moved=setup(api,123,{id:'mid',layout:'mid'});
  const delta=control.modernPois.map((p,i)=>[Math.round((moved.modernPois[i].x-p.x)*10),Math.round((moved.modernPois[i].y-p.y)*10)]);
  assert.ok(delta.every(d=>JSON.stringify(d)===JSON.stringify(delta[0])));
  for(const p of moved.modernPois) {p.x+=264;p.y-=90;}
  assert.deepEqual(moved.modernPois,control.modernPois);
});
test('paired run checks replay and JSON resume including finite policy and low resources',()=>{
  for(const s of [SCENARIOS[0],SCENARIOS.find(s=>s.id==='stress-support')]) {
    const r=runOne(api,1185,100,s);
    assert.equal(r.replayMatches,true);assert.equal(r.resumeMatches,true);
    assert.equal(r.invalid+r.stalled+r.unaffordable,0);assert.notEqual(r.ending,'unresolved');
  }
});
test('experimental window and decision interval use isolated engine copies',async()=>{
  const temp=await mkdtemp(resolve(tmpdir(),'genpei-sensitivity-test-'));
  try {
    const {api:modified}=await loadEngine(null,{departure:60,interval:5},temp);
    const w=modified.createWorld(1);for(let i=0;i<90;i++) modified.stepWorld(w,0);
    assert.ok(w.fate.resolution);assert.ok(w.fate.resolution.resolvedAt<=90);
    assert.equal(api.createWorld(1).fate.closingTick,112);
  } finally {if(dirname(temp)===resolve(tmpdir())) await rm(temp,{recursive:true});}
});
test('SIM-02 historical probe: high food and morale masked exhaustion',()=>{
  const w=api.createWorld(1);w.tick=50;
  Object.assign(w.agents[0],{energy:0,provisions:100,morale:100,currentStationId:'yashima',visitedYashima:true,arrivedAtYashimaTick:50});
  assert.equal(chapterMetrics(w).readiness,60);
  legacyAdvance(w,100,api.logEvent,api.rngNext);
  assert.ok(['upper_hand','stalemate','setback'].includes(w.fate.resolution.kind));
});

test('postponed shortage only retreats on site before departure; absence reaches withdrawal at expiry',async()=>{
  const {probe}=await import('./sim-decision-probes.mjs');
  assert.equal(probe({energy:10,food:5,morale:20,tick:65,postponed:true},legacyAdvance).ending,'retreat');
  assert.equal(probe({energy:10,food:5,morale:20,tick:65,postponed:true,away:true},legacyAdvance).ending,'pending');
  assert.equal(probe({energy:10,food:5,morale:20,tick:82,postponed:true},legacyAdvance).ending,'empty');
  assert.equal(probe({energy:10,food:5,morale:20,tick:112,postponed:true,away:true},legacyAdvance).ending,'withdrawal');
});

test('single-clock experiment keeps closing fixed when departure changes',async()=>{
  const temp=await mkdtemp(resolve(tmpdir(),'genpei-clock-test-'));
  try {
    const loaded=await loadEngine(null,{departure:60,closing:112},temp);
    assert.equal(loaded.api.createWorld(1).fate.closingTick,112);
  } finally {if(dirname(temp)===resolve(tmpdir())) await rm(temp,{recursive:true});}
});

test('joint-window and single-clock variants do not share a cached module',async()=>{
  const temp=await mkdtemp(resolve(tmpdir(),'genpei-variant-test-'));
  try {
    const joint=await loadEngine(null,{departure:60},temp);
    const single=await loadEngine(null,{departure:60,closing:112},temp);
    assert.equal(joint.api.createWorld(1).fate.closingTick,90);
    assert.equal(single.api.createWorld(1).fate.closingTick,112);
  } finally {if(dirname(temp)===resolve(tmpdir())) await rm(temp,{recursive:true});}
});
