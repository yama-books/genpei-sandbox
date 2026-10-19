// Extension contract for the separate historical-province / historical-GIS engine.
// The working prototype still uses abstract coordinates; this module never supplies
// fabricated medieval roads, borders, coastlines, or travel times.
export const GEO_BRIDGE_VERSION = "0.1";
export const CHAPTER_GEO_CONTEXT = Object.freeze({
  chapterId: "yashima-what-if",
  storyYearApprox: 1185, // broad era label, NOT a Gregorian simulation calendar
  timeFrame: "late_heian",
  destinationStationId: "yashima",
  heritageSiteId: "YS001",
  provinceName: "讃岐国",
  provinceAuthority: "historical_label_only",
  externalProvinceId: null, // Assigned by the future shared 旧国名エンジン
  historicalGeometry: null,
  historicalRoutes: null,
  geometryStatus: "unresolved",
  sources: ["data/places/YASHIMA_SITE_REGISTRY.json"],
});
export function createHistoricalGeoRequest(chapter=CHAPTER_GEO_CONTEXT) {
  return {
    version: GEO_BRIDGE_VERSION,
    chapterId: chapter.chapterId,
    asOfYear: chapter.storyYearApprox,
    feature: {
      legacySiteId: chapter.heritageSiteId,
      label: "屋島",
      provinceLabel: chapter.provinceName,
      externalProvinceId: chapter.externalProvinceId,
    },
    requestedLayers: ["historical_province", "historical_place", "historical_route", "historical_coastline"],
    requiresAttribution: true,
  };
}
// The shared engine may later resolve this request. A response with no origin,
// temporal context or status is deliberately rejected instead of silently
// turning a modern site marker into an attested medieval route.
export function validateHistoricalGeoResponse(input) {
  if(!input || typeof input!=="object") return {ok:false,reason:"no_provider_response"};
  if(input.asOfYear!==1185) return {ok:false,reason:"era_mismatch"};
  if(!input.provenance || typeof input.provenance.sourceId!=="string" || !input.provenance.sourceId.trim())
    return {ok:false,reason:"missing_provenance"};
  if(!["documented","estimated","unknown"].includes(input.confidence))
    return {ok:false,reason:"missing_confidence"};
  if(!input.location || input.location.siteId!=="YS001")
    return {ok:false,reason:"site_mismatch"};
  return {ok:true,status:"ready_for_review",usableForMovement:false};
}
