import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { runOne, loadEngine } from './sim-sensitivity.mjs';

test('SIM-02 artifacts contain complete paired matrices and sampled trajectories reproduce',async()=>{
  const temp=await mkdtemp(resolve(tmpdir(),'genpei-artifact-test-'));
  let total=0;
  try {
    for(const name of ['baseline','time']) {
      const report=JSON.parse(await readFile(new URL(`../docs/reports/sim-02-${name}.json`,import.meta.url),'utf8'));
      const lines=(await readFile(new URL(`../docs/reports/sim-02-${name}.csv`,import.meta.url),'utf8')).trim().split(/\r?\n/);
      const [header,...body]=lines,keys=header.split(',');
      const rows=body.map(line=>Object.fromEntries(line.split(',').map((v,i)=>[keys[i],v])));
      assert.equal(report.seeds.length,128);assert.equal(rows.length,report.scenarios.length*3*128);
      assert.equal(report.cells.length,report.scenarios.length*3);total+=rows.length;
      const variants=new Map();
      for(const s of report.scenarios) {
        const key=JSON.stringify([s.departure,s.interval,s.closing,s.grace,s.earliest]);
        if(!variants.has(key)) variants.set(key,await loadEngine(report.ref,s,temp));
        const {api,sources}=variants.get(key);assert.deepEqual(sources,report.sources);
        for(const gravity of [0,50,100]) {
          const cell=report.cells.find(c=>c.scenario===s.id&&c.gravity===gravity);
          const group=rows.filter(r=>r.scenario===s.id&&Number(r.gravity)===gravity);
          assert.equal(new Set(group.map(r=>r.seed)).size,128);
          assert.deepEqual(group.map(r=>Number(r.seed)),report.seeds);
          const endings={};for(const r of group) {
            endings[r.ending]=(endings[r.ending]??0)+1;
            assert.equal(r.replayMatches,'true');assert.equal(r.resumeMatches,'true');
            for(const k of ['invalid','stalled','unaffordable']) assert.equal(Number(r[k]),0);
          }
          assert.deepEqual(endings,cell.endings);
          assert.equal(cell.replayMismatch+cell.resumeMismatch+cell.invalid+cell.stalled+cell.unaffordable,0);
          const actual=runOne(api,report.seeds[0],gravity,s),stored=group[0];
          for(const [k,v] of Object.entries(actual)) assert.equal(stored[k],v===null?'':String(v),`${name}/${s.id}/${gravity}/${k}`);
        }
      }
    }
    console.log(`SIM-02: ${total} recorded runs; complete paired matrices, zero recorded violations; first seed in every cell independently reproduced.`);
  } finally {if(dirname(temp)===resolve(tmpdir())) await rm(temp,{recursive:true});}
});
