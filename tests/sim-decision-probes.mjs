import { createWorld, logEvent, rngNext } from '../prototype/core.mjs';
import { advanceFate, chapterMetrics } from './fixtures/sim02-fate.mjs';
import { writeFile } from 'node:fs/promises';

// Controlled decision probes are not autonomous playthroughs or population rates.
export function probe({energy=85,food=72,morale=65,allies=0,tick=50,bias=0,away=false,postponed=false}={},advance=advanceFate) {
  const w=createWorld(1185);w.tick=tick;w.fate.negotiationBias=bias;
  Object.assign(w.agents[0],{energy,provisions:food,morale,currentStationId:away?null:'yashima',visitedYashima:true,arrivedAtYashimaTick:40});
  for(let i=1;i<=allies;i++) w.agents[i].currentStationId='yashima';
  if(postponed) {w.fate.phase='postponed';w.fate.postponedUntil=65;}
  const readiness=chapterMetrics(w).readiness;
  advance(w,65,logEvent,rngNext);
  return {energy,food,morale,allies,tick,bias,away,postponed,readiness,phase:w.fate.phase,ending:w.fate.resolution?.kind??'pending'};
}
export async function main(prefix) {
  const rows=[];
  for(const energy of [0,10,20,40,85]) for(const food of [0,10,20,72,100])
    for(const morale of [20,65,100]) for(const allies of [0,2]) for(const bias of [0,25])
      rows.push(probe({energy,food,morale,allies,bias}));
  const timing=[];
  for(const tick of [36,64,65,81,82,111,112]) for(const away of [false,true])
    timing.push(probe({energy:10,food:5,morale:20,tick,away,postponed:true}));
  const summary={decisionProbes:rows.length,energyZeroCombat:rows.filter(r=>r.energy===0&&['upper_hand','stalemate','setback'].includes(r.ending)).length,
    foodZeroCombat:rows.filter(r=>r.food===0&&['upper_hand','stalemate','setback'].includes(r.ending)).length,
    energyZeroParley:rows.filter(r=>r.energy===0&&r.ending==='parley').length,
    foodZeroParley:rows.filter(r=>r.food===0&&r.ending==='parley').length,timing};
  await writeFile(`${prefix}.json`,JSON.stringify({summary,rows},null,2)+'\n');
  console.log(JSON.stringify(summary));
}
if(process.argv[1]?.endsWith('sim-decision-probes.mjs')) await main(process.argv[2]??'docs/reports/sim-02-decision-probes');
