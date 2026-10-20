// MAP-03B: modern facility-to-facility route providers.
// Providers only ever receive two sourced *facility* coordinates built by
// route-contract.mjs. Character positions, abstract x/y and historical points
// are never sent, and a failed or rejected reply never becomes a drawn line.
import { reviewModernRoute, ROUTE_CONTRACT_VERSION, SPATIAL_DOMAINS } from "./route-contract.mjs";

export const ROUTE_PROVIDER_VERSION = "0.1";
const OSM_COPYRIGHT = "https://www.openstreetmap.org/copyright";

// The public site defaults to "none": no third-party routing dependency is
// adopted without the integration lead's decision. Others are opt-in via URL.
export const ROUTE_PROVIDERS = Object.freeze({
  none: Object.freeze({
    id: "none", label: "未設定", available: false,
    note: "経路プロバイダーは未設定です（公開版の既定）。道路経路は取得・表示しません。",
  }),
  "fossgis-osrm-foot": Object.freeze({
    id: "fossgis-osrm-foot", label: "FOSSGIS OSRM 徒歩（評価用）", available: true, evaluationOnly: true,
    endpoint: "https://routing.openstreetmap.de/routed-foot/route/v1/driving/",
    termsUrl: "https://routing.openstreetmap.de/about.html",
    minIntervalMs: 1100, // published limit: at most one request per second
    sourceId: "openstreetmap", license: "ODbL-1.0",
    attribution: "経路：FOSSGIS OSRM（routing.openstreetmap.de）／データ © OpenStreetMap contributors",
    attributionHtml: '経路：<a href="https://routing.openstreetmap.de/about.html" target="_blank" rel="noopener noreferrer">FOSSGIS OSRM</a>・© <a href="' + OSM_COPYRIGHT + '" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>',
    note: "評価用の共用サーバーです（無保証・1秒1回まで・大量利用禁止）。本番の必須依存ではありません。",
  }),
  "local-osrm-foot": Object.freeze({
    id: "local-osrm-foot", label: "ローカルOSRM 徒歩（開発用）", available: true, evaluationOnly: true,
    endpoint: null, // supplied by routeEndpoint, loopback hosts only
    termsUrl: OSM_COPYRIGHT,
    minIntervalMs: 0,
    sourceId: "openstreetmap", license: "ODbL-1.0",
    attribution: "経路：ローカルOSRM／データ © OpenStreetMap contributors",
    attributionHtml: '経路：ローカルOSRM・© <a href="' + OSM_COPYRIGHT + '" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>',
    note: "開発者が自分で起動したOSRMを使います。公開版では使えません。",
  }),
});

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);
export function isLoopbackEndpoint(value) {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && LOOPBACK.has(url.hostname)
      && !url.username && !url.password && !url.search && !url.hash;
  } catch { return false; }
}

// ?route=fossgis enables the evaluation server; ?route=local&routeEndpoint=http://127.0.0.1:5000/route/v1/foot/
// a self-hosted OSRM. Anything else resolves to "none".
export function resolveRouteProvider(search = "") {
  const params = new URLSearchParams(search);
  const choice = params.get("route");
  if (choice === "fossgis") return { ...ROUTE_PROVIDERS["fossgis-osrm-foot"] };
  if (choice === "local") {
    let endpoint = params.get("routeEndpoint") || "";
    if (endpoint && !endpoint.endsWith("/")) endpoint += "/";
    if (isLoopbackEndpoint(endpoint)) return { ...ROUTE_PROVIDERS["local-osrm-foot"], endpoint };
    return { ...ROUTE_PROVIDERS.none, note: "ローカル経路サーバーのURLが不正です（localhost / 127.0.0.1 のみ）。道路経路は表示しません。" };
  }
  return { ...ROUTE_PROVIDERS.none };
}

const fmt = n => Number(n.toFixed(6));
export function buildOsrmRouteUrl(provider, request) {
  if (!provider?.available || !provider.endpoint) throw new Error("route_provider_unavailable");
  const a = request.origin.coordinate, b = request.destination.coordinate;
  // OSRM expects longitude,latitude pairs.
  const url = new URL(provider.endpoint + fmt(a.lng) + "," + fmt(a.lat) + ";" + fmt(b.lng) + "," + fmt(b.lat));
  url.searchParams.set("overview", "full");
  url.searchParams.set("geometries", "geojson");
  url.searchParams.set("steps", "false");
  url.searchParams.set("alternatives", "false");
  return url.toString();
}

