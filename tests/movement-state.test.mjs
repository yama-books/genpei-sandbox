import test from "node:test";
import assert from "node:assert/strict";
import { createWorld, stepWorld, snapshot, installModernPois, removeModernPois, intervene } from "../prototype/core.mjs";
import { getAgentPlacement } from "../prototype/movement-observation.mjs";
import { getAgentMovementState, getAgentRouteState } from "../prototype/movement-state.mjs";
import { makeModernRouteRequest, reviewModernRoute } from "../prototype/map/route-contract.mjs";
import { SIM_POIS } from "./fixtures/sim-pois.mjs";

function routeFixture() {
  const world = createWorld(1185);
  installModernPois(world, SIM_POIS);
  const [origin, destination] = world.modernPois;
  world.agents[0].target = destination.id;
  const { request } = makeModernRouteRequest(origin, destination);
  const result = reviewModernRoute(request, {
    schemaVersion: "modern-route/1", positionDomain: "modern_wgs84",
    travelMode: "walking", yearContext: "present_day",
    originId: origin.id, destinationId: destination.id,
    geometry: { type: "LineString", coordinates: [origin, destination].map(p =>
      [p.modernLocation.lng, p.modernLocation.lat]) },
    distanceMeters: 400,
    provenance: { providerId: "synthetic", sourceId: "test_fixture", attribution: "Synthetic fixture",
      license: "CC0-1.0", retrievedAt: "2026-10-21T00:00:00Z", confidence: "estimated" },
  });
  assert.equal(result.ok, true);
  return { world, request, result, status: "settled" };
}
const observe = (world, previous) => getAgentMovementState(world, "C036", { previous });

test("SIM-04 separates abstract agents, modern destination references and unresolved 1185 geography", () => {
  const { world } = routeFixture(), before = snapshot(world), state = observe(world);
  assert.deepEqual(state.placement, getAgentPlacement(world, "C036"));
  assert.equal(state.spatial.agent.realGeo, null);
  assert.equal(state.spatial.agent.positionDomain, "abstract");
  assert.equal(state.spatial.destination.positionDomain, "modern_wgs84");
  assert.equal(state.spatial.destination.purpose, "facility_reference_only");
  assert.equal(state.spatial.historical.request.asOfYear, 1185);
  assert.equal(state.spatial.historical.geometry, null);
  assert.equal(state.spatial.historical.route, null);
  assert.equal(state.spatial.historical.usableForMovement, false);
  assert.equal(state.transition.basis, "unavailable");
  assert.equal(state.transition.completeEventHistory, false);
  state.placement.position.x = 0;
  state.spatial.destination.location.lat = 0;
  state.spatial.destination.provenance.licenses.push("mutated");
  state.decision.candidates.push({ id: "mutated" });
  assert.deepEqual(world, before);
  assert.equal(observe(createWorld()).spatial.destination, null);
  assert.equal(getAgentMovementState(world, "missing"), null);
  assert.equal(getAgentRouteState(world, "missing"), null);
});

test("SIM-04 observes selection, departure, moving, arrival and next-tick reconsideration", () => {
  const world = createWorld(), a = world.agents[0];
  a.target = null; a.currentStationId = null;
  let previous = observe(world);
  assert.equal(previous.movementStatus, "idle");
  assert.equal(previous.decision.nextEvaluation, "next_tick");
  stepWorld(world, 100);
  let state = observe(world, previous);
  assert.ok(state.transition.events.includes("destination_selected"));
  assert.ok(state.transition.events.includes("movement_started"));
  assert.ok(state.transition.events.includes("reconsidered"));
  previous = state;
  stepWorld(world, 100);
  state = observe(world, previous);
  assert.ok(state.transition.events.includes("movement_advanced"));
  a.target = "yashima"; a.x = 744; a.y = 300; a.adviceUntil = 100;
  previous = observe(world);
  stepWorld(world, 100);
  state = observe(world, previous);
  assert.equal(state.movementStatus, "arrived");
  assert.ok(state.transition.events.includes("arrival_observed"));
  assert.equal(state.decision.nextEvaluation, "next_tick");
  previous = state;
  stepWorld(world, 100);
  assert.ok(observe(world, previous).transition.events.includes("destination_selected"));
});

test("SIM-04 accepted advice and POI removal are observed without changing engine state", () => {
  const { world } = routeFixture();
  world.rng = 123456789;
  const previous = observe(world);
  assert.equal(intervene(world, "C036", "advise").accepted, true);
  assert.ok(observe(world, previous).transition.events.includes("destination_selected"));
  world.agents[0].target = world.modernPois[0].id;
  const selected = observe(world);
  removeModernPois(world);
  const state = observe(world, selected);
  assert.ok(state.transition.events.includes("destination_cleared"));
  assert.equal(state.spatial.destination, null);
});

