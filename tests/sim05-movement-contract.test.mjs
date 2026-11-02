import test from "node:test";
import assert from "node:assert/strict";
import { createWorld, stepWorld, snapshot, installModernPois, logEvent } from "../prototype/core.mjs";
import { getAgentMovementState, getAgentRouteState } from "../prototype/movement-state.mjs";
import { makeModernRouteRequest, reviewModernRoute, historicalLayerReviewGate } from "../prototype/map/route-contract.mjs";
import { SIM_POIS } from "./fixtures/sim-pois.mjs";

const id = "C036";
const observe = (world, previous = null) => getAgentMovementState(world, id, { previous });
const personLogs = (world, afterTick) => world.events.filter(e => e.personId === id && e.tick > afterTick);
function fixture(seed = 1185, distanceMeters = 400) {
  const world = createWorld(seed);
  installModernPois(world, SIM_POIS);
  // Origin is a caller's selection, deliberately unrelated to agent position.
  const [origin, destination] = world.modernPois;
  world.agents[0].target = destination.id;
  const { request } = makeModernRouteRequest(origin, destination);
  const result = reviewModernRoute(request, {
    schemaVersion: "modern-route/1", positionDomain: "modern_wgs84",
    travelMode: "walking", yearContext: "present_day",
    originId: origin.id, destinationId: destination.id,
    geometry: { type: "LineString", coordinates: [origin, destination].map(p =>
      [p.modernLocation.lng, p.modernLocation.lat]) },
    distanceMeters,
    provenance: { providerId: "synthetic", sourceId: "sim05_fixture", attribution: "Synthetic; not a road",
      license: "CC0-1.0", retrievedAt: "2026-10-21T00:00:00Z", confidence: "estimated" },
  });
  assert.equal(result.ok, true);
  return { world, request, result, status: "settled" };
}

test("SIM-05 same-tick selection and arrival logs cannot be reconstructed from two snapshots", () => {
  const world = createWorld(), a = world.agents[0];
  Object.assign(a, { target: null, x: 744, y: 300, curiosity: 0 });
  world.rng = 123456789;
  const previous = observe(world);
  stepWorld(world, 100);
  const state = observe(world, previous), logs = personLogs(world, 0);
  assert.ok(logs.some(e => e.kind === "decision"));
  assert.ok(logs.some(e => e.kind === "fate"));
  assert.equal(state.arrivals - previous.arrivals, 1);
  assert.equal(state.movementStatus, "arrived");
  assert.ok(state.transition.events.includes("arrival_observed"));
  // Target is null at both observation points; no fictional intermediate state.
  assert.equal(state.transition.events.includes("destination_selected"), false);
  assert.equal(state.transition.events.includes("movement_started"), false);
  assert.equal(state.transition.completeEventHistory, false);
});

test("SIM-05 movement advances without a corresponding per-tick core movement log", () => {
  const world = createWorld();
  world.agents[0].adviceUntil = 100;
  stepWorld(world);
  const previous = observe(world);
  stepWorld(world);
  const state = observe(world, previous);
  assert.deepEqual(state.transition.events, ["movement_advanced"]);
  assert.deepEqual(personLogs(world, previous.tick), []);
});

test("SIM-05 arrival counter and warning log agree even when facility use fails", () => {
  const { world } = fixture(), a = world.agents[0], destination = world.modernPois[1];
  Object.assign(a, { x: destination.x, y: destination.y, money: 0, adviceUntil: 100 });
  const previous = observe(world);
  stepWorld(world);
  const state = observe(world, previous), logs = personLogs(world, previous.tick);
  assert.equal(state.arrivals - previous.arrivals, 1);
  assert.ok(state.transition.events.includes("arrival_observed"));
  assert.ok(logs.some(e => e.kind === "warning"));
  assert.equal(logs.some(e => e.kind === "facility"), false);
  assert.equal(state.placement.currentStationId, destination.id);
  assert.equal(state.placement.realGeo, null);
  assert.equal(state.spatial.destination, null);
});

test("SIM-05 sparse observations collapse arrivals and bounded logs cannot recover them", () => {
  const world = createWorld(), a = world.agents[0], previous = observe(world);
  for (const station of [{ id: "supply", x: 388, y: 458 }, { id: "rest", x: 520, y: 175 }]) {
    Object.assign(a, { target: station.id, x: station.x, y: station.y, adviceUntil: 100 });
    stepWorld(world);
  }
  assert.equal(a.arrivals - previous.arrivals, 2);
  assert.equal(personLogs(world, previous.tick).filter(e => e.kind === "facility").length, 2);
  for (let n = 0; n < 141; n++) logEvent(world, "system", "SIM-05 synthetic retention probe");
  assert.equal(world.events.length, 140);
  assert.deepEqual(personLogs(world, previous.tick), []);
  const state = observe(world, previous);
  assert.equal(state.transition.events.filter(e => e === "arrival_observed").length, 1);
  assert.equal(state.transition.completeEventHistory, false);
});

