// SIM-04: opt-in, JSON-serializable observations. Never writes to the world,
// consumes RNG, fetches routes, or turns facility coordinates into agent GPS.
import { getAgentPlacement } from "./movement-observation.mjs";
import { createHistoricalGeoRequest } from "./geography-bridge.mjs";
import { makeModernRouteRequest, reviewModernRoute } from "./map/route-contract.mjs";

export const MOVEMENT_STATE_VERSION = "agent-movement/1";
const copy = value => structuredClone(value);
const same = (a, b) => {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length &&
    keys.every(key => Object.hasOwn(b, key) && same(a[key], b[key]));
};

// previous is the last observation of THIS world timeline, optionally restored
// with its save. Missing/incompatible history means unknown transitions, not
// invented selection/departure events. Intermediate same-tick steps are hidden.
export function getAgentMovementState(world, agentId, { previous = null } = {}) {
  const placement = getAgentPlacement(world, agentId);
  if (!placement) return null;
  const agent = world.agents.find(a => a.id === agentId);
  const validPrevious = previous?.schemaVersion === MOVEMENT_STATE_VERSION &&
    previous.agentId === agentId && previous.seed === world.seed &&
    Number.isInteger(previous.tick) && previous.tick <= world.tick &&
    previous.placement?.positionDomain === "abstract" &&
    Number.isInteger(previous.arrivals) && previous.decision != null;
  const decision = {
    reason: agent.lastDecision ?? null,
    // Core's rounding may produce -0. Normalize it as the existing JSON save
    // does, so observing a restored world yields the same decision payload.
    candidates: JSON.parse(JSON.stringify(agent.lastScores ?? [])),
    // Current core chooses when no target, or at tick % 10 === 1 after advice.
    nextEvaluation: agent.target == null ? "next_tick" : "periodic_or_intervention",
  };
  const events = [];
  if (validPrevious && placement.movementStatus !== "blocked") {
    const before = previous.placement;
    const selected = placement.destinationId != null &&
      placement.destinationId !== before.destinationId;
    if (selected) events.push("destination_selected");
    if (!same(decision.reason, previous.decision.reason) ||
        !same(decision.candidates, previous.decision.candidates)) events.push("reconsidered");
    const displaced = before.position && placement.position &&
      (before.position.x !== placement.position.x || before.position.y !== placement.position.y);
    if (displaced) events.push(before.movementStatus !== "moving" || selected
      ? "movement_started" : "movement_advanced");
    if (agent.arrivals > previous.arrivals) events.push("arrival_observed");
    if (before.destinationId != null && placement.destinationId == null &&
        agent.arrivals === previous.arrivals) events.push("destination_cleared");
  }
  return {
    schemaVersion: MOVEMENT_STATE_VERSION,
    seed: world.seed, tick: world.tick, agentId, arrivals: agent.arrivals,
    movementStatus: placement.movementStatus,
    placement, decision,
    transition: {
      basis: validPrevious ? "snapshot_difference" : "unavailable",
      fromTick: validPrevious ? previous.tick : null,
      events,
      // Even adjacent ticks can hide selection + departure + arrival.
      completeEventHistory: false,
    },
    spatial: {
      agent: { positionDomain: "abstract", purpose: "simulation", realGeo: null },
      destination: placement.destinationModernLocation == null ? null : {
        positionDomain: "modern_wgs84", purpose: "facility_reference_only",
        validation: "unreviewed_reference",
        location: copy(placement.destinationModernLocation),
        provenance: copy(placement.provenance.destination),
      },
      historical: {
        positionDomain: "historical_geo", purpose: "historical_context_only",
        status: "unresolved", request: createHistoricalGeoRequest(),
        geometry: null, route: null, usableForMovement: false,
      },
    },
    capabilities: { canPlaceAgentOnRealMap: false, canFollowModernRoute: false },
  };
}

// attempt: {request: modern-route/1, status: "pending" | "settled", result?}.
// result is MAP-03B createRouteClient.fetchRoute's value, not a new provider API.
// Facility previews are reusable across ticks, never a character journey.
export function getAgentRouteState(world, agentId, attempt = null) {
  const placement = getAgentPlacement(world, agentId);
  if (!placement) return null;
  const finish = (status, reason, routePreview = null) => ({
    schemaVersion: MOVEMENT_STATE_VERSION, agentId, tick: world.tick,
    positionDomain: "modern_wgs84", purpose: "facility_to_facility_preview",
    status, reason, routePreview,
    canDrawPreview: routePreview !== null, canMoveAgent: false,
    simulationEffect: "none", retryPolicy: "caller_controlled_no_automatic_retry",
  });
  if (placement.movementStatus === "blocked") return finish("unavailable", placement.blockedReason);
  if (!attempt) return finish("not_requested", "no_route_attempt");
  const request = attempt.request;
  // IDs alone are insufficient: remove/reinstall can reuse modern-1, etc.
  const origin = world.modernPois?.find(p => p.id === request?.origin?.placeId);
  const destination = world.modernPois?.find(p => p.id === placement.destinationId);
  const current = makeModernRouteRequest(origin, destination);
  if (!current.ok) return finish("unavailable", current.reason);
  if (!same(current.request, request)) return finish("stale", "request_no_longer_matches_facilities");
  if (attempt.status === "pending") return finish("pending", null);
  if (attempt.status !== "settled") return finish("failed", "invalid_attempt_status");
  const result = attempt.result;
  if (result?.ok === false) {
    const known = ["provider_unavailable", "no_route", "provider_error", "timeout",
      "network_error", "rate_limited", "aborted"];
    return finish("failed", known.includes(result.reason) ? result.reason : "route_rejected");
  }
  // Recheck geometry/evidence via the existing MAP-03 contract; a success flag
  // or canMoveAgent from an external object is never sufficient authority.
  const preview = result?.routePreview;
  const reviewed = reviewModernRoute(request, result?.ok === true && preview &&
    preview.positionDomain === "modern_wgs84" && preview.purpose === "facility_to_facility_preview" ? {
      schemaVersion: request.schemaVersion, positionDomain: preview.positionDomain,
      travelMode: request.travelMode, yearContext: request.yearContext,
      originId: request.origin.placeId, destinationId: request.destination.placeId,
      geometry: preview.geometry, distanceMeters: preview.distanceMeters,
      provenance: preview.provenance,
    } : null);
  return reviewed.ok ? finish("ready", null, reviewed.routePreview) : finish("failed", reviewed.reason);
}
