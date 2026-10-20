// Run: node tests/sim-batch.mjs --output docs/reports/sim-01-current
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { mkdtemp, rm } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { SIM_POIS } from "./fixtures/sim-pois.mjs";
import * as engine from "../prototype/core.mjs";

export const SEEDS = Object.freeze(Array.from({ length: 128 }, (_, i) => Math.imul(i + 1, 0x9e3779b1) >>> 0));
export const POLICY = Object.freeze([
  { tick: 0, agentId: "C036", action: "advise" },
  { tick: 20, agentId: "C036", action: "mediate" },
  { tick: 45, agentId: "C036", action: "support" },
]);
const battleKinds = new Set(["upper_hand", "stalemate", "setback"]);
const hash = text => createHash("sha256").update(text).digest("hex");
const endingGroup = kind => battleKinds.has(kind) ? "battle" :
  kind === "parley" ? "parley" : ["retreat", "withdrawal"].includes(kind) ? "retreat" :
  kind === "missed" ? "not_arrived" : kind === "empty" ? "late_empty" : "unresolved";

export function applyPolicy(world, interventions, api = engine) {
  if (!interventions) return;
  for (const item of POLICY) if (item.tick === world.tick) {
    const result = api.intervene(world, item.agentId, item.action);
    if (!result.ok) throw new Error(`Policy rejected at ${world.tick}: ${result.reason}`);
  }
}

export function simulate({ seed, gravity, pois, interventions, ticks = 240 }, api = engine) {
  if (!Number.isInteger(ticks) || ticks < 112) throw new Error("ticks must be an integer >= 112");
  const world = api.createWorld(seed);
  if (pois && api.installModernPois(world, SIM_POIS).added !== SIM_POIS.length) throw new Error("POI fixture missing");
  const counts = { leisure: 0, rest: 0, supply: 0, moneyShortage: 0, unaffordableArrival: 0,
    cashLimitedAgentTicks: 0, invalidBalances: 0, invalidResources: 0, invalidPositions: 0, stalledAgents: 0, exhaustedAgents: 0 };
  const previous = new Map(world.agents.map(a => [a.id, { x: a.x, y: a.y, arrivals: a.arrivals, still: 0, exhausted: false }]));
  const trace = createHash("sha256");
  let checkpoint;
  const midpoint = Math.min(30, Math.floor(ticks / 2));
  for (let i = 0; i < ticks; i++) {
    if (i === midpoint) checkpoint = api.snapshot(world);
    applyPolicy(world, interventions, api);
    api.stepWorld(world, gravity);
    const events = world.events.filter(e => e.tick === world.tick);
    counts.moneyShortage += events.filter(e => e.kind === "warning" && /資金不足|費用不足/.test(e.text)).length;
    for (const a of world.agents) {
      const old = previous.get(a.id);
      if (a.arrivals > old.arrivals) {
        const id = a.currentStationId;
        const action = world.modernPois.find(p => p.id === id)?.action;
        const cost = id === "supply" ? 9 : id === "rest" ? 6 : id === "leisure" ? 5 :
          ({ meal: 7, supplies: 9, rest: 6, visit: 0 }[action] ?? 0);
        // money is post-arrival: warnings identify failed payments without inferring success.
        const failed = events.some(e => e.personId === a.id && e.kind === "warning");
        if (failed && cost > 0) counts.unaffordableArrival++;
        if (!failed) {
          if (id === "leisure" || action === "visit") counts.leisure++;
          if (id === "rest" || action === "rest") counts.rest++;
          if (id === "supply" || ["meal", "supplies"].includes(action)) counts.supply++;
        }
      }
      if (a.money < 9) counts.cashLimitedAgentTicks++;
      if (!Number.isFinite(a.money) || a.money < 0 || a.money > 120) counts.invalidBalances++;
      if ([a.energy, a.provisions, a.morale].some(v => !Number.isFinite(v) || v < 0 || v > 100)) counts.invalidResources++;
      if (![a.x, a.y].every(Number.isFinite) || a.x < 0 || a.x > 1000 || a.y < 0 || a.y > 640) counts.invalidPositions++;
      old.still = a.target && a.currentStationId === null && old.x === a.x && old.y === a.y ? old.still + 1 : 0;
      if (old.still === 60) counts.stalledAgents++;
      if (!old.exhausted && a.energy === 0 && a.provisions === 0) { counts.exhaustedAgents++; old.exhausted = true; }
      old.x = a.x; old.y = a.y; old.arrivals = a.arrivals;
    }
    // Digest every transition and newly emitted event, including those later evicted from the 140-event buffer.
    trace.update(JSON.stringify([world.tick, world.rng, world.agents, world.fate, events]));
  }
  const result = world.fate.resolution;
  return { world, checkpoint, counts, traceHash: trace.digest("hex"),
    worldHash: hash(JSON.stringify(world)), ending: result?.kind ?? "unresolved",
    group: endingGroup(result?.kind), arrived: world.agents[0].visitedYashima,
    arrivedInWindow: world.agents[0].arrivedAtYashimaTick !== null && world.agents[0].arrivedAtYashimaTick < 82,
    arrivedAt: world.agents[0].arrivedAtYashimaTick,
    readiness: result?.metrics.readiness ?? null,
    agentArrivals: world.agents.filter(a => a.visitedYashima).length };
}

