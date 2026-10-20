import test from "node:test";
import assert from "node:assert/strict";
import { createWorld, stepWorld, installModernPois, removeModernPois, snapshot, intervene } from "../prototype/core.mjs";
import { getAgentPlacement } from "../prototype/movement-observation.mjs";
import { SIM_POIS } from "./fixtures/sim-pois.mjs";

test("placement is an opt-in pure observation with no real geographical position", () => {
  const world = createWorld(1185), before = snapshot(world);
  const p = getAgentPlacement(world, "C036");
  assert.equal(p.agentId, "C036");
  assert.equal(p.destinationId, "yashima");
  assert.equal(p.movementStatus, "moving");
  assert.equal(p.positionDomain, "abstract");
  assert.equal(p.realGeo, null);
  assert.equal(p.route, null);
  assert.equal(p.routing, "abstract_straight_line_only");
  p.position.x = 0;
  assert.deepEqual(world, before);
  assert.equal(getAgentPlacement(world, "unknown"), null);
});

test("arrival, next movement, and idle remain distinct", () => {
  const world = createWorld(), a = world.agents[0];
  a.x = 744; a.y = 300; a.adviceUntil = 20;
  stepWorld(world, 100);
  const arrived = getAgentPlacement(world, a.id);
  assert.equal(arrived.movementStatus, "arrived");
  assert.equal(arrived.destinationId, null);
  assert.equal(arrived.currentStationId, "yashima");
  stepWorld(world, 100);
  assert.equal(getAgentPlacement(world, a.id).movementStatus, "moving");
  a.target = null; a.currentStationId = null;
  assert.equal(getAgentPlacement(world, a.id).movementStatus, "idle");
});

test("destination POI coordinates and provenance never become agent GPS", () => {
  const world = createWorld();
  installModernPois(world, SIM_POIS);
  world.agents[0].target = world.modernPois[0].id;
  const before = snapshot(world), p = getAgentPlacement(world, "C036");
  assert.deepEqual(p.destinationModernLocation, world.modernPois[0].modernLocation);
  assert.deepEqual(p.provenance.destination, world.modernPois[0].provenance);
  assert.equal(p.realGeo, null);
  assert.equal(p.positionDomain, "abstract");
  p.provenance.destination.licenses.push("changed");
  p.destinationModernLocation.lat = 0;
  assert.deepEqual(world, before);
});

test("POI removal clears the observed target and current station", () => {
  const world = createWorld();
  installModernPois(world, SIM_POIS);
  const a = world.agents[0];
  a.target = world.modernPois[0].id; a.currentStationId = a.target;
  removeModernPois(world);
  const p = getAgentPlacement(world, a.id);
  assert.equal(p.destinationId, null);
  assert.equal(p.currentStationId, null);
  assert.equal(p.destinationModernLocation, null);
  assert.equal(p.movementStatus, "idle");
});

test("unknown targets and invalid positions are blocked without state repair", () => {
  const world = createWorld(), a = world.agents[0];
  a.target = "removed-poi";
  assert.equal(getAgentPlacement(world, a.id).blockedReason, "unknown_station");
  a.target = null; a.currentStationId = "removed-poi";
  assert.equal(getAgentPlacement(world, a.id).movementStatus, "blocked");
  a.x = NaN;
  const p = getAgentPlacement(world, a.id);
  assert.equal(p.position, null);
  assert.equal(p.blockedReason, "invalid_abstract_position");
  assert.ok(Number.isNaN(a.x));
});

test("low energy still means moving, and accepted advice takes precedence over last arrival", () => {
  const world = createWorld(123456789), a = world.agents[0];
  a.energy = 0; a.currentStationId = "awa"; a.target = null;
  assert.equal(intervene(world, a.id, "advise").accepted, true);
  assert.equal(getAgentPlacement(world, a.id).movementStatus, "moving");
  assert.equal(getAgentPlacement(world, a.id).destinationId, "yashima");
});

test("observation matches after JSON save/resume and consumes no randomness", () => {
  const world = createWorld(98);
  installModernPois(world, SIM_POIS);
  for (let tick = 0; tick < 120; tick++) {
    const restored = snapshot(world), before = snapshot(world);
    for (const a of world.agents) assert.deepEqual(getAgentPlacement(world, a.id), getAgentPlacement(restored, a.id));
    assert.deepEqual(world, before);
    stepWorld(world, 50); stepWorld(restored, 50);
    assert.deepEqual(world, restored);
  }
});