test("SIM-04 incompatible or future history cannot invent transitions; malformed positions remain blocked", () => {
  const world = createWorld(), previous = observe(world);
  for (const change of [{ seed: 2 }, { agentId: "other" }, { tick: 99 }, { schemaVersion: "unknown" }]) {
    assert.equal(observe(world, { ...previous, ...change }).transition.basis, "unavailable");
  }
  world.agents[0].target = "removed";
  assert.equal(observe(world, previous).movementStatus, "blocked");
  assert.deepEqual(observe(world, previous).transition.events, []);
  world.agents[0].x = NaN;
  assert.equal(observe(world).placement.position, null);
  assert.equal(getAgentRouteState(world, "C036").reason, "invalid_abstract_position");
});

test("SIM-04 route pending and failures are orthogonal to abstract movement and do not retry", () => {
  const fixture = routeFixture(), { world, request } = fixture, before = snapshot(world);
  assert.equal(getAgentRouteState(world, "C036").status, "not_requested");
  assert.equal(getAgentRouteState(world, "C036", { request, status: "pending" }).status, "pending");
  for (const reason of ["provider_unavailable", "network_error", "timeout", "no_route", "rate_limited", "provider_error", "aborted"]) {
    const state = getAgentRouteState(world, "C036", { request, status: "settled", result: { ok: false, reason } });
    assert.equal(state.status, "failed");
    assert.equal(state.reason, reason);
    assert.equal(state.routePreview, null);
    assert.equal(state.canMoveAgent, false);
    assert.equal(state.simulationEffect, "none");
    assert.equal(observe(world).movementStatus, "moving");
  }
  assert.deepEqual(world, before);
});

test("SIM-04 reuses MAP-03 reviewed previews without granting character movement", () => {
  const fixture = routeFixture(), { world } = fixture, before = snapshot(world);
  const state = getAgentRouteState(world, "C036", fixture);
  assert.equal(state.status, "ready");
  assert.equal(state.canDrawPreview, true);
  assert.equal(state.canMoveAgent, false);
  assert.equal(observe(world).capabilities.canPlaceAgentOnRealMap, false);
  state.routePreview.geometry.coordinates[0][0] = 0;
  assert.notEqual(fixture.result.routePreview.geometry.coordinates[0][0], 0);
  assert.deepEqual(world, before);
  const reordered = JSON.parse(JSON.stringify(fixture));
  reordered.request = Object.fromEntries(Object.entries(reordered.request).reverse());
  assert.equal(getAgentRouteState(world, "C036", reordered).status, "ready");
  fixture.result.routePreview.geometry = null;
  assert.equal(getAgentRouteState(world, "C036", fixture).reason, "invalid_route_geometry");
});

test("SIM-04 rejects stale destination, changed coordinate, recycled POI IDs and unverified replies", () => {
  const fixture = routeFixture(), { world } = fixture;
  world.agents[0].target = world.modernPois[2].id;
  assert.equal(getAgentRouteState(world, "C036", fixture).status, "stale");
  world.agents[0].target = world.modernPois[1].id;
  world.modernPois[0].modernLocation.lat += 0.001;
  assert.equal(getAgentRouteState(world, "C036", fixture).status, "stale");
  removeModernPois(world);
  installModernPois(world, SIM_POIS.map(p => ({ ...p, name: p.name + " replacement" })));
  world.agents[0].target = world.modernPois[1].id;
  assert.equal(getAgentRouteState(world, "C036", fixture).status, "stale");
  const fresh = routeFixture();
  fresh.result = { ok: true, canMoveAgent: true, canDrawPreview: true };
  assert.equal(getAgentRouteState(fresh.world, "C036", fresh).status, "failed");
  fresh.status = "wrong";
  assert.equal(getAgentRouteState(fresh.world, "C036", fresh).reason, "invalid_attempt_status");
  fresh.world.agents[0].target = "yashima";
  assert.equal(getAgentRouteState(fresh.world, "C036", fresh).status, "unavailable");
});

test("SIM-04 observations preserve seeded trajectories and JSON save/resume (32 seeds x 120 ticks)", () => {
  for (let seed = 1; seed <= 32; seed++) {
    const world = createWorld(seed), control = createWorld(seed);
    installModernPois(world, SIM_POIS); installModernPois(control, SIM_POIS);
    let previous = null;
    for (let tick = 0; tick < 120; tick++) {
      const before = structuredClone(world), state = observe(world, previous);
      const restored = snapshot(world);
      assert.deepEqual(state, observe(restored, JSON.parse(JSON.stringify(previous))));
      getAgentRouteState(world, "C036");
      assert.deepEqual(world, before);
      previous = state;
      stepWorld(world, 65); stepWorld(control, 65);
      stepWorld(restored, 65);
      assert.deepEqual(world, control);
      assert.deepEqual(snapshot(world), snapshot(restored));
    }
  }
});
