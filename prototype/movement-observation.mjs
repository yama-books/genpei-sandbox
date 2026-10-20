// Opt-in read model for SIM-01 / MAP-01 integration proposals.
// No UI wiring, state writes, RNG consumption, or inferred geographical positions.
import { STATIONS } from "./core.mjs";

export const MOVEMENT_OBSERVATION_VERSION = "movement-observation/1";

export function getAgentPlacement(world, agentId) {
  const agent = world.agents.find(a => a.id === agentId);
  if (!agent) return null;
  const stations = [...STATIONS, ...(world.modernPois ?? [])];
  const destination = stations.find(p => p.id === agent.target);
  const current = stations.find(p => p.id === agent.currentStationId);
  const validPosition = Number.isFinite(agent.x) && Number.isFinite(agent.y);
  // A stale station ID is observable as blocked, rather than silently routed
  // to core's fallback station. This adapter never repairs simulation state.
  const blocked = !validPosition || (agent.target != null && !destination) ||
    (agent.target == null && agent.currentStationId != null && !current);
  const status = blocked ? "blocked" : destination ? "moving" : current ? "arrived" : "idle";
  return {
    schemaVersion: MOVEMENT_OBSERVATION_VERSION,
    tick: world.tick,
    agentId: agent.id,
    positionDomain: "abstract",
    position: validPosition ? { x: agent.x, y: agent.y, unit: "stage_units" } : null,
    realGeo: null,
    destinationId: agent.target ?? null,
    currentStationId: agent.currentStationId ?? null,
    movementStatus: status,
    blockedReason: !validPosition ? "invalid_abstract_position" : blocked ? "unknown_station" : null,
    routing: "abstract_straight_line_only",
    route: null,
    destinationModernLocation: destination?.modernLocation
      ? structuredClone(destination.modernLocation) : null,
    provenance: {
      kind: "simulation",
      source: "core.mjs; movement-observation/1",
      position: "fictional_simulation",
      movement: "abstract_straight_line_only",
      destination: destination?.provenance ? structuredClone(destination.provenance) : null,
    },
  };
}
