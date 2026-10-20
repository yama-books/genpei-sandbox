import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { SEEDS } from './sim-batch.mjs';
import { SIM_POIS } from './fixtures/sim-pois.mjs';

// One factor at a time; all resource overrides affect only Yoshitsune.
export const SCENARIOS = [
  { id:'control' }, { id:'food-0', resources:{provisions:0} },
  { id:'food-20', resources:{provisions:20} }, { id:'food-100', resources:{provisions:100} },
  { id:'energy-10', resources:{energy:10} }, { id:'energy-40', resources:{energy:40} },
  { id:'energy-100', resources:{energy:100} }, { id:'money-0', resources:{money:0} },
  { id:'money-9', resources:{money:9} }, { id:'money-90', resources:{money:90} },
  { id:'window-60', departure:60 }, { id:'window-100', departure:100 },
  { id:'window-140', departure:140 }, { id:'no-poi', layout:'none' },
  { id:'poi-start', layout:'start' }, { id:'poi-mid', layout:'mid' },
  { id:'poi-remote', layout:'remote' },
  { id:'decide-5', interval:5 }, { id:'decide-20', interval:20 },
  { id:'advise-only', policy:[{tick:0,action:'advise'}] },
  { id:'mediate-only', policy:[{tick:20,action:'mediate'}] },
  { id:'support-only', policy:[{tick:45,action:'support'}] },
  { id:'support-early', policy:[{tick:0,action:'support'}] },
  // Explicit interactions, reported separately from one-factor contrasts.
  { id:'stress', resources:{energy:40,provisions:20,money:0}, interaction:true },
  { id:'stress-support', resources:{energy:40,provisions:20,money:0}, policy:[{tick:0,action:'support'}], interaction:true },
];
function replaceLiteral(text, before, after) {
  if(text.split(before).length!==2) throw new Error('Experimental override must match exactly once: '+before);
  return text.replace(before,after);
}
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const applyPolicy = (w,s,api) => {
  for (const p of s.policy ?? []) if(w.tick===p.tick && !w.fate.resolution) {
    if(!api.intervene(w,'C036',p.action).ok) throw new Error('Rejected policy');
  }
};
export function setup(api,seed,s) {
  const w=api.createWorld(seed);
  Object.assign(w.agents[0],s.resources);
  if(s.layout!=='none') {
    api.installModernPois(w,SIM_POIS);
    // Experimental abstract translation only. Keep category/effects/count/spacing fixed.
    const centers={start:[220,480],mid:[480,390],remote:[220,120]};
    if(centers[s.layout]) {
      const [x,y]=centers[s.layout];
      for(const p of w.modernPois) { p.x=Math.round((p.x-744+x)*10)/10;p.y=Math.round((p.y-300+y)*10)/10; }
    }
  }
  return w;
}
export function runOne(api,seed,gravity,s,{verify=true}={}) {
  const w=setup(api,seed,s), counts={invalid:0,stalled:0,unaffordable:0,leisure:0,rest:0,supply:0};
  const old=w.agents.map(a=>({x:a.x,y:a.y,still:0}));
  let checkpoint,atClose=null,postponed=0;
  const trace=createHash('sha256');
  for(let i=0;i<240;i++) {
    if(i===30) checkpoint=api.snapshot(w);
    applyPolicy(w,s,api);api.stepWorld(w,gravity);
    const events=w.events.filter(e=>e.tick===w.tick);
    for(const e of events) {
      if(e.kind==='warning' && /資金不足|費用不足/.test(e.text)) counts.unaffordable++;
      if(e.kind==='facility') {
        if(/見物|娯楽/.test(e.text)) counts.leisure++;
        if(/休息/.test(e.text)) counts.rest++;
        if(/補給|食事|調達/.test(e.text)) counts.supply++;
      }
    }
    if(w.fate.decisions.some(d=>d.tick===w.tick && d.kind==='postponed')) postponed++;
    if(w.fate.resolution && atClose===null) atClose={arrived:w.agents[0].visitedYashima,at:w.agents[0].arrivedAtYashimaTick};
    w.agents.forEach((a,j)=>{
      if([a.energy,a.provisions,a.morale].some(v=>!Number.isFinite(v)||v<0||v>100)||!Number.isFinite(a.money)||a.money<0||a.money>120||!Number.isFinite(a.x)||!Number.isFinite(a.y)||a.x<0||a.x>1000||a.y<0||a.y>640) counts.invalid++;
      old[j].still=a.target && a.currentStationId===null && a.x===old[j].x && a.y===old[j].y?old[j].still+1:0;
      if(old[j].still===60) counts.stalled++;
      old[j].x=a.x;old[j].y=a.y;
    });
    trace.update(JSON.stringify([w.tick,w.rng,w.agents,w.fate,events]));
  }
  const traceHash=trace.digest('hex'), worldHash=digest(w);
  let replayMatches=true,resumeMatches=true;
  if(verify) {
    const replay=runOne(api,seed,gravity,s,{verify:false});
    replayMatches=worldHash===replay.worldHash && traceHash===replay.traceHash;
    const resumed=api.snapshot(checkpoint);
    while(resumed.tick<240) {applyPolicy(resumed,s,api);api.stepWorld(resumed,gravity);}
    resumeMatches=JSON.stringify(w)===JSON.stringify(resumed);
  }
  const r=w.fate.resolution;
  return {seed,gravity,scenario:s.id,ending:r?.kind??'unresolved',resolvedAt:r?.resolvedAt??null,
    arrival:w.agents[0].arrivedAtYashimaTick,arrivedAtResolution:atClose?.arrived??false,
    inWindow:w.agents[0].arrivedAtYashimaTick!==null && w.agents[0].arrivedAtYashimaTick<(s.departure??82),
    readiness:r?.metrics.readiness??null,energy:r?.metrics.energy??null,food:r?.metrics.provisions??null,
    postponed,...counts,replayMatches,resumeMatches,worldHash,traceHash};
}
export async function loadEngine(ref,s,temp) {
  const root=resolve(temp,`${s.departure??82}-${s.interval??10}-${s.closing??(s.departure?s.departure+30:112)}-${s.grace??15}-${s.earliest??36}`);
  await mkdir(root,{recursive:true});
  const sources={};
  for(const name of ['core','fate','poi-world','openpoi']) {
    const file=`prototype/${name}.mjs`;
    let text=ref?execFileSync('git',['show',`${ref}:${file}`],{encoding:'utf8'}):await readFile(new URL(`../${file}`,import.meta.url),'utf8');
    sources[file]=digest(text.replace(/^\uFEFF/,'').replace(/\r\n/g,'\n'));
    if(name==='fate' && s.departure) {
      text=replaceLiteral(text,'departureTick: 82,',`departureTick: ${s.departure},`);text=replaceLiteral(text,'closingTick: 112,',`closingTick: ${s.closing??s.departure+30},`);
    }
    if(name==='fate') {
      if(s.closing && !s.departure) text=replaceLiteral(text,'closingTick: 112,', 'closingTick: '+s.closing+',');
      if(s.grace) text=replaceLiteral(text,'graceTicks: 15,', 'graceTicks: '+s.grace+',');
      if(s.earliest) text=replaceLiteral(text,'earliestDecisionTick: 36,', 'earliestDecisionTick: '+s.earliest+',');
    }
    if(name==='core' && s.interval) text=replaceLiteral(text,'world.tick % 10 === 1',`world.tick % ${s.interval} === 1`);
    await writeFile(resolve(root,`${name}.mjs`),text);
  }
  return {api:await import(pathToFileURL(resolve(root,'core.mjs')).href),sources};
}
export async function main(prefix,ref,scenarios=SCENARIOS) {
  const temp=await mkdtemp(resolve(tmpdir(),'genpei-sim02-'));
  const rows=[],cells=[],engines=new Map();let sources;
  try {
    for(const s of scenarios) {
      const key=`${s.departure??82}-${s.interval??10}-${s.closing??(s.departure?s.departure+30:112)}-${s.grace??15}-${s.earliest??36}`;
      if(!engines.has(key)) engines.set(key,await loadEngine(ref,s,temp));
      const loaded=engines.get(key);sources=loaded.sources;
      for(const gravity of [0,50,100]) {
        const results=SEEDS.map(seed=>runOne(loaded.api,seed,gravity,s)); rows.push(...results);
        const endings={};for(const r of results) endings[r.ending]=(endings[r.ending]??0)+1;
        const sum=k=>results.reduce((n,r)=>n+Number(r[k]),0);
        const control=rows.filter(r=>r.scenario==='control'&&r.gravity===gravity);
        cells.push({scenario:s.id,gravity,runs:results.length,endings,arrived:results.filter(r=>r.arrival!==null).length,
          atResolution:sum('arrivedAtResolution'),inWindow:sum('inWindow'),postponed:sum('postponed'),
          changedEndings:results.filter((r,i)=>r.ending!==control[i].ending).length,
          leisure:sum('leisure'),rest:sum('rest'),supply:sum('supply'),invalid:sum('invalid'),stalled:sum('stalled'),unaffordable:sum('unaffordable'),
          replayMismatch:results.filter(r=>!r.replayMatches).length,resumeMismatch:results.filter(r=>!r.resumeMatches).length});
      }
      console.log(`${s.id}: ${JSON.stringify(cells.slice(-3).map(c=>({g:c.gravity,endings:c.endings,postponed:c.postponed})))}`);
    }
  } finally {
    // Only remove this verified mkdtemp child, never a caller path.
    if(dirname(temp)===resolve(tmpdir())) await rm(temp,{recursive:true});
  }
  const report={schemaVersion:1,ref:ref??'working-tree',ticks:240,seeds:SEEDS,scenarios,sources,cells};
  await mkdir(dirname(resolve(prefix)),{recursive:true});
  await writeFile(`${prefix}.json`,JSON.stringify(report,null,2)+'\n');
  const keys=Object.keys(rows[0]);await writeFile(`${prefix}.csv`,[keys.join(','),...rows.map(r=>keys.map(k=>r[k]??'').join(','))].join('\n')+'\n');
  await writeFile(`${prefix}.md`,['# SIM-02 sensitivity','', 'Synthetic game experiments, not historical probabilities. 128 paired fixed seeds per cell; gravity 0/50/100; 240 ticks; replay and tick-30 JSON resume checked in every run.', '',
    '|Scenario|Gravity|Arrived / 128|At resolution|Before departure|Postponed|Endings|Changed vs control|Replay/resume|Invalid/stalled/unaffordable|',
    '|---|---|---|---|---|---|---|---|---|---|',
    ...cells.map(c=>`|${c.scenario}|${c.gravity}|${c.arrived}|${c.atResolution}|${c.inWindow}|${c.postponed}|${JSON.stringify(c.endings)}|${c.changedEndings}|${c.replayMismatch}/${c.resumeMismatch}|${c.invalid}/${c.stalled}/${c.unaffordable}|`),'',
    'Control: default resources, four synthetic POIs near Yashima, no intervention. Resource changes affect only C036. Window scenarios shift departure and closing together (30-tick gap); *-only scenarios override one clock and hold the others fixed. See scenarios in JSON for exact overrides. Decision interval changes only periodic reconsideration; arrival-triggered decisions remain. POI translations change only abstract x/y, keeping relative spacing/effects/costs fixed; modernLocation stays fixture metadata and is not a route. Stress scenarios are explicit interactions. Changed endings count paired per-seed differences, not statistical significance. Facility counts cover all three agents through tick 240, including after chapter resolution. Arrived includes late visits; at-resolution excludes them. Finite stalls are not a proof of perpetual liveness. Source hashes use normalized UTF-8 text encoded as a JSON string before SHA-256.',''].join('\n'));
  const failed=cells.some(c=>c.invalid||c.stalled||c.unaffordable||c.replayMismatch||c.resumeMismatch||c.endings.unresolved);
  console.log(JSON.stringify({runs:rows.length,failed,output:prefix}));if(failed)process.exitCode=1;
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2);
  if(![2,4].includes(args.length)||args[0]!=='--output'||(args.length===4&&(args[2]!=='--baseline-ref'||!/^[a-f0-9]{7,40}$/.test(args[3])))) throw new Error('Usage: node tests/sim-sensitivity.mjs --output <prefix> [--baseline-ref <sha>]');
  await main(args[1],args[3]);
}
