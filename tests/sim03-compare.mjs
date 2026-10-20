import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { runOne } from './sim-sensitivity.mjs';
import { POLICY, SEEDS } from './sim-batch.mjs';
import { CANDIDATES, candidateSource, loadCandidate } from './sim03-rules.mjs';

export const SCENARIOS = [
  {id:'control'}, {id:'no-poi',layout:'none'},
  {id:'finite-policy',policy:POLICY}, {id:'parley',policy:[{tick:20,action:'mediate'}]},
  {id:'food-0',resources:{provisions:0}}, {id:'energy-10',resources:{energy:10}},
  {id:'money-0',resources:{money:0}},
  {id:'stress',resources:{energy:40,provisions:20,money:0}},
  {id:'stress-support',resources:{energy:40,provisions:20,money:0},policy:[{tick:0,action:'support'}]},
  {id:'poi-start',layout:'start'}, {id:'poi-mid',layout:'mid'},
];
// Development and held-out seeds are disjoint from each other and SIM-01/02.
export const seedsFor=stage=>Array.from({length:stage==='pilot'?32:128},(_,i)=>Math.imul((stage==='pilot'?1001:2001)+i,0x9e3779b1)>>>0);
const battle=new Set(['upper_hand','stalemate','setback']);
export function summarize(rows) {
  const endings={};for(const r of rows) endings[r.ending]=(endings[r.ending]??0)+1;
  const sum=k=>rows.reduce((n,r)=>n+Number(r[k]),0);
  return {runs:rows.length,endings,battle:rows.filter(r=>battle.has(r.ending)).length,
    lowResourceBattle:rows.filter(r=>battle.has(r.ending)&&(r.energy<15||r.food<12)).length,
    arrived:rows.filter(r=>r.arrival!==null).length,postponed:sum('postponed'),
    leisure:sum('leisure'),rest:sum('rest'),supply:sum('supply'),
    invalid:sum('invalid'),stalled:sum('stalled'),unaffordable:sum('unaffordable'),
    replayMismatch:rows.filter(r=>!r.replayMatches).length,resumeMismatch:rows.filter(r=>!r.resumeMatches).length};
}
export async function compare(stage,prefix) {
  if(!['pilot','validation'].includes(stage)) throw new Error('stage must be pilot or validation');
  const seeds=seedsFor(stage),rows=[],cells=[],sources={};
  if(seeds.some(s=>SEEDS.includes(s))) throw new Error('Seed overlap');
  for(const c of CANDIDATES) {
    const temp=await mkdtemp(resolve(tmpdir(),'genpei-sim03-'));
    try {
      const loaded=await loadCandidate(c,temp);
      sources[c.id]={...loaded.sources,'prototype/fate.mjs':createHash('sha256').update(JSON.stringify(candidateSource(c).replace(/\r\n/g,'\n'))).digest('hex')};
      for(const scenario of SCENARIOS) for(const gravity of [0,50,100]) {
        const results=seeds.map(seed=>({...runOne(loaded.api,seed,gravity,scenario),candidate:c.id}));
        rows.push(...results);cells.push({candidate:c.id,scenario:scenario.id,gravity,...summarize(results)});
      }
      console.log(JSON.stringify({candidate:c.id,...summarize(rows.filter(r=>r.candidate===c.id))}));
    } finally {
      // Only remove this exact, resolved mkdtemp child of the OS temp directory.
      if(dirname(temp)!==resolve(tmpdir())) throw new Error('Unexpected temp path');
      await rm(temp,{recursive:true});
    }
  }
  for(const cell of cells) {
    const group=rows.filter(r=>r.candidate===cell.candidate&&r.scenario===cell.scenario&&r.gravity===cell.gravity);
    const control=rows.filter(r=>r.candidate==='baseline'&&r.scenario===cell.scenario&&r.gravity===cell.gravity);
    cell.changedEndings=group.filter((r,i)=>r.ending!==control[i].ending).length;
  }
  const report={schemaVersion:1,stage,ticks:240,seeds,candidates:CANDIDATES,scenarios:SCENARIOS,sources,cells};
  await mkdir(dirname(resolve(prefix)),{recursive:true});
  await writeFile(`${prefix}.json`,JSON.stringify(report,null,2)+'\n');
  const keys=Object.keys(rows[0]);
  await writeFile(`${prefix}.csv`,[keys.join(','),...rows.map(r=>keys.map(k=>r[k]??'').join(','))].join('\n')+'\n');
  const bad=cells.some(c=>c.invalid||c.stalled||c.unaffordable||c.replayMismatch||c.resumeMismatch||c.endings.unresolved||(c.candidate!=='baseline'&&c.lowResourceBattle));
  console.log(JSON.stringify({stage,runs:rows.length,failed:bad,output:prefix}));
  if(bad) throw new Error('SIM-03 invariant failed');
  return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  if(process.argv.length!==4) throw new Error('Usage: node tests/sim03-compare.mjs <pilot|validation> <output-prefix>');
  await compare(process.argv[2],process.argv[3]);
}
