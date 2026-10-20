// Optional modern map view (Leaflet + 地理院タイル). Loaded lazily on first use so a
// library or tile failure never blocks the schematic stage, people or POI list.
import { TILE_SOURCE, TILE_ATTRIBUTION_HTML, POI_ATTRIBUTION_HTML, mapModelSignature } from "./map-model.mjs";

export const LEAFLET_VERSION = "1.9.4";
const LEAFLET_BASE = new URL("../vendor/leaflet-" + LEAFLET_VERSION + "/", import.meta.url);
const LEAFLET_JS = new URL("leaflet.js", LEAFLET_BASE).href;
const LEAFLET_CSS = new URL("leaflet.css", LEAFLET_BASE).href;
const TILE_FAILURE_THRESHOLD = 3;
const POPUP_OPTIONS = Object.freeze({ maxWidth: 260, maxHeight: 190, autoPanPadding: [10, 10] });

let leafletPromise = null;
export function loadLeaflet(doc = document, timeoutMs = 12000) {
  if (globalThis.L?.map) return Promise.resolve(globalThis.L);
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve, reject) => {
    if (!doc.querySelector('link[data-leaflet]')) {
      const css = doc.createElement("link");
      css.rel = "stylesheet"; css.href = LEAFLET_CSS; css.dataset.leaflet = LEAFLET_VERSION;
      doc.head.append(css);
    }
    const script = doc.createElement("script");
    script.src = LEAFLET_JS; script.async = true; script.dataset.leaflet = LEAFLET_VERSION;
    const fail = message => { clearTimeout(timer); script.remove(); reject(new Error(message)); };
    const timer = setTimeout(() => fail("地図ライブラリの読み込みが時間切れです"), timeoutMs);
    script.onload = () => {
      if (!globalThis.L?.map) return fail("地図ライブラリを初期化できません");
      clearTimeout(timer); resolve(globalThis.L);
    };
    script.onerror = () => fail("地図ライブラリを取得できません");
    doc.head.append(script);
  });
  // A failed attempt may be retried by reopening the map.
  leafletPromise.catch(() => { leafletPromise = null; });
  return leafletPromise;
}

const POI_STYLE = Object.freeze({
  adopted: { color: "#fffdf7", fillColor: "#285a5a", fillOpacity: 0.95, weight: 3, radius: 10 },
  eligible: { color: "#285a5a", fillColor: "#e6f0ec", fillOpacity: 0.95, weight: 3, radius: 9 },
  reference: { color: "#7f8c86", fillColor: "#f4f5f1", fillOpacity: 0.9, weight: 2, radius: 7 },
});
const styleFor = status => POI_STYLE[status] ?? POI_STYLE.reference;

// Popup bodies are built from DOM text nodes: API strings never become markup.
function popupContent(doc, rows, title, tag) {
  const root = doc.createElement("div"); root.className = "map-popup";
  const head = doc.createElement("strong"); head.textContent = title; root.append(head);
  if (tag) { const t = doc.createElement("span"); t.className = "map-popup-tag"; t.textContent = tag; root.append(t); }
  for (const [label, value] of rows) {
    if (!value) continue;
    const p = doc.createElement("p");
    const k = doc.createElement("span"); k.className = "map-popup-key"; k.textContent = label;
    p.append(k, doc.createTextNode(value)); root.append(p);
  }
  return root;
}

