// Synthetic records only: no real business data or API requests.
export const SIM_POIS = Object.freeze([
  ["meal", "cafe", 34.3573, 134.1012],
  ["rest", "lodging", 34.3552, 134.102],
  ["visit", "tourism", 34.358, 134.100],
  ["supplies", "grocery", 34.356, 134.103],
].map(([name, category, lat, lng]) => ({
  name: `SIM synthetic ${name}`, category, lat, lng, distanceMeters: 250,
  source: "synthetic_sim_fixture", licenses: ["CC0-1.0"],
  attributions: ["Genpei SIM-01 synthetic fixture; not a real facility"],
})));
