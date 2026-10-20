// Read-only UI adapter. A facility relation never implies a person's real location.
import { STATIONS, destinationScores } from "../core.mjs";
import { getAgentPlacement } from "../movement-observation.mjs";
import { isRealCoordinate, poiKey } from "./map-model.mjs";

export const MOVEMENT_LABELS = Object.freeze({
  moving: "移動中（模式空間）", arrived: "到着（模式空間）",
  idle: "待機・再検討中", blocked: "参照・位置データを確認",
});

export function buildAgentObservations(world, gravity = 65) {
  const stations = [...STATIONS, ...(world.modernPois ?? [])];
  return world.agents.map(agent => {
    const placement = getAgentPlacement(world, agent.id);
    const stationId = placement.destinationId ?? placement.currentStationId;
    const station = stations.find(p => p.id === stationId);
    const loc = station?.modernLocation;
    const facilityKey = placement.movementStatus !== "blocked" &&
      isRealCoordinate(loc?.lat, loc?.lng) ? poiKey(station.label, loc.lat, loc.lng) : null;
    const scores = destinationScores(agent, gravity, world);
    return {
      agentId: agent.id, name: agent.name ?? agent.short, tick: placement.tick,
      movementStatus: placement.movementStatus, statusLabel: MOVEMENT_LABELS[placement.movementStatus],
      blockedReason: placement.blockedReason, facilityKey,
      stationLabel: station?.label ?? (stationId ? "参照先不明" : "未選択"),
      stationKind: station?.kind ?? null,
      lastDecision: agent.lastDecision,
      // Present evaluations are interests, not a new decision or a predicted visit.
      interests: scores.filter(s => world.modernPois?.some(p => p.id === s.id)).map(s => {
        const p = world.modernPois.find(p => p.id === s.id);
        const l = p.modernLocation;
        return { ...s, key: isRealCoordinate(l?.lat, l?.lng) ? poiKey(p.label, l.lat, l.lng) : null };
      }),
    };
  });
}
