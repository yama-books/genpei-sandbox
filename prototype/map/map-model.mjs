// Pure data model for the optional modern map view (MAP-01).
// Only real WGS84 coordinates from OpenPOI records or the heritage registry are
// placed on the map. The abstract stage x/y (agents, game stations, projected POI
// dots) is NEVER converted into a map position here.
import { buildModernStations, gameActionForCategory } from "../poi-world.mjs";
import { YASHIMA_SAMPLE_CENTER, RADIUS_METERS, OPENPOI_ATTRIBUTION } from "../openpoi.mjs";

export const MAP_MODEL_VERSION = "0.1";

// 地理院タイル: no application needed for live web use; credit "地理院タイル" with a
// link to the tile list (checked 2026-10-20). Japan coverage is z5-18; zooms below
// 9 switch to a global dataset that needs extra credit, so we stay at z10+.
export const TILE_SOURCE = Object.freeze({
  id: "gsi-pale",
  label: "地理院タイル（淡色地図）",
  url: "https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png",
  minZoom: 10,
  maxZoom: 18,
  termsUrl: "https://maps.gsi.go.jp/development/ichiran.html",
});
export const TILE_ATTRIBUTION_HTML =
  '<a href="' + TILE_SOURCE.termsUrl + '" target="_blank" rel="noopener noreferrer">地理院タイル</a>';
export const POI_ATTRIBUTION_HTML =
  '施設：<a href="' + OPENPOI_ATTRIBUTION + '" target="_blank" rel="noopener noreferrer">OpenPOI API</a>';

export const ACTION_LABELS = Object.freeze({ meal: "食事候補", supplies: "食料調達候補", rest: "休息候補", visit: "見物候補" });

// Display status of a fetched POI. Only "adopted" items influence the simulation.
export const POI_STATUS = Object.freeze({
  adopted: "行動候補に採用中",
  eligible: "採用可（未追加）",
  capped: "参照のみ（候補上限外）",
  unclassified: "参照のみ（用途未分類）",
  unsourced: "参照のみ（出典情報不足）",
});

const HERITAGE_PRECISION = Object.freeze({
  area_representative_not_event_point: "史跡範囲の代表点。合戦や伝承の位置ではありません",
  verified_site_point: "史跡の現在地。1185年の事件位置の実証ではありません",
});

export const poiKey = (name, lat, lng) => String(name).trim() + "|" + lat.toFixed(5) + "|" + lng.toFixed(5);

export function isRealCoordinate(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
    && !(lat === 0 && lng === 0);
}

const hasProvenance = r => Boolean(r.source) && Array.isArray(r.licenses) && r.licenses.length > 0
  && Array.isArray(r.attributions) && r.attributions.length > 0;

export function poiStatus(record, eligibleKeys, adoptedKeys) {
  const key = poiKey(record.name, record.lat, record.lng);
  if (adoptedKeys.has(key)) return "adopted";
  if (eligibleKeys.has(key)) return "eligible";
  if (!gameActionForCategory(record.category)) return "unclassified";
  if (!hasProvenance(record)) return "unsourced";
  return "capped";
}

// records: normalized OpenPOI records (openpoi.mjs). adoptedPois: world.modernPois.
export function buildPoiMarkers(records = [], adoptedPois = []) {
  if (!Array.isArray(records)) return [];
  const eligibleKeys = new Set(buildModernStations(records)
    .map(p => poiKey(p.label, p.modernLocation.lat, p.modernLocation.lng)));
  const adoptedKeys = new Set((adoptedPois || []).filter(p => p?.modernLocation)
    .map(p => poiKey(p.label, p.modernLocation.lat, p.modernLocation.lng)));
  const seen = new Set();
  const markers = [];
  for (const r of records) {
    if (typeof r?.name !== "string" || !r.name.trim() || !isRealCoordinate(r.lat, r.lng)) continue;
    const key = poiKey(r.name, r.lat, r.lng);
    if (seen.has(key)) continue;
    seen.add(key);
    const status = poiStatus(r, eligibleKeys, adoptedKeys);
    const action = gameActionForCategory(r.category);
    markers.push({
      key, name: r.name.trim(), lat: r.lat, lng: r.lng,
      status, statusLabel: POI_STATUS[status],
      actionLabel: action ? ACTION_LABELS[action] : "用途未分類",
      category: r.category || "unknown",
      address: r.address || "",
      distanceMeters: r.distanceMeters,
      source: r.source || "",
      licenses: Array.isArray(r.licenses) ? r.licenses.slice() : [],
      attributions: Array.isArray(r.attributions) ? r.attributions.slice() : [],
    });
  }
  return markers;
}

// Heritage registry entries without verified coordinates are omitted, not guessed.
export function buildHeritageMarkers(sites = []) {
  if (!Array.isArray(sites)) return [];
  return sites
    .filter(s => isRealCoordinate(s?.location?.lat, s?.location?.lng) && HERITAGE_PRECISION[s.location.precision])
    .map(s => ({
      id: s.site_id, name: s.name, lat: s.location.lat, lng: s.location.lng,
      precision: s.location.precision, precisionLabel: HERITAGE_PRECISION[s.location.precision],
      designation: s.designation || "",
      source: s.location.coordinate_source || s.source_urls?.[0] || "",
    }));
}

export function buildMapModel({ records = [], adoptedPois = [], sites = [] } = {}) {
  const pois = buildPoiMarkers(records, adoptedPois);
  return {
    version: MAP_MODEL_VERSION,
    positionDomain: "real_geo",
    center: { lat: YASHIMA_SAMPLE_CENTER.lat, lng: YASHIMA_SAMPLE_CENTER.lng },
    searchRadiusMeters: RADIUS_METERS,
    pois,
    heritage: buildHeritageMarkers(sites),
    // Agents live in the abstract domain until the simulation exposes real_geo positions.
    agentsOnMap: false,
    counts: Object.fromEntries(Object.keys(POI_STATUS).map(k => [k, pois.filter(p => p.status === k).length])),
  };
}

// Cheap signature so the view only redraws when the visible data changes.
export function mapModelSignature(model) {
  return model.pois.map(p => p.key + ":" + p.status).join(",") + "#" + model.heritage.map(h => h.id).join(",");
}
