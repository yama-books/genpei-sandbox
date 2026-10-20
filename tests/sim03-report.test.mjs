import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { CANDIDATES, candidateSource, loadCandidate } from './sim03-rules.mjs';
import { summarize, seedsFor, SCENARIOS } from './sim03-compare.mjs';
import { runOne } from './sim-sensitivity.mjs';
import { SEEDS } from './sim-batch.mjs';
import { probes } from './sim03-probes.mjs';
import { witnesses } from './sim03-witnesses.mjs';
const normalized=text=>text.replace(/^\uFEFF/,'').replace(/\r\n/g,'\n');
const read=name=>readFile(new URL(`../${name}`,import.meta.url),'utf8');
const hash=text=>createHash('sha256').update(JSON.stringify(normalized(text))).digest('hex');
test('SIM-03: production equals the pilot-selected candidate; frozen baseline matches SIM-02',async()=>{
  assert.equal(normalized(await read('prototype/fate.mjs')),normalized(candidateSource(CANDIDATES.find(c=>c.id==='reconsider'))));
  const legacy=JSON.parse(await read('docs/reports/sim-02-baseline.json'));
  assert.equal(hash(candidateSource(CANDIDATES[0])),legacy.sources['prototype/fate.mjs']);
});
test('SIM-03: probes reproduce zero-resource exclusion and retained talks',async()=>{
  const actual=await probes(),recorded=JSON.parse(await read('docs/reports/sim-03-probes.json'));
  assert.deepEqual(actual,recorded);
  assert.equal(actual[0].energyZeroCombat,8);assert.equal(actual[0].foodZeroCombat,4);
  for(const r of actual.slice(1)) {
    assert.equal(r.energyZeroCombat+r.foodZeroCombat,0);
    assert.equal(r.energyZeroParley,14);assert.equal(r.foodZeroParley,11);
  }
});
test('SIM-03: natural postponement witnesses reproduce including mid-grace JSON resume',async()=>{
  const actual=await witnesses();assert.deepEqual(actual,JSON.parse(await read('docs/reports/sim-03-witnesses.json')));
  assert.ok(actual.some(r=>r.candidate==='reconsider'&&r.postponedResumeMatches===true));
  assert.ok(actual.every(r=>r.postponedResumeMatches!==false));
});
test('SIM-03: complete independent matrices, aggregates, source hashes and sampled trajectories reproduce',{timeout:120000},async()=>{
  const pilotSeeds=seedsFor('pilot'),validationSeeds=seedsFor('validation');
  assert.equal(new Set([...pilotSeeds,...validationSeeds,...SEEDS]).size,288);
  let total=0;
  for(const stage of ['pilot','validation']) {
    const report=JSON.parse(await read(`docs/reports/sim-03-${stage}.json`));
    assert.deepEqual(report.seeds,seedsFor(stage));assert.deepEqual(report.candidates,CANDIDATES);assert.deepEqual(report.scenarios,SCENARIOS);
    const [header,...body]=(await read(`docs/reports/sim-03-${stage}.csv`)).trim().split(/\r?\n/);
    const keys=header.split(','),strings=new Set(['candidate','scenario','ending','worldHash','traceHash']);
    const rows=body.map(line=>Object.fromEntries(line.split(',').map((v,i)=>[keys[i],strings.has(keys[i])?v:v==='true'?true:v==='false'?false:v===''?null:Number(v)])));
    assert.equal(rows.length,report.seeds.length*CANDIDATES.length*SCENARIOS.length*3);total+=rows.length;
    assert.equal(report.cells.length,CANDIDATES.length*SCENARIOS.length*3);
    for(const c of CANDIDATES) {
      const temp=await mkdtemp(resolve(tmpdir(),'genpei-sim03-report-'));
      try {
        const loaded=await loadCandidate(c,temp),sources={...loaded.sources,'prototype/fate.mjs':hash(candidateSource(c))};
        assert.deepEqual(report.sources[c.id],sources);
        for(const scenario of SCENARIOS) for(const gravity of [0,50,100]) {
          const group=rows.filter(r=>r.candidate===c.id&&r.scenario===scenario.id&&r.gravity===gravity);
          assert.deepEqual(group.map(r=>r.seed),report.seeds);
          const baseline=rows.filter(r=>r.candidate==='baseline'&&r.scenario===scenario.id&&r.gravity===gravity);
          const cell=report.cells.find(r=>r.candidate===c.id&&r.scenario===scenario.id&&r.gravity===gravity);
          const changedEndings=group.filter((r,i)=>r.ending!==baseline[i].ending).length;
          assert.deepEqual(cell,{candidate:c.id,scenario:scenario.id,gravity,...summarize(group),changedEndings});
          assert.equal(cell.invalid+cell.stalled+cell.unaffordable+cell.replayMismatch+cell.resumeMismatch,0);
          assert.equal(cell.endings.unresolved??0,0);
          if(c.id!=='baseline') assert.equal(cell.lowResourceBattle,0);
          const sample=runOne(loaded.api,report.seeds[0],gravity,scenario);
          const {candidate,...stored}=group[0];assert.deepEqual(sample,stored);
        }
      } finally {if(dirname(temp)===resolve(tmpdir())) await rm(temp,{recursive:true});}
    }
  }
  console.log(`SIM-03: ${total} paired recorded runs; 264 cells independently sampled; all recorded invariants pass.`);
});
