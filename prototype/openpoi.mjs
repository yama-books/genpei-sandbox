// OpenPOI discovery client. Read-only live sample; never bundled into repo data.
// Search center is the representative coordinate of the designated historical *area*
// "Yashima" from Nara's archaeological heritage records.
// It is NOT the historical location of the 1185 battle or of any legendary action.
export const OPENPOI_URL = "https://api.openpoiapi.com/v1/search";
export const OPENPOI_ATTRIBUTION = "https://openpoiapi.com/attribution.html";
export const YASHIMA_SAMPLE_CENTER = Object.freeze({ lng: 134.1012, lat: 34.3566 });
export const RADIUS_METERS = 1200;
export const RESULT_LIMIT = 50;

const CLASSIFICATION = Object.freeze({
  restaurant: "飲食・補給候補",
  cafe: "飲食・補給候補",
  fast_food: "飲食・補給候補",
  bakery: "飲食・補給候補",
  grocery: "物資購入候補",
  convenience_store: "物資購入候補",
  lodging: "宿泊・休息候補",
  station: "交通の結節候補",
  finance: "金融関連（資金は自動増加しない）",
  medical: "医療関連",
});

export function makePoiSampleUrl(center = YASHIMA_SAMPLE_CENTER) {
  if (!Number.isFinite(center.lng) || !Number.isFinite(center.lat)) throw new Error("不正な代表座標");
  const url = new URL(OPENPOI_URL);
  url.searchParams.set("center", center.lng + "," + center.lat); // Longitude,latitude.
  url.searchParams.set("radius", String(RADIUS_METERS));
  url.searchParams.set("limit", String(RESULT_LIMIT));
  return url.toString();
}
export function distanceMeters(a,b) {
  const rad = Math.PI/180, radLat1=a.lat*rad, radLat2=b.lat*rad;
  const dlat=(b.lat-a.lat)*rad, dlng=(b.lng-a.lng)*rad;
  const h=Math.sin(dlat/2)**2+Math.cos(radLat1)*Math.cos(radLat2)*Math.sin(dlng/2)**2;
  return 2*6371000*Math.asin(Math.min(1,Math.sqrt(h)));
}
export function classifyPoi(rawCategory) {
  const c=String(rawCategory || "unknown");
  return CLASSIFICATION[c] ?? "用途未分類（分類未確認）";
}
export function normalizePoiResults(json, center = YASHIMA_SAMPLE_CENTER) {
  if (!json || !Array.isArray(json.results)) throw new Error("OpenPOI応答の形式が異なります");
  let invalid=0, outOfRange=0;
  const records=[];
  for (const item of json.results) {
    if (typeof item?.name !== "string" || !Number.isFinite(item.lat) || !Number.isFinite(item.lng)
        || Math.abs(item.lat)>90 || Math.abs(item.lng)>180) { invalid++; continue; }
    const distance=distanceMeters({lat:item.lat,lng:item.lng},center);
    // OpenPOI may have location errors; a query result is not guaranteed to be close.
    if (distance>RADIUS_METERS+100) { outOfRange++; continue; }
    const category=typeof item.category==="string"?item.category:"unknown";
    records.push({
      name:item.name, address:typeof item.address==="string"?item.address:"",
      category, gameCategory:classifyPoi(category), lat:item.lat, lng:item.lng,
      distanceMeters:Math.round(distance),
      source:typeof item.source==="string"?item.source:"",
      // Preserve provenance even in this transient in-memory sample.
      licenses:Array.isArray(item.licenses)?item.licenses.filter(x=>typeof x==="string"):[],
      attributions:Array.isArray(item.attributions)?item.attributions.filter(x=>typeof x==="string"):[]
    });
  }
  records.sort((a,b)=>a.distanceMeters-b.distanceMeters||a.name.localeCompare(b.name,"ja"));
  return {
    requestedLimit:RESULT_LIMIT,
    responseCount:json.results.length,
    returned:records.length,
    invalid, outOfRange,
    unknown:records.filter(x=>x.category==="unknown").length,
    saturated:json.results.length>=RESULT_LIMIT,
    records
  };
}
export async function loadPoiSample(fetchFn = fetch, signal) {
  const res=await fetchFn(makePoiSampleUrl(),{signal,headers:{Accept:"application/json"}});
  if (!res.ok) throw new Error("APIは HTTP "+res.status+" を返しました");
  return normalizePoiResults(await res.json());
}