// Adapter from an OSRM reply to the modern-route/1 answer reviewed by route-contract.
export function osrmToContractAnswer(provider, request, json, retrievedAt) {
  if (!json || typeof json !== "object") return { ok: false, reason: "no_provider_response" };
  if (json.code === "NoRoute") return { ok: false, reason: "no_route" };
  if (json.code !== "Ok" || !Array.isArray(json.routes) || !json.routes[0]) return { ok: false, reason: "provider_error" };
  const route = json.routes[0];
  return {
    ok: true,
    answer: {
      schemaVersion: ROUTE_CONTRACT_VERSION,
      positionDomain: SPATIAL_DOMAINS.modern,
      travelMode: "walking",
      yearContext: "present_day",
      originId: request.origin.placeId,
      destinationId: request.destination.placeId,
      provenance: {
        providerId: provider.id, sourceId: provider.sourceId, attribution: provider.attribution,
        license: provider.license, retrievedAt, confidence: "estimated",
      },
      geometry: route.geometry,
      distanceMeters: route.distance,
    },
  };
}

const routeCacheKey = request => [request.origin, request.destination]
  .map(e => e.name + "|" + e.coordinate.lat.toFixed(5) + "|" + e.coordinate.lng.toFixed(5)).join(">");

// One client per provider. It serializes requests, honours the provider's
// minimum interval, caches successful reviews in memory only, and times out.
export function createRouteClient({ provider, fetchFn = (...args) => fetch(...args), now = () => Date.now(),
  sleep = ms => new Promise(r => setTimeout(r, ms)), timeoutMs = 12000 } = {}) {
  const cache = new Map();
  let lastStart = -Infinity, queue = Promise.resolve();
  async function run(request) {
    if (!provider?.available) return { ok: false, reason: "provider_unavailable", canDrawPreview: false, canMoveAgent: false };
    const key = routeCacheKey(request);
    if (cache.has(key)) return { ...cache.get(key), cached: true };
    const wait = lastStart + (provider.minIntervalMs || 0) - now();
    if (wait > 0) await sleep(wait);
    lastStart = now();
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    let json;
    try {
      const res = await fetchFn(buildOsrmRouteUrl(provider, request), {
        headers: { Accept: "application/json" }, signal: controller?.signal, credentials: "omit", referrerPolicy: "strict-origin",
      });
      // OSRM answers NoRoute with HTTP 400 and a JSON body; other failures are provider errors.
      json = await res.json().catch(() => null);
      if (!res.ok && json?.code !== "NoRoute") return fail(res.status === 429 ? "rate_limited" : "provider_error");
    } catch (error) {
      return fail(error?.name === "AbortError" ? "timeout" : "network_error");
    } finally {
      if (timer) clearTimeout(timer);
    }
    const adapted = osrmToContractAnswer(provider, request, json, new Date(now()).toISOString());
    if (!adapted.ok) return fail(adapted.reason);
    const reviewed = reviewModernRoute(request, adapted.answer);
    if (reviewed.ok) cache.set(key, reviewed);
    return reviewed;
  }
  const fail = reason => ({ ok: false, reason, canDrawPreview: false, canMoveAgent: false });
  return {
    provider,
    fetchRoute(request) {
      const result = queue.then(() => run(request));
      queue = result.catch(() => {});
      return result;
    },
    get cacheSize() { return cache.size; },
  };
}

export const ROUTE_FAILURE_LABELS = Object.freeze({
  provider_unavailable: "経路プロバイダーが未設定です",
  missing_verified_modern_place: "出典・座標を確認できる施設を2つ選んでください",
  same_place: "出発と到着に同じ施設が選ばれています",
  no_route: "提供元が徒歩経路を見つけられませんでした",
  provider_error: "提供元がエラーを返しました",
  rate_limited: "提供元の利用制限に達しました。しばらく待ってください",
  timeout: "提供元の応答が時間切れになりました",
  network_error: "提供元に接続できません（通信・CORS・障害）",
  no_provider_response: "提供元から応答がありません",
  wrong_domain_or_version: "応答の形式・版が契約と一致しません",
  mismatched_endpoints: "応答の始点・終点が照会と一致しません",
  missing_provider_evidence: "応答に出典・ライセンス・取得時刻が揃っていません",
  invalid_route_geometry: "応答の経路形状が不正です",
  invalid_route_coordinates: "応答の座標が不正です",
  route_not_connected_to_places: "経路の端が施設から100m以上離れています（道路に接続しない施設の可能性）",
  invalid_reported_distance: "応答の距離が直線距離と整合しません",
  invalid_request: "照会の形式が不正です",
});
export const routeFailureLabel = reason => ROUTE_FAILURE_LABELS[reason] ?? "経路を表示できません（" + reason + "）";
