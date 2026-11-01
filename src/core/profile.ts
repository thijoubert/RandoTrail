/**
 * Elevation profile of a route, smoothing and D+/D- computation. Pure TypeScript.
 */
import type { LngLat } from './geo';
import type { Graph } from './graph';
import { orientedGeometry } from './graph';
import type { Route } from './router';

export interface ProfilePoint {
  /** Cumulative horizontal distance from start (m). */
  d: number;
  /** Elevation (m), NaN if unknown. */
  ele: number;
  lng: number;
  lat: number;
  /** Edge id this point belongs to (the edge starting at or containing it). */
  edgeId: number;
  /** Index of the node in the route node list when the point is a route node, else -1. */
  nodeIdx: number;
}

export interface ProfileOptions {
  /** Moving-average half window in metres (0 = no smoothing). Stairs vertices are never smoothed. */
  smoothWindowM: number;
  /** Hysteresis threshold for D+/D- (m): climbs smaller than this are ignored. */
  gainThresholdM: number;
}

export const DEFAULT_PROFILE_OPTIONS: ProfileOptions = { smoothWindowM: 0, gainThresholdM: 1 };

/** Build the raw profile from a route (one point per geometry vertex). */
export function buildProfile(graph: Graph, route: Route): ProfilePoint[] {
  const pts: ProfilePoint[] = [];
  let d = 0;
  for (let i = 0; i < route.edges.length; i++) {
    const eid = route.edges[i]!;
    const e = graph.edges[eid]!;
    const from = route.nodes[i]!;
    const forward = e.from === from;
    const geom = orientedGeometry(e, from);
    const eles = e.eles ? (forward ? e.eles : [...e.eles].reverse()) : null;
    const segs = forward ? e.segLengths : [...e.segLengths].reverse();
    for (let k = 0; k < geom.length; k++) {
      if (k === 0 && pts.length > 0) continue; // shared vertex with previous edge
      if (k > 0) d += segs[k - 1]!;
      const p = geom[k]!;
      const ele = eles ? eles[k]! : NaN;
      pts.push({ d, ele, lng: p.lng, lat: p.lat, edgeId: eid, nodeIdx: k === 0 ? i : k === geom.length - 1 ? i + 1 : -1 });
    }
  }
  if (pts.length === 0 && route.nodes.length === 1) {
    const n = graph.nodes[route.nodes[0]!]!;
    pts.push({ d: 0, ele: n.ele, lng: n.lng, lat: n.lat, edgeId: -1, nodeIdx: 0 });
  }
  return pts;
}

/** Build a profile from a plain polyline with elevations (GPX import). */
export function profileFromPolyline(points: (LngLat & { ele: number })[], segLengths: number[]): ProfilePoint[] {
  const pts: ProfilePoint[] = [];
  let d = 0;
  points.forEach((p, i) => {
    if (i > 0) d += segLengths[i - 1]!;
    pts.push({ d, ele: p.ele, lng: p.lng, lat: p.lat, edgeId: -1, nodeIdx: i });
  });
  return pts;
}

/** Moving average over distance window; indexes in `locked` keep their value (stairs). */
export function smoothProfile(points: ProfilePoint[], windowM: number, locked?: Set<number>): number[] {
  const n = points.length;
  const out = new Array<number>(n);
  if (windowM <= 0) {
    for (let i = 0; i < n; i++) out[i] = points[i]!.ele;
    return out;
  }
  let lo = 0;
  let hi = 0;
  for (let i = 0; i < n; i++) {
    const d = points[i]!.d;
    while (points[lo]!.d < d - windowM) lo++;
    while (hi + 1 < n && points[hi + 1]!.d <= d + windowM) hi++;
    if (locked?.has(i)) {
      out[i] = points[i]!.ele;
      continue;
    }
    // Distance-weighted (trapezoid) mean of ele between lo..hi.
    let sum = 0;
    let w = 0;
    for (let k = lo; k <= hi; k++) {
      const e = points[k]!.ele;
      if (!Number.isFinite(e)) continue;
      const wk = k === lo || k === hi ? 0.5 : 1;
      sum += e * wk;
      w += wk;
    }
    out[i] = w > 0 ? sum / w : points[i]!.ele;
  }
  return out;
}

export interface GainLoss {
  gain: number;
  loss: number;
  minEle: number;
  maxEle: number;
}

/** D+/D- with hysteresis threshold: only reversals larger than `threshold` are counted. */
export function gainLoss(eles: number[], threshold = 1): GainLoss {
  let gain = 0;
  let loss = 0;
  let minEle = Infinity;
  let maxEle = -Infinity;
  let ref = NaN;
  let dir = 0; // 1 climbing, -1 descending
  let extreme = NaN;
  for (const e of eles) {
    if (!Number.isFinite(e)) continue;
    if (e < minEle) minEle = e;
    if (e > maxEle) maxEle = e;
    if (!Number.isFinite(ref)) {
      ref = e;
      extreme = e;
      continue;
    }
    if (dir >= 0) {
      if (e > extreme) extreme = e;
      else if (extreme - e >= threshold) {
        gain += extreme - ref;
        ref = extreme;
        dir = -1;
        extreme = e;
      }
      if (dir === 0 && e - ref >= threshold) dir = 1;
    } else {
      if (e < extreme) extreme = e;
      else if (e - extreme >= threshold) {
        loss += ref - extreme;
        ref = extreme;
        dir = 1;
        extreme = e;
      }
    }
  }
  if (dir === 1 || (dir === 0 && Number.isFinite(extreme) && extreme > ref)) gain += extreme - ref;
  else if (dir === -1 || (dir === 0 && Number.isFinite(extreme) && extreme < ref)) loss += ref - extreme;
  if (!Number.isFinite(minEle)) {
    minEle = NaN;
    maxEle = NaN;
  }
  return { gain, loss, minEle, maxEle };
}

/** Index of the profile point nearest to distance `d` (binary search). */
export function indexAtDistance(points: ProfilePoint[], d: number): number {
  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid]!.d < d) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs(points[lo - 1]!.d - d) < Math.abs(points[lo]!.d - d)) return lo - 1;
  return lo;
}

/** Index of the profile point nearest to a geographic position (linear scan; profiles are small). */
export function indexNearest(points: ProfilePoint[], p: LngLat): number {
  let best = 0;
  let bestD = Infinity;
  const c = Math.cos((p.lat * Math.PI) / 180);
  for (let i = 0; i < points.length; i++) {
    const q = points[i]!;
    const dx = (q.lng - p.lng) * c;
    const dy = q.lat - p.lat;
    const dd = dx * dx + dy * dy;
    if (dd < bestD) {
      bestD = dd;
      best = i;
    }
  }
  return best;
}
