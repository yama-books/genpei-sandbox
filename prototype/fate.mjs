// Prototype v0.2: a fictional chapter decision engine, not a historical reconstruction.
// "Arrival", "decision" and "resolution" are separate; no enemy unit/real battle simulation.
export const FATE_RULES = Object.freeze({
  chapterId: "yashima-what-if",
  locationRef: "YS001",           // site registry ID, not a mapped 1185 event coordinate
  provinceRef: "sanuki",         // provisional semantic label, no GIS polygon attached
  openingTick: 35,
  earliestDecisionTick: 50,
  departureTick: 82,             // fictional chapter window, not 1185 calendar date
  closingTick: 112,
  graceTicks: 15,
});
export function newFateState() {
  return {
    chapterId: FATE_RULES.chapterId,
    phase: "watching",
    openingTick: FATE_RULES.openingTick,
    closingTick: FATE_RULES.closingTick,
    negotiationBias: 0,
    postponedUntil: null,
    resolution: null,
    decisions: [],
    geoRef: FATE_RULES.locationRef,
  };
}
const strength = (a, allyCount) => Math.round(a.energy * .32 + a.provisions * .35 + a.morale * .25 + Math.min(2, allyCount) * 6);
export function chapterMetrics(world, gravity=65) {
  const leader=world.agents.find(a=>a.id==="C036");
  if (!leader) return { leaderPresent:false, arrived:false, readiness:0, allyCount:0 };
  const allyCount=world.agents.filter(a=>a.id!=="C036" && a.visitedYashima).length;
  return {
    leaderPresent: true,
    arrived: leader.visitedYashima===true,
    arrivedAt: leader.arrivedAtYashimaTick ?? null,
    allyCount,
    readiness: strength(leader,allyCount),
    energy: Math.round(leader.energy),
    provisions: Math.round(leader.provisions),
    morale: Math.round(leader.morale),
    money: Math.round(leader.money),
    gravity: Math.min(100,Math.max(0,gravity)),
    negotiationBias: world.fate?.negotiationBias ?? 0,
  };
}
function record(world,kind,body,log) {
  const entry={tick:world.tick,kind,...body};
  world.fate.decisions.push(entry);
  log(world,"fate",entry.title+"（屋島篇の架空判定）","C036");
}
function closeChapter(world,kind,title,summary,why,metrics,log,randomFactor=null) {
  const result={
    kind,title,summary,
    resolvedAt:world.tick,
    factors:why,
    metrics:{...metrics},
    randomFactor,
    provenance:"fictional_simulation",
    geographicRef: FATE_RULES.locationRef,
  };
  world.fate.phase="resolved";
  world.fate.resolution=result;
  record(world,"resolution",{title,detail:summary,causes:why},log);
  return result;
}
export function advanceFate(world,gravity,log,rngNext) {
  const fate=world.fate;
  if (!fate || fate.resolution) return fate;
  const t=world.tick;
  if (fate.phase==="watching" && t >= FATE_RULES.openingTick) {
    fate.phase="approaching";
    record(world,"opening",{
      title:"屋島をめぐる機会が近づく",
      detail:"人物が到着しなくても仮想世界の時間は進む",
    },log);
  }
  if (t < FATE_RULES.earliestDecisionTick) return fate;
  const m=chapterMetrics(world,gravity);
  // Expiry is always checked. An agent cannot keep the chapter waiting forever.
  if(t>=FATE_RULES.closingTick) {
    if(!m.arrived) closeChapter(world,"missed","屋島の戦い、起こらず",
      "義経が運命の場所を訪れないまま、屋島の機会は過ぎ去った。",
      ["屋島への到達なし","時間的な機会の消失"],m,log);
    else closeChapter(world,"withdrawal","戦いの機会、失われる",
      "屋島には到達したが、判断を先延ばしにする間に交戦の機会は消えた。",
      ["屋島には到達","判断の延期と時間経過"],m,log);
    return fate;
  }
  if(!m.arrived) return fate;
  if(t>=FATE_RULES.departureTick) {
    closeChapter(world,"empty","屋島は、すでに静かだった",
      "屋島へ向かったものの、仮想の相手勢力はすでに場を離れ、戦闘は成立しなかった。",
      ["到達したが時機を逸した","相手勢力の退避（ゲーム上の設定）"],m,log);
    return fate;
  }
  if(fate.postponedUntil!==null && t<fate.postponedUntil) return fate;
  // The player can suggest talks, but they are only attempted if Yoshitsune is in shape.
  if(fate.negotiationBias>=20 && m.readiness>=37) {
    closeChapter(world,"parley","刃を交えず、交渉へ",
      "義経は攻撃を見送り、交渉を選択した。双方は少なくともこの時点で衝突を回避した。",
      ["交渉への助言を受け入れた","交渉できるだけの行動余力があった"],m,log);
    return fate;
  }
  if(m.readiness<46) {
    if(fate.phase!=="postponed") {
      fate.phase="postponed";
      fate.postponedUntil=t+FATE_RULES.graceTicks;
      record(world,"postponed",{
        title:"決断の刻：補給と体力が足りず、攻撃を延期",
        detail:"回復できれば次の決断で戦いへ進める。機会は無期限ではない。",
        causes:["体力・食料・士気による行動余力不足","再検討まで"+FATE_RULES.graceTicks+"刻"],
      },log);
    } else {
      closeChapter(world,"retreat","補給尽き、撤退を決意",
        "休養や補給が整わないまま時間が経過し、義経は攻撃を取りやめた。",
        ["攻撃準備不足が継続","延期後も行動余力が回復せず"],m,log);
    }
    return fate;
  }
  const roll=Math.round((rngNext(world)-.5)*14);
  const battleScore=Math.round(m.readiness+m.gravity*.09+roll-(t-FATE_RULES.earliestDecisionTick)*.12);
  const reasons=["義経が屋島に到達","行動余力 "+m.readiness+"（仮想点）",
    "同行候補の到達 "+m.allyCount+"名",
    "簡易対立判定 "+battleScore+"（乱数を含む）"];
  const kind=battleScore>=78?"upper_hand":battleScore>=58?"stalemate":"setback";
  const titles={upper_hand:"屋島への攻勢、優勢に",stalemate:"屋島で交戦、決着つかず",setback:"屋島で交戦、攻撃は頓挫"};
  const descriptions={
    upper_hand:"義経たちは攻撃を決断し、この架空の判定では攻勢を優位に進めた。",
    stalemate:"交戦は始まったものの、双方に決定打はなく戦いは膠着した。",
    setback:"攻勢は始まったが、準備や戦力がかみ合わず撤収する結果となった。"
  };
  closeChapter(world,kind,titles[kind],descriptions[kind],reasons,m,log,roll);
  return fate;
}
// Accepted mediation influences intention, but does not automatically force a treaty.
export function adviseParley(world,agent,rngNext,log) {
  if(world.fate?.resolution) return {ok:false,reason:"この章の運命はすでに確定しています"};
  if(!agent || agent.id!=="C036") return {ok:false,reason:"この試作では義経への交渉助言のみ対応しています"};
  if(world.interventionBudget<=0) return {ok:false,reason:"介入可能回数がありません"};
  world.interventionBudget--;
  const accepted=rngNext(world)<.30+.65*agent.trust;
  if(accepted) world.fate.negotiationBias+=25;
  log(world,"intervention",accepted?"義経が交渉への助言を受け入れた":"義経は交渉への助言を見送った",agent.id);
  return {ok:true,accepted};
}