test("SIM-05 ready preview does not bind origin or last station to an agent location", () => {
  const f = fixture(), { world } = f, a = world.agents[0];
  a.currentStationId = world.modernPois[2].id;
  const before = snapshot(world), state = observe(world);
  assert.notEqual(a.currentStationId, f.request.origin.placeId);
  assert.equal(getAgentRouteState(world, id, f).status, "ready");
  assert.equal(state.placement.realGeo, null);
  assert.equal(state.spatial.destination.validation, "unreviewed_reference");
  assert.equal(state.capabilities.canPlaceAgentOnRealMap, false);
  assert.deepEqual(world, before);
  const end = world.modernPois[1];
  Object.assign(a, { x: end.x, y: end.y, adviceUntil: 100 });
  stepWorld(world);
  assert.equal(observe(world).movementStatus, "arrived");
  assert.equal(getAgentRouteState(world, id, f).status, "unavailable");
  assert.equal(observe(world).placement.realGeo, null);
});

test("SIM-05 distance, pending and seven route failures preserve seeded core logs and save continuation", () => {
  const failures = ["provider_unavailable", "network_error", "timeout", "no_route", "rate_limited", "provider_error", "aborted"];
  for (let seed = 1; seed <= 8; seed++) {
    const short = fixture(seed, 400), long = fixture(seed, 40000);
    const attempts = [short, long, { ...short, status: "pending" },
      ...failures.map(reason => ({ ...short, result: { ok: false, reason } }))];
    for (const attempt of attempts) {
      const world = snapshot(short.world), control = snapshot(short.world);
      let previous = null;
      for (let tick = 0; tick < 80; tick++) {
        const before = structuredClone(world), route = getAgentRouteState(world, id, attempt);
        const state = observe(world, previous);
        assert.deepEqual(world, before);
        assert.equal(route.canMoveAgent, false);
        assert.equal(route.simulationEffect, "none");
        if (tick === 0) {
          assert.equal(route.status, attempt.status === "pending" ? "pending" : attempt.result.ok ? "ready" : "failed");
          if (route.status === "ready") assert.equal(route.routePreview.distanceMeters, attempt.result.routePreview.distanceMeters);
        }
        const restored = snapshot(world), restoredPrevious = JSON.parse(JSON.stringify(previous));
        assert.deepEqual(observe(restored, restoredPrevious), state);
        previous = state;
        stepWorld(world); stepWorld(control); stepWorld(restored);
        // Includes RNG, arrivals, decisions, resources, fate and full retained logs.
        assert.deepEqual(snapshot(world), snapshot(control));
        assert.deepEqual(snapshot(world), snapshot(restored));
      }
    }
  }
});

test("SIM-05 history belongs to caller timeline; same-seed forks require dropping previous", () => {
  const world = createWorld(), previous = observe(world), fork = snapshot(world);
  fork.rng = 123456789;
  Object.assign(fork.agents[0], { target: "rest", adviceUntil: 100 });
  stepWorld(fork);
  // Existing seed/agent/tick checks cannot prove branch identity.
  assert.equal(observe(fork, previous).transition.basis, "snapshot_difference");
  assert.ok(observe(fork, previous).transition.events.includes("destination_selected"));
  assert.equal(observe(fork).transition.basis, "unavailable");
  assert.deepEqual(observe(fork).transition.events, []);
  const future = observe(fork);
  assert.equal(observe(world, future).transition.basis, "unavailable");
});

test("SIM-05 historical format acceptance and modern timestamps never unlock 1185 movement", () => {
  const f = fixture(), before = snapshot(f.world);
  const historical = historicalLayerReviewGate({ asOfYear: 1185, location: { siteId: "YS001" },
    confidence: "estimated", provenance: { sourceId: "synthetic_no_authoritative_geometry" } });
  assert.equal(historical.review.ok, true);
  assert.equal(historical.canMoveAgent, false);
  assert.equal(historical.request.feature.externalProvinceId, null);
  const movement = observe(f.world);
  assert.equal(movement.spatial.historical.status, "unresolved");
  assert.equal(movement.spatial.historical.geometry, null);
  assert.equal(movement.spatial.historical.route, null);
  // Format validation accepts parseable dates, not source authenticity/freshness.
  for (const retrievedAt of ["2000-01-01T00:00:00Z", "2099-01-01T00:00:00Z"]) {
    const attempt = structuredClone(f);
    attempt.result.routePreview.provenance.retrievedAt = retrievedAt;
    assert.equal(getAgentRouteState(f.world, id, attempt).status, "ready");
    assert.equal(getAgentRouteState(f.world, id, attempt).canMoveAgent, false);
  }
  const wrongEra = structuredClone(f);
  wrongEra.request.yearContext = 1185;
  assert.equal(getAgentRouteState(f.world, id, wrongEra).status, "stale");
  assert.deepEqual(f.world, before);
});
