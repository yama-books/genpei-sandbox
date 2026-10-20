import { readFile } from 'node:fs/promises';
import { loadEngine } from './sim-sensitivity.mjs';

// Frozen SIM-02 fate source; other engine sources did not change in SIM-03.
export const legacyFate = await readFile(new URL('./fixtures/sim02-fate.mjs',import.meta.url),'utf8');
export const CANDIDATES = [
  {id:'baseline',energy:0,food:0,away:false},
  {id:'floors',energy:15,food:12,away:false},
  {id:'reconsider',energy:15,food:12,away:true},
  {id:'strict',energy:25,food:20,away:true},
];
function replace(text,before,after) {
  if(text.split(before).length!==2) throw new Error('SIM-03 override must match exactly once: '+before);
  return text.replace(before,after);
}
export function candidateSource(c) {
  if(c.id==='baseline') return legacyFate;
  let text=replace(legacyFate,'  graceTicks: 15,',`  graceTicks: 15,\n  minimumBattleEnergy: ${c.energy},\n  minimumBattleProvisions: ${c.food},`);
  // Compare actual resource values; rounded metrics must not allow 14.9 to pass 15.
  text=replace(text,'  const m=chapterMetrics(world,gravity);',`  const m=chapterMetrics(world,gravity);
  const leader=world.agents.find(a=>a.id==="C036");
  const shortages=[];
  if(leader && leader.energy<FATE_RULES.minimumBattleEnergy) shortages.push("重度の疲労（最低体力未満）");
  if(leader && leader.provisions<FATE_RULES.minimumBattleProvisions) shortages.push("食料欠乏（最低食料未満）");
  if(m.readiness<46) shortages.push("体力・食料・士気による行動余力不足");
  const canParley=fate.negotiationBias>=20 && m.readiness>=37;`);
  text=replace(text,'  if(m.readiness<46) {','  if(shortages.length) {');
  text=replace(text,'causes:["体力・食料・士気による行動余力不足","再検討まで"+FATE_RULES.graceTicks+"刻"],','causes:[...shortages,"再検討まで"+FATE_RULES.graceTicks+"刻"],');
  text=replace(text,'["攻撃準備不足が継続","延期後も行動余力が回復せず"],m,log);','["攻撃準備不足が継続",...shortages],m,log);');
  if(c.away) text=replace(text,'  if(!m.atDecisionSite) return fate;',`  // Off-site reconsideration closes only a previously postponed chapter.
  // Recovery does not imply arrival, battle, talks, or a new grace period.
  if(!m.atDecisionSite) {
    if(fate.phase==="postponed" && fate.postponedUntil!==null && t>=fate.postponedUntil) {
      if(t>=FATE_RULES.departureTick) {
        closeChapter(world,"withdrawal","屋島への攻勢を断念",
          "回復のため屋島を離れている間に相手勢力が退避し、交戦の機会は失われた。",
          ["延期後も屋島の外にいる","相手勢力の退避（ゲーム上の設定）"],m,log);
      } else if(shortages.length && !canParley) {
        closeChapter(world,"withdrawal","屋島への攻勢を断念",
          "延期の猶予を経ても準備が整わず、義経は屋島の外で攻撃を取りやめた。",
          ["延期後、屋島の外で再判断",...shortages],m,log);
      } else if(!fate.decisions.some(d=>d.kind==="reconsidered")) {
        record(world,"reconsidered",{
          title:"再判断：行動余力は回復、屋島への帰還を待つ",
          detail:"現地に戻るまでは交戦や交渉を始めない。移動先は本人が判断する。",
          causes:["延期の猶予が経過","現地での判断が必要"],
        },log);
      }
    }
    return fate;
  }`);
  return text;
}
export const loadLegacyEngine=(s,temp)=>loadEngine(null,s,temp,{sourceOverrides:{fate:legacyFate}});
export const loadCandidate=(c,temp)=>loadEngine(null,{},temp,{sourceOverrides:{fate:legacyFate},transform:(name,text)=>name==='fate'?candidateSource(c):text});
