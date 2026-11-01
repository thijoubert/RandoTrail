/**
 * Variants of a route (really different alternatives) and hill repeats.
 */
import { analyzeRoute, type AnalysisOptions, type RouteAnalysis, DEFAULT_ANALYSIS_OPTIONS } from './analysis';
import type { Climb } from './climbs';
import type { RoutingPreferences } from './cost';
import { edgeOverlap } from './generate';
import type { Graph } from './graph';
import type { ProfilePoint } from './profile';
import { concatLegs, reverseLeg, routeNodes, type Route, type RouteLeg } from './router';

export interface Variant {
  label: string;
  description: string;
  prefs: RoutingPreferences;
  route: Route;
  analysis: RouteAnalysis;
  /** Edge overlap with the base route (0..1). */
  overlap: number;
}

/** Variant recipes: preference changes and edge penalties. */
export function variantRecipes(base: RoutingPreferences): { label: string; description: string; prefs: RoutingPreferences; penalizeBase: number }[] {
  return [
    { label: 'Plus court', description: 'Escaliers tolérés, pentes neutres', prefs: { ...base, stairs: 'tolerate', slopes: 'neutral' }, penalizeBase: 1 },
    { label: 'Sans escaliers', description: 'Escaliers évités', prefs: { ...base, stairs: 'avoid' }, penalizeBase: 1 },
    { label: 'Max escaliers', description: 'Escaliers recherchés', prefs: { ...base, stairs: 'prefer' }, penalizeBase: 1 },
    { label: 'Pentes limitées', description: `Pente max ${Math.min(base.maxGradePct, 8)} %`, prefs: { ...base, slopes: 'limit', maxGradePct: Math.min(base.maxGradePct, 8) }, penalizeBase: 1 },
    { label: 'Pentes recherchées', description: 'Montées raides favorisées', prefs: { ...base, slopes: 'seek' }, penalizeBase: 1 },
    { label: 'Autre chemin', description: 'Même préférences, tracé de base pénalisé', prefs: base, penalizeBase: 3 },
    { label: 'Autre chemin (bis)', description: 'Tracé de base fortement pénalisé', prefs: base, penalizeBase: 8 },
  ];
}

/**
 * Generate 3..5 variants of the route through the same waypoints that are really different
 * (edge overlap with the base and with each other < `maxOverlap`).
 */
export function generateVariants(graph: Graph, base: Route, basePrefs: RoutingPreferences, opts: { analysis?: AnalysisOptions; maxOverlap?: number; max?: number } = {}): Variant[] {
  const analysisOpts = opts.analysis ?? DEFAULT_ANALYSIS_OPTIONS;
  const maxOverlap = opts.maxOverlap ?? 0.75;
  const max = opts.max ?? 5;
  const out: Variant[] = [];
  const seen: number[][] = [base.edges];
  for (const r of variantRecipes(basePrefs)) {
    const pen = new Map<number, number>();
    if (r.penalizeBase > 1) for (const e of base.edges) pen.set(e, r.penalizeBase);
    const route = routeNodes(graph, base.waypoints, r.prefs, { penalizedEdges: pen });
    if (!route) continue;
    const overlapBase = edgeOverlap(route.edges, base.edges);
    const dup = seen.some((s) => edgeOverlap(route.edges, s) > maxOverlap && edgeOverlap(s, route.edges) > maxOverlap);
    if (dup) continue;
    seen.push(route.edges);
    out.push({ label: r.label, description: r.description, prefs: r.prefs, route, analysis: analyzeRoute(graph, route, analysisOpts), overlap: overlapBase });
    if (out.length >= max) break;
  }
  return out;
}

export interface HillRepeat {
  times: number;
  route: Route;
  analysis: RouteAnalysis;
  /** Stats of one ascent. */
  single: RouteAnalysis;
}

/** Route sub-leg between two profile indexes (snapped to route nodes). */
export function subLeg(graph: Graph, route: Route, points: ProfilePoint[], i: number, j: number): RouteLeg | null {
  // Find route node indexes covering [i, j].
  let a = -1;
  for (let k = i; k >= 0; k--) {
    if (points[k]!.nodeIdx >= 0) {
      a = points[k]!.nodeIdx;
      break;
    }
  }
  let b = -1;
  for (let k = j; k < points.length; k++) {
    if (points[k]!.nodeIdx >= 0) {
      b = points[k]!.nodeIdx;
      break;
    }
  }
  if (a < 0 || b < 0 || b <= a) return null;
  const nodes = route.nodes.slice(a, b + 1);
  const edges = route.edges.slice(a, b);
  let length = 0;
  for (const e of edges) length += graph.edges[e]!.length;
  return { nodes, edges, cost: length, length };
}

/** Repeat a climb N times (up, then back down the same way). */
export function hillRepeats(graph: Graph, route: Route, points: ProfilePoint[], climb: Climb, times: number, opts: { analysis?: AnalysisOptions } = {}): HillRepeat | null {
  const up = subLeg(graph, route, points, climb.i, climb.j);
  if (!up) return null;
  const down = reverseLeg(up);
  const legs: RouteLeg[] = [];
  const wps: number[] = [up.nodes[0]!];
  for (let k = 0; k < times; k++) {
    legs.push(up, down);
    wps.push(up.nodes[up.nodes.length - 1]!, up.nodes[0]!);
  }
  const rep = concatLegs(wps, legs);
  const one = concatLegs([up.nodes[0]!, up.nodes[up.nodes.length - 1]!], [up]);
  const analysisOpts = opts.analysis ?? DEFAULT_ANALYSIS_OPTIONS;
  return { times, route: rep, analysis: analyzeRoute(graph, rep, analysisOpts), single: analyzeRoute(graph, one, analysisOpts) };
}