export function verifyRun(options, api = engine) {
  const first = simulate(options, api), replay = simulate(options, api);
  const resumed = api.snapshot(first.checkpoint);
  while (resumed.tick < first.world.tick) { applyPolicy(resumed, options.interventions, api); api.stepWorld(resumed, options.gravity); }
  return { ...first, replayMatches: first.worldHash === replay.worldHash && first.traceHash === replay.traceHash,
    resumeMatches: JSON.stringify(resumed) === JSON.stringify(first.world) };
}

export async function runBatch({ seeds = SEEDS, ticks = 240, api = engine, engineRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..") } = {}) {
  const rows = [], cells = [];
  for (const gravity of [0, 50, 100]) for (const pois of [false, true]) for (const interventions of [false, true]) {
    const totals = { runs: 0, arrived: 0, arrivedInWindow: 0, agentArrivals: 0, replayMismatch: 0, resumeMismatch: 0 };
    const endings = {}, groups = {};
    for (const seed of seeds) {
      const r = verifyRun({ seed, gravity, pois, interventions, ticks }, api);
      totals.runs++; totals.arrived += Number(r.arrived); totals.arrivedInWindow += Number(r.arrivedInWindow);
      totals.agentArrivals += r.agentArrivals; totals.replayMismatch += Number(!r.replayMatches); totals.resumeMismatch += Number(!r.resumeMatches);
      for (const [k, v] of Object.entries(r.counts)) totals[k] = (totals[k] ?? 0) + v;
      endings[r.ending] = (endings[r.ending] ?? 0) + 1; groups[r.group] = (groups[r.group] ?? 0) + 1;
      rows.push({ seed, gravity, pois, interventions, ending: r.ending, arrivedAt: r.arrivedAt,
        readiness: r.readiness, ...r.counts, replayMatches: r.replayMatches, resumeMatches: r.resumeMatches,
        worldHash: r.worldHash, traceHash: r.traceHash });
    }
    cells.push({ gravity, pois, interventions, totals, endings, groups });
    console.error(`gravity=${gravity} pois=${pois} interventions=${interventions}: ${JSON.stringify(groups)}`);
  }
  const sources = {};
  for (const file of ["prototype/core.mjs", "prototype/fate.mjs", "prototype/poi-world.mjs", "tests/sim-batch.mjs", "tests/fixtures/sim-pois.mjs"]) {
    sources[file] = hash((await readFile(file.startsWith("prototype/") ? resolve(engineRoot, file) : new URL(`../${file}`, import.meta.url), "utf8")).replace(/^\uFEFF/, "").replace(/\r\n/g, "\n"));
  }
  return { schemaVersion: 1, sourceHashNormalization: "UTF-8 without BOM; LF line endings", ticks, seeds, policy: POLICY, sources, cells, rows };
}

function markdown(report) {
  return ["# SIM-01 fixed-seed batch", "", "Synthetic game statistics, not historical probabilities.", "",
    `Seeds: ${report.seeds.length}; ticks: ${report.ticks}; cells: ${report.cells.length}; replay + JSON-save resume checked for every run.`, "",
    "|Gravity|POI|Intervention|Arrived / runs|In window|Battle|Parley|Retreat|Not arrived|Late empty|Leisure|Rest|Supply|Shortage|Cash limited ticks|Exhausted agents|Stalled|Invalid|Replay / resume mismatches|",
    "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|",
    ...report.cells.map(c => { const t = c.totals, g = c.groups; return `|${c.gravity}|${c.pois}|${c.interventions}|${t.arrived}/${t.runs}|${t.arrivedInWindow}|${g.battle ?? 0}|${g.parley ?? 0}|${g.retreat ?? 0}|${g.not_arrived ?? 0}|${g.late_empty ?? 0}|${t.leisure}|${t.rest}|${t.supply}|${t.moneyShortage}|${t.cashLimitedAgentTicks}|${t.exhaustedAgents}|${t.stalledAgents}|${t.invalidBalances + t.invalidResources + t.invalidPositions}|${t.replayMismatch}/${t.resumeMismatch}|`; }),
    "", "Arrived means leader arrived by the horizon (may be after chapter expiry); in window means first arrival before tick 82.",
    "Retreat groups retreat + withdrawal; late empty is kept separate. Detailed endings, hashes and per-seed observations are in JSON/CSV.",
    "Cash limited ticks count agent-ticks with money < 9 (the supply price), not free money or income. Resource bounds count agent-tick violations.",
    "Shortage counts emitted payment failures; exhaustion counts each agent once at simultaneous zero energy/food.",
    "Stalled counts 60 consecutive ticks at identical coordinates while targeting elsewhere. Zero does not prove indefinite liveness.",
    "Leisure/rest/supply count successful facility arrivals, not durations. All ticks through the horizon are counted, including post-chapter activity.", ""].join("\n");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (![2, 4].includes(args.length) || args[0] !== "--output" ||
      (args.length === 4 && (args[2] !== "--baseline-ref" || !/^[a-f0-9]{7,40}$/.test(args[3])))) {
    throw new Error("Usage: node tests/sim-batch.mjs --output <prefix> [--baseline-ref <commit-sha>]");
  }
  let report, temporaryRoot;
  try {
    if (args[2]) {
      temporaryRoot = await mkdtemp(resolve(tmpdir(), "genpei-sim-baseline-"));
      await mkdir(resolve(temporaryRoot, "prototype"));
      for (const name of ["core", "fate", "poi-world", "openpoi"]) {
        const file = `prototype/${name}.mjs`;
        const data = execFileSync("git", ["show", `${args[3]}:${file}`], { cwd: dirname(fileURLToPath(import.meta.url)), maxBuffer: 1024 * 1024 });
        await writeFile(resolve(temporaryRoot, file), data);
      }
      const api = await import(pathToFileURL(resolve(temporaryRoot, "prototype/core.mjs")));
      report = await runBatch({ api, engineRoot: temporaryRoot });
      report.baselineRef = args[3];
    } else report = await runBatch();
  } finally {
    // mkdtemp creates this exact child of the OS temp directory; never remove a caller-supplied path.
    if (temporaryRoot && dirname(temporaryRoot) === resolve(tmpdir())) await rm(temporaryRoot, { recursive: true });
  }
  const prefix = resolve(args[1]);
  await mkdir(dirname(prefix), { recursive: true });
  const { rows, ...summary } = report;
  await writeFile(`${prefix}.json`, JSON.stringify(summary, null, 2) + "\n");
  const keys = Object.keys(rows[0]);
  await writeFile(`${prefix}.csv`, [keys.join(","), ...rows.map(row => keys.map(k => row[k] ?? "").join(","))].join("\n") + "\n");
  await writeFile(`${prefix}.md`, markdown(report));
  const failed = report.cells.some(({ totals: t, groups: g }) => t.invalidBalances || t.invalidResources || t.invalidPositions || t.replayMismatch || t.resumeMismatch || t.stalledAgents || g.unresolved);
  console.log(JSON.stringify({ runs: rows.length, ticks: report.ticks, failed, output: prefix }));
  if (failed) process.exitCode = 1;
}
