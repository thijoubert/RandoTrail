/**
 * Parameterisable routing cost. cost = length x factor(type, slope, surface) + penalties.
 * Pure functions; the same preferences drive route generation and variants.
 */
import type { Graph, GraphEdge } from './graph';
import { isSteps } from './graph';

export type StairsPreference = 'avoid' | 'tolerate' | 'prefer';
export type SlopePreference = 'limit' | 'neutral' | 'seek';

export interface RoutingPreferences {
  stairs: StairsPreference;
  slopes: SlopePreference;
  /** Maximum comfortable grade (%) when `slopes === 'limit'`. Above it the factor rises steeply. */
  maxGradePct: number;
  avoidMajorRoads: boolean;
  /** Multiplicative factor applied to stairs length when avoided (>= 1). */
  stairsAvoidFactor: number;
  /** Multiplicative factor applied to stairs length when preferred (<= 1). */
  stairsPreferFactor: number;
  /** Fixed penalty in metres added per stairs edge when avoided (prevents chaining tiny stairs). */
  stairsAvoidPenaltyM: number;
}

export const DEFAULT_PREFERENCES: RoutingPreferences = {
  stairs: 'tolerate',
  slopes: 'neutral',
  maxGradePct: 12,
  avoidMajorRoads: true,
  stairsAvoidFactor: 6,
  stairsPreferFactor: 0.45,
  stairsAvoidPenaltyM: 60,
};

export const MAJOR_ROADS = new Set(['primary', 'secondary', 'tertiary']);

/** Base factor by highway type (walking comfort). */
export function highwayFactor(edge: GraphEdge, prefs: RoutingPreferences): number {
  const h = edge.tags.highway;
  if (prefs.avoidMajorRoads && MAJOR_ROADS.has(h)) return h === 'primary' ? 2.2 : h === 'secondary' ? 1.8 : 1.4;
  if (h === 'service' || h === 'track') return 1.1;
  if (h === 'other') return 1.5;
  return 1;
}

/** Slope factor for a sub-segment of grade `gradePct` (signed, positive uphill). */
export function slopeFactor(gradePct: number, prefs: RoutingPreferences): number {
  const g = Math.abs(gradePct);
  if (prefs.slopes === 'neutral') return 1;
  if (prefs.slopes === 'limit') {
    if (g <= prefs.maxGradePct) return 1;
    // quadratic growth above the limit: 2x at +10 points, 5x at +20 points
    const over = (g - prefs.maxGradePct) / 10;
    return 1 + over * over + over * 0.5;
  }
  // seek: reward uphill grades (never below 0.5 so the A* heuristic stays admissible)
  if (gradePct <= 0) return 1;
  return Math.max(0.5, 1 - Math.min(g, 25) / 50);
}

/** Minimum factor any sub-segment can have for the given preferences (A* heuristic admissibility). */
export function minFactor(prefs: RoutingPreferences): number {
  const stairs = prefs.stairs === 'prefer' ? prefs.stairsPreferFactor : 1;
  const slope = prefs.slopes === 'seek' ? 0.5 : 1;
  return Math.min(1, stairs * slope);
}

/** Grade (%) of a segment, 0 when elevations are unknown. */
export function gradePct(rise: number, length: number): number {
  if (!Number.isFinite(rise) || length <= 0) return 0;
  return (100 * rise) / length;
}

export interface EdgeCostInput {
  /** Horizontal length of each sub-segment (metres), oriented in travel direction. */
  lengths: number[];
  /** Signed rise of each sub-segment (metres), oriented in travel direction. NaN when unknown. */
  rises: number[];
}

/** Cost of traversing an edge in a given direction. */
export function edgeCost(edge: GraphEdge, seg: EdgeCostInput, prefs: RoutingPreferences): number {
  const base = highwayFactor(edge, prefs);
  let cost = 0;
  if (isSteps(edge)) {
    let f = 1;
    let penalty = 0;
    if (prefs.stairs === 'avoid') {
      f = prefs.stairsAvoidFactor;
      penalty = prefs.stairsAvoidPenaltyM;
    } else if (prefs.stairs === 'prefer') {
      f = prefs.stairsPreferFactor;
    }
    return edge.length * f * base + penalty;
  }
  for (let i = 0; i < seg.lengths.length; i++) {
    const len = seg.lengths[i]!;
    const g = gradePct(seg.rises[i]!, len);
    cost += len * slopeFactor(g, prefs);
  }
  return cost * base;
}

/** Sub-segment lengths/rises of an edge oriented from node `fromIdx`. */
export function edgeSegments(graph: Graph, edge: GraphEdge, fromIdx: number): EdgeCostInput {
  const forward = edge.from === fromIdx;
  const geom = edge.geometry;
  const eles = edge.eles;
  const n = geom.length;
  const lengths: number[] = [];
  const rises: number[] = [];
  if (!eles || eles.length !== n) {
    // No per-vertex elevation: single segment using endpoint node elevations.
    const a = graph.nodes[edge.from]!.ele;
    const b = graph.nodes[edge.to]!.ele;
    const rise = forward ? b - a : a - b;
    return { lengths: [edge.length], rises: [rise] };
  }
  for (let i = 1; i < n; i++) {
    const j = forward ? i : n - i;
    const k = forward ? i - 1 : n - i - 1;
    lengths.push(edge.segLengths ? edge.segLengths[Math.min(j, k)]! : 0);
    rises.push(eles[j]! - eles[k]!);
  }
  return { lengths, rises };
}
