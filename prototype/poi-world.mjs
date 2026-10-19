// POI-to-world bridge. Real modern POI names/coordinates stay separate from
// imaginary movement rates, motives, costs and benefits. This is NOT routing.
import { YASHIMA_SAMPLE_CENTER } from "./openpoi.mjs";

export const MODERN_POI_RULE_VERSION = "0.1";
export const MAX_GAME_POIS = 12;
export const POI_ACTIONS = Object.freeze({
  restaurant: "meal", cafe: "meal", fast_food: "meal", bakery: "meal",
  grocery: "supplies", convenience_store: "supplies", supermarket: "supplies",
  lodging: "rest", hotel: "rest", tourism: "visit", park: "visit",
});
const ACTION_CAP = Object.freeze({ meal: 4, supplies: 3, rest: 2, visit: 3 });
const clip = (n,lo,hi)=>Math.min(hi,Math.max(lo,n));
export function gameActionForCategory(category) {
  return POI_ACTIONS[String(category||"")] ?? null;
}
// Coordinate-informed symbolic projection, NOT an actual map, street or route.
// x/y positions are only for the pre-existing non-geographical sandbox stage.
export function abstractPoiPosition(p, center=YASHIMA_SAMPLE_CENTER) {
  const metersEast=(p.lng-center.lng)*111320*Math.cos(center.lat*Math.PI/180);
  const metersNorth=(p.lat-center.lat)*111320;
  return {
    x:Math.round(clip(744+metersEast*.22,70,950)*10)/10,
    y:Math.round(clip(300-metersNorth*.22,65,565)*10)/10,
  };
}
export function buildModernStations(records) {
  if (!Array.isArray(records)) return [];
  const visited=new Set(), used={meal:0,supplies:0,rest:0,visit:0}, places=[];
  for(const r of records) {
    const action=gameActionForCategory(r.category);
    if(!action || used[action]>=ACTION_CAP[action] || places.length>=MAX_GAME_POIS) continue;
    if(typeof r.name!=="string" || !r.name.trim() || !Number.isFinite(r.lat) || !Number.isFinite(r.lng)) continue;
    // Only source-linked items are used in the game. A missing license is not inferred.
    if(!r.source || !Array.isArray(r.licenses) || r.licenses.length===0 ||
       !Array.isArray(r.attributions) || r.attributions.length===0) continue;
    if(!(r.distanceMeters>=0 && r.distanceMeters<=1300)) continue;
    const key=r.name.trim()+"|"+r.lat.toFixed(5)+"|"+r.lng.toFixed(5);
    if(visited.has(key)) continue;
    visited.add(key);
    const loc=abstractPoiPosition(r);
    places.push({
      id:"modern-"+(places.length+1), kind:"modern-poi", label:r.name.trim(), action,
      x:loc.x,y:loc.y,
      modernLocation:{lat:r.lat,lng:r.lng,address:r.address||"",distanceMeters:r.distanceMeters},
      provenance:{provider:"OpenPOI",source:r.source,licenses:r.licenses.slice(),attributions:r.attributions.slice()},
      routing:"abstract_straight_line_only",
    });
    used[action]++;
  }
  return places;
}
export function modernPoiScore(agent,site) {
  if(site.action==="meal") return {base:15+(100-agent.provisions)*1.27, why:"空腹と食事"};
  if(site.action==="supplies") return {base:12+(100-agent.provisions)*1.12,why:"食料の確保"};
  if(site.action==="rest") return {base:10+(100-agent.energy)*1.18,why:"休息"};
  return {base:8+agent.curiosity*68+(100-agent.morale)*.18,why:"見物"};
}
export const POI_GAME_EFFECT = Object.freeze({
  meal:{cost:7,food:39,energy:0,morale:8},
  supplies:{cost:9,food:46,energy:0,morale:0},
  rest:{cost:6,food:0,energy:48,morale:8},
  visit:{cost:0,food:0,energy:-4,morale:16},
});
