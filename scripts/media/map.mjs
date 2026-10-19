// Locator-map geometry: land polygons (Natural Earth GeoJSON) inside a lon/lat bounding box,
// projected with an equirectangular projection scaled by cos(mid-latitude), fitted to the frame.
// Land only — no political borders (Editorial Bible §3).
import { readFileSync } from 'node:fs';

export function landPath(geojsonFile, [lon0, lat0, lon1, lat1], [plon, plat], W, H) {
  const geo = JSON.parse(readFileSync(geojsonFile, 'utf8'));
  const kx = Math.cos((((lat0 + lat1) / 2) * Math.PI) / 180);
  const sx = W / ((lon1 - lon0) * kx);
  const sy = H / (lat1 - lat0);
  const s = Math.max(sx, sy); // cover the frame
  const cx = (lon0 + lon1) / 2, cy = (lat0 + lat1) / 2;
  const proj = ([lon, lat]) => [W / 2 + (lon - cx) * kx * s, H / 2 - (lat - cy) * s];
  const margin = 2; // degrees: keep polygons that touch the box
  const inBox = (ring) => ring.some(([lon, lat]) => lon > lon0 - margin && lon < lon1 + margin && lat > lat0 - margin && lat < lat1 + margin);
  const parts = [];
  for (const f of geo.features) {
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [];
    for (const poly of polys) {
      if (!inBox(poly[0])) continue;
      for (const ring of poly) parts.push('M' + ring.map((p) => proj(p).map((v) => v.toFixed(1)).join(',')).join('L') + 'Z');
    }
  }
  return { path: parts.join(''), dot: proj([plon, plat]).map((v) => Math.round(v)) };
}
