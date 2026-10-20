import { writeFile } from 'node:fs/promises';
import * as api from '../prototype/core.mjs';
import { setup, SCENARIOS } from './sim-sensitivity.mjs';
import { SEEDS } from './sim-batch.mjs';

// Small causal witnesses supplement population counts, not a substitute for them.
const witnesses=[];
for(const id of ['control','food-0','money-0','money-90','energy-10','poi-start','poi-remote','advise-only']) {
  const s=SCENARIOS.find(s=>s.id===id),w=setup(api,SEEDS[0],s),timeline=[];
  for(let i=0;i<160 && !w.fate.resolution;i++) {
    for(const p of s.policy??[]) if(p.tick===w.tick) api.intervene(w,'C036',p.action);
    api.stepWorld(w,0);
    const a=w.agents[0];
    const events=w.events.filter(e=>e.tick===w.tick && e.personId==='C036');
    if(events.length) timeline.push({tick:w.tick,target:a.target,station:a.currentStationId,energy:a.energy,food:a.provisions,money:a.money,
      events:events.map(e=>({kind:e.kind,text:e.text}))});
  }
  witnesses.push({scenario:id,seed:SEEDS[0],gravity:0,ending:w.fate.resolution.kind,metrics:w.fate.resolution.metrics,timeline});
}
await writeFile('docs/reports/sim-02-witnesses.json',JSON.stringify(witnesses,null,2)+'\n');
console.log(JSON.stringify(witnesses.map(w=>({scenario:w.scenario,ending:w.ending,metrics:w.metrics}))));
