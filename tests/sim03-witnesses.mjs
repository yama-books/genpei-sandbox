import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { setup } from './sim-sensitivity.mjs';
import { CANDIDATES, loadCandidate } from './sim03-rules.mjs';
import { SCENARIOS, seedsFor } from './sim03-compare.mjs';
export async function witnesses() {
  const records=[];
  for(const c of CANDIDATES.filter(c=>['baseline','reconsider'].includes(c.id))) {
    const temp=await mkdtemp(resolve(tmpdir(),'genpei-sim03-witness-'));
    try {
      const {api}=await loadCandidate(c,temp);
      for(const id of ['control','stress','stress-support']) {
        const scenario=SCENARIOS.find(s=>s.id===id),seed=seedsFor('validation')[0];
        const w=setup(api,seed,scenario),timeline=[];let checkpoint=null;
        const policy=world=>{for(const p of scenario.policy??[]) if(world.tick===p.tick&&!world.fate.resolution) api.intervene(world,'C036',p.action);};
        while(w.tick<240) {
          policy(w);api.stepWorld(w,100);
          if(!checkpoint&&w.fate.phase==='postponed') checkpoint=api.snapshot(w);
          const events=w.events.filter(e=>e.tick===w.tick&&e.personId==='C036');
          if(events.length&&w.tick<=112) {
            const a=w.agents[0];
            timeline.push({tick:w.tick,target:a.target,station:a.currentStationId,energy:a.energy,food:a.provisions,money:a.money,
              phase:w.fate.phase,ending:w.fate.resolution?.kind??null,events:events.map(({kind,text})=>({kind,text}))});
          }
        }
        let postponedResumeMatches=null;
        if(checkpoint) {
          const restored=api.snapshot(checkpoint);
          while(restored.tick<240) {policy(restored);api.stepWorld(restored,100);}
          postponedResumeMatches=JSON.stringify(restored)===JSON.stringify(w);
          if(!postponedResumeMatches) throw new Error('Postponed checkpoint mismatch');
        }
        records.push({candidate:c.id,scenario:id,seed,gravity:100,postponedCheckpointTick:checkpoint?.tick??null,
          postponedResumeMatches,decisions:w.fate.decisions,resolution:w.fate.resolution,timeline});
      }
    } finally {if(dirname(temp)===resolve(tmpdir())) await rm(temp,{recursive:true});}
  }
  return records;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const records=await witnesses();await writeFile('docs/reports/sim-03-witnesses.json',JSON.stringify(records,null,2)+'\n');
  console.log(JSON.stringify(records.map(({timeline,decisions,...r})=>({...r,resolution:{kind:r.resolution.kind,tick:r.resolution.resolvedAt}}))));
}
