// MAP-03: inert route-provider boundary, no network calls and no simulated GPS.
// A *modern facility-to-facility* route can be reviewed independently from
// fictional character locations or historical province / medieval routes.
import { isRealCoordinate } from "./map-model.mjs";
import { getAgentPlacement } from "../movement-observation.mjs";
import { createHistoricalGeoRequest, validateHistoricalGeoResponse } from "../geography-bridge.mjs";

export const ROUTE_CONTRACT_VERSION = "modern-route/1";
export const SPATIAL_DOMAINS = Object.freeze({
  modern: "modern_wgs84",
  historical: "historical_geo",
  abstract: "abstract",
});

const nonEmpty = v => typeof v === "string" && v.trim().length > 0;
const validCoord = c => c && isRealCoordinate(c.lat, c.lng);
const copied = v => structuredClone(v);
function verifiedModernPlace(p) {
  if (!p || p.kind !== "modern-poi" || !nonEmpty(p.id)) return null;
  if (!validCoord(p.modernLocation)) return null;
  const src = p.provenance;
  if (!src || !nonEmpty(src.provider) || !nonEmpty(src.source) ||
      !Array.isArray(src.licenses) || src.licenses.length === 0 ||
      !src.licenses.every(nonEmpty) ||
      !Array.isArray(src.attributions) || src.attributions.length === 0 ||
      !src.attributions.every(nonEmpty)) return null;
  return {
    placeId: p.id,
    name: p.label,
    coordinate: {lat:p.modernLocation.lat, lng:p.modernLocation.lng},
    provenance: copied(src),
  };
}
// Requests are *not* directions for characters. They connect two sourced POIs.
// The returned request contains no walking route or movement duration.
export function makeModernRouteRequest(origin, destination) {
  const start=verifiedModernPlace(origin), end=verifiedModernPlace(destination);
  if (!start || !end) return {ok:false,reason:"missing_verified_modern_place"};
  if (start.placeId===end.placeId) return {ok:false,reason:"same_place"};
  return {ok:true,request:{
    schemaVersion:ROUTE_CONTRACT_VERSION,
    positionDomain:SPATIAL_DOMAINS.modern,
    routePurpose:"facility_to_facility_preview",
    travelMode:"walking",
    yearContext:"present_day",
    origin:start,
    destination:end,
  }};
}
const radians = d => d*Math.PI/180;
function metersBetween(a,b) {
  const dLat=radians(b.lat-a.lat), dLon=radians(b.lng-a.lng);
  const aa=Math.sin(dLat/2)**2+Math.cos(radians(a.lat))*Math.cos(radians(b.lat))*Math.sin(dLon/2)**2;
  return 6371008.8*2*Math.atan2(Math.sqrt(aa),Math.sqrt(Math.max(0,1-aa)));
}
// Validation is a *format/evidence gate*, not source authentication or proof
// that the road is open. Rejected data never silently becomes a straight line.
export function reviewModernRoute(request, answer) {
  const fail=reason=>({ok:false,reason,canDrawPreview:false,canMoveAgent:false});
  if (!request || request.schemaVersion!==ROUTE_CONTRACT_VERSION ||
      request.positionDomain!==SPATIAL_DOMAINS.modern ||
      request.routePurpose!=="facility_to_facility_preview" ||
      request.travelMode!=="walking" || request.yearContext!=="present_day" ||
      !request.origin || !request.destination ||
      !validCoord(request.origin.coordinate) || !validCoord(request.destination.coordinate))
    return fail("invalid_request");
  if (!answer || typeof answer!=="object") return fail("no_provider_response");
  if (answer.schemaVersion!==ROUTE_CONTRACT_VERSION || answer.positionDomain!==SPATIAL_DOMAINS.modern ||
      answer.travelMode!=="walking" || answer.yearContext!=="present_day")
    return fail("wrong_domain_or_version");
  if (answer.originId!==request.origin.placeId || answer.destinationId!==request.destination.placeId)
    return fail("mismatched_endpoints");
  const p=answer.provenance;
  if (!p || !nonEmpty(p.providerId) || !nonEmpty(p.sourceId) || !nonEmpty(p.attribution) ||
      !nonEmpty(p.license) || !nonEmpty(p.retrievedAt) ||
      !Number.isFinite(Date.parse(p.retrievedAt)) ||
      !["documented","estimated"].includes(p.confidence)) return fail("missing_provider_evidence");
  const shape=answer.geometry;
  if (!shape || shape.type!=="LineString" || !Array.isArray(shape.coordinates) ||
      shape.coordinates.length<2 || shape.coordinates.length>4096) return fail("invalid_route_geometry");
  // GeoJSON coordinates are [longitude, latitude], not [latitude, longitude].
  const coordinates=[];
  for(const node of shape.coordinates) {
    if (!Array.isArray(node) || node.length!==2 ||
        !Number.isFinite(node[0]) || !Number.isFinite(node[1]) ||
        !isRealCoordinate(node[1],node[0])) return fail("invalid_route_coordinates");
    coordinates.push({lat:node[1],lng:node[0]});
  }
  if (metersBetween(coordinates[0],request.origin.coordinate)>100 ||
      metersBetween(coordinates[coordinates.length-1],request.destination.coordinate)>100)
    return fail("route_not_connected_to_places");
  const direct=metersBetween(request.origin.coordinate,request.destination.coordinate);
  const length=answer.distanceMeters;
  if (!Number.isFinite(length) || length<0 || length>200000 ||
      length<direct*0.95) return fail("invalid_reported_distance");
  return {
    ok:true,
    status:"geometry_ready_for_review",
    canDrawPreview:true,
    canMoveAgent:false,
    routePreview:{
      positionDomain:SPATIAL_DOMAINS.modern,
      purpose:"facility_to_facility_preview",
      geometry:copied(shape),
      distanceMeters:length,
      provenance:copied(p),
      claims:["modern_provider_geometry_only","not_a_character_location","not_a_medieval_route"],
    },
  };
}
// Current core reports fictional x/y. Even valid real POI endpoints must never
// be promoted to a human/character's current location. A later, separately
// reviewed geolocation adapter is needed before agent movement can be drawn.
export function assessAgentRealMapPlacement(world,agentId) {
  const p=getAgentPlacement(world,agentId);
  if (!p) return {canDraw:false,reason:"unknown_agent"};
  if (p.positionDomain===SPATIAL_DOMAINS.abstract)
    return {canDraw:false,reason:"abstract_agent_position"};
  return {canDraw:false,reason:"real_agent_mapping_not_approved"};
}
export function historicalLayerReviewGate(providerResponse) {
  const request=createHistoricalGeoRequest();
  const review=validateHistoricalGeoResponse(providerResponse);
  return {
    request,
    review,
    canDrawModernRoad:false,
    canMoveAgent:false,
    historicContextYear:1185,
  };
}