export function createModernMap({ container, onStatus = () => {}, onPoiSelect = () => {}, doc = document, loader = loadLeaflet }) {
  let L = null, map = null, poiLayer = null, heritageLayer = null;
  let model = null, signature = "", tileErrors = 0, tileLoads = 0, tilesFailed = false, opening = null;
  const markers = new Map();

  function draw() {
    if (!map || !model) return;
    const next = mapModelSignature(model);
    if (next === signature) return;
    signature = next;
    poiLayer.clearLayers(); heritageLayer.clearLayers(); markers.clear();
    for (const h of model.heritage) {
      const m = L.circleMarker([h.lat, h.lng], { color: "#fff8ea", fillColor: "#b99b63", fillOpacity: 0.95, weight: 3, radius: 9, className: "map-heritage" });
      m.bindPopup(popupContent(doc, [["位置", h.precisionLabel], ["区分", h.designation], ["座標出典", h.source]], h.name, "史跡"), POPUP_OPTIONS);
      m.bindTooltip(h.name);
      heritageLayer.addLayer(m);
    }
    for (const p of model.pois) {
      const related = (model.observations ?? []).filter(a => a.facilityKey === p.key);
      const highlighted = model.selectedPoiKey === p.key || related.some(a => a.agentId === model.selectedAgentId);
      const m = L.circleMarker([p.lat, p.lng], { ...styleFor(p.status),
        ...(highlighted ? { color: "#b44923", weight: 5, radius: 13 } : {}),
        className: "map-poi map-poi--" + p.status + (highlighted ? " map-poi--observed" : "") });
      m.bindPopup(popupContent(doc, [
        ["分類", p.actionLabel + "（元分類：" + p.category + "）"],
        ["住所", p.address || "住所情報なし"],
        ["距離", Number.isFinite(p.distanceMeters) ? "検索中心から約" + p.distanceMeters + "m（直線）" : ""],
        ["出典", p.source],
        ["ライセンス", p.licenses.join(", ")],
        ["帰属", p.attributions.join("; ")],
        ["人物の行動", related.map(a => a.name + "：" + a.statusLabel).join(" ／ ")],
        ["位置の意味", "施設の所在地です。人物の現在地ではありません"],
        ["注意", "存在・営業・立入可否は未確認"],
      ], p.name, p.statusLabel), POPUP_OPTIONS);
      m.bindTooltip(p.name);
      m.on("click", () => { onPoiSelect(p.key); markers.get(p.key)?.openPopup(); });
      poiLayer.addLayer(m);
      markers.set(p.key, m);
    }
  }

  function reportTiles() {
    if (!tilesFailed && tileErrors >= TILE_FAILURE_THRESHOLD && tileLoads === 0) {
      tilesFailed = true;
      container.classList.add("tiles-failed");
      onStatus("warning", "背景地図を取得できません。施設の位置と出典は表示を続けます。");
    }
  }

  async function open() {
    if (map) { map.invalidateSize(); return true; }
    if (opening) return opening;
    onStatus("info", "地図を準備中…");
    opening = (async () => {
      try {
        L = await loader(doc);
        map = L.map(container, {
          center: [model?.center.lat ?? 34.3566, model?.center.lng ?? 134.1012],
          zoom: 14, minZoom: TILE_SOURCE.minZoom, maxZoom: TILE_SOURCE.maxZoom,
          attributionControl: false, tap: true,
        });
        L.control.attribution({ prefix: '<a href="https://leafletjs.com" target="_blank" rel="noopener noreferrer">Leaflet</a>' })
          .addAttribution(TILE_ATTRIBUTION_HTML).addAttribution(POI_ATTRIBUTION_HTML).addTo(map);
        L.control.scale({ imperial: false }).addTo(map);
        const tiles = L.tileLayer(TILE_SOURCE.url, { minZoom: TILE_SOURCE.minZoom, maxZoom: TILE_SOURCE.maxZoom, crossOrigin: false });
        tiles.on("tileerror", () => { tileErrors++; reportTiles(); });
        tiles.on("tileload", () => { tileLoads++; });
        tiles.addTo(map);
        if (model) {
          L.circle([model.center.lat, model.center.lng], {
            radius: model.searchRadiusMeters, color: "#3f6f8a", weight: 2, opacity: 0.85, dashArray: "6 6", fill: false, interactive: false, className: "map-radius",
          }).addTo(map);
        }
        heritageLayer = L.layerGroup().addTo(map);
        poiLayer = L.layerGroup().addTo(map);
        draw();
        onStatus("ready", "");
        return true;
      } catch (error) {
        map = null;
        onStatus("error", error.message + "。模式図と施設一覧は引き続き使えます。");
        return false;
      } finally {
        opening = null;
      }
    })();
    return opening;
  }

  return {
    open,
    update(nextModel) { model = nextModel; draw(); },
    focus(key) {
      const m = markers.get(key);
      if (!map || !m) return false;
      // Jump without animation so the popup auto-pan can fit it inside the small map.
      map.setView(m.getLatLng(), Math.max(map.getZoom(), 16), { animate: false });
      m.openPopup();
      return true;
    },
    invalidate() { map?.invalidateSize(); },
    get ready() { return Boolean(map); },
    get tilesFailed() { return tilesFailed; },
  };
}
