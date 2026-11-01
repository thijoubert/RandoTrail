/** Pure geographic helpers (no DOM). Distances in metres, angles in degrees. */

export interface LngLat {
  lng: number;
  lat: number;
}

export interface BBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

const R = 6371008.8;
const DEG = Math.PI / 180;

export function haversine(a: LngLat, b: LngLat): number {
  const dLat = (b.lat - a.lat) * DEG;
  const dLng = (b.lng - a.lng) * DEG;
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);
  const h = s1 * s1 + Math.cos(a.lat * DEG) * Math.cos(b.lat * DEG) * s2 * s2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Fast equirectangular approximation, good enough for < 50 km. */
export function fastDistance(a: LngLat, b: LngLat): number {
  const x = (b.lng - a.lng) * DEG * Math.cos(((a.lat + b.lat) / 2) * DEG);
  const y = (b.lat - a.lat) * DEG;
  return Math.sqrt(x * x + y * y) * R;
}

export function bearing(a: LngLat, b: LngLat): number {
  const φ1 = a.lat * DEG;
  const φ2 = b.lat * DEG;
  const Δλ = (b.lng - a.lng) * DEG;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) / DEG) + 360) % 360;
}

/** Destination point from `a` at `distance` metres along `bearingDeg`. */
export function destination(a: LngLat, bearingDeg: number, distance: number): LngLat {
  const δ = distance / R;
  const θ = bearingDeg * DEG;
  const φ1 = a.lat * DEG;
  const λ1 = a.lng * DEG;
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return { lng: ((λ2 / DEG + 540) % 360) - 180, lat: φ2 / DEG };
}

export function bboxContains(b: BBox, p: LngLat): boolean {
  return p.lat >= b.south && p.lat <= b.north && p.lng >= b.west && p.lng <= b.east;
}

export function bboxArea(b: BBox): number {
  const w = haversine({ lng: b.west, lat: b.south }, { lng: b.east, lat: b.south });
  const h = haversine({ lng: b.west, lat: b.south }, { lng: b.west, lat: b.north });
  return w * h;
}

/** Split a bbox into a grid of `n x n` cells. */
export function splitBBox(b: BBox, n: number): BBox[] {
  const out: BBox[] = [];
  const dLat = (b.north - b.south) / n;
  const dLng = (b.east - b.west) / n;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      out.push({
        south: b.south + i * dLat,
        north: b.south + (i + 1) * dLat,
        west: b.west + j * dLng,
        east: b.west + (j + 1) * dLng,
      });
    }
  }
  return out;
}

export function bboxKey(b: BBox, digits = 4): string {
  return [b.south, b.west, b.north, b.east].map((v) => v.toFixed(digits)).join(',');
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Linear interpolation. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Default study zone: Lyon centre (1er, 4e, 5e, Croix-Rousse, Fourvière, quais). */
export const LYON_CENTRE: BBox = { south: 45.746, west: 4.796, north: 45.786, east: 4.85 };

/** Smaller zone used for quick demos and tests. */
export const LYON_FOURVIERE: BBox = { south: 45.755, west: 4.812, north: 45.772, east: 4.836 };
