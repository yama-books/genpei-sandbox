import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CANDIDATES, candidateSource } from './sim03-rules.mjs';
import { probe } from './sim-decision-probes.mjs';
const battle=r=>['upper_hand','stalemate','setback'].includes(r.ending);
export async function probes() {
  const reports=[];
  for(const c of CANDIDATES) {
    const {advanceFate}=await import('data:text/javascript;base64,'+Buffer.from(candidateSource(c)).toString('base64'));
    const rows=[];
    for(const energy of [0,10,20,40,85]) for(const food of [0,10,20,72,100])
      for(const morale of [20,65,100]) for(const allies of [0,2]) for(const bias of [0,25])
        rows.push(probe({energy,food,morale,allies,bias},advanceFate));
    const timing=[];
    for(const tick of [64,65,81,82,95,112]) for(const away of [false,true])
      for(const resources of [{energy:10,food:5,morale:20},{energy:85,food:72,morale:65}])
        timing.push(probe({tick,away,postponed:true,...resources},advanceFate));
    reports.push({candidate:c.id,decisionProbes:rows.length,
      energyZeroCombat:rows.filter(r=>r.energy===0&&battle(r)).length,
      foodZeroCombat:rows.filter(r=>r.food===0&&battle(r)).length,
      energyZeroParley:rows.filter(r=>r.energy===0&&r.ending==='parley').length,
      foodZeroParley:rows.filter(r=>r.food===0&&r.ending==='parley').length,
      timing,rows});
  }
  return reports;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const reports=await probes();
  await writeFile('docs/reports/sim-03-probes.json',JSON.stringify(reports,null,2)+'\n');
  console.log(JSON.stringify(reports.map(({rows,timing,...summary})=>summary)));
}
