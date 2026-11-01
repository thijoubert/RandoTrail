/**
 * Route generators: out-and-back (same or different return) and loops, driven by distance / D+ targets.
 * Everything is bounded (number of candidates, A* explorations) so it stays fast on a phone.
 */
import { bearing, fastDistance } from './geo';
import type { RoutingPreferences } from './cost';
import type { Graph } from './graph';
import { astar, concatLegs, dijkstra, pathFromTree, reverseLeg, type DijkstraResult, type Route, type RouteLeg } from './router';
import { analyzeRoute, type AnalysisOptions, type RouteAnalysis, DEFAULT_ANALYSIS_OPTIONS } from './analysis';

export interface Targets {
  /** Target total distance (m), optional. */
  distanceM?: number;
  /** Target total D+ (m), optional. */
  gainM?: number;
}

export interface GeneratedRoute {
  route: Route;
  analysis: RouteAnalysis;
  /** Lower is better (0 = targets hit exactly). */
  score: number;
  label: string;
}

export interface GeneratorOptions {
  analysis?: AnalysisOptions;
  /** Max candidate turnaround nodes evaluated with A* (different return / loops). */
  maxCandidates?: number;
  /** Penalty multiplier on already used edges when computing a different return. */
  reusePenalty?: number;
  /** Deterministic seed for candidate sampling. */
  seed?: number;
}

/** Relative gap between targets and the route (0 = exact). */
export function targetScore(length: number, gain: number, t: Targets): number {
  let s = 0;
  let n = 0;
  if (t.distanceM && t.distanceM > 0) {
    s += Math.abs(length - t.distanceM) / t.distanceM;
    n++;
  }
  if (t.gainM && t.gainM > 0) {
    s += Math.abs(gain - t.gainM) / t.gainM;
    n++;
  }
  return n ? s / n : 0;
}

/** Fraction of edges of `a` also present in `b` (0..1). */
export function edgeOverlap(a: number[], b: number[]): number {
  if (a.length === 0) return 0;
  const set = new Set(b);
  let c = 0;
  for (const e of a) if (set.has(e)) c++;
  return c / a.length;
}

/** Small deterministic PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function penaltyMap(edges: number[], factor: number): Map<number, number> {
  const m = new Map<number, number>();
  for (const e of edges) m.set(e, factor);
  return m;
}

/** Candidate nodes whose tree distance/gain is close to the half targets (for out-and-back). */
function halfTargetCandidates(graph: Graph, tree: DijkstraResult, t: Targets, max: number): number[] {
  const halfD = t.distanceM ? t.distanceM / 2 : undefined;
  const halfG = t.gainM ? t.gainM / 2 : undefined;
  const scored: { idx: number; s: number }[] = [];
  for (let i = 0; i < graph.nodes.length; i++) {
    const d = tree.dist[i]!;
    if (!Number.isFinite(d) || d === 0) continue;
    const g = tree.gain[i]!;
    let s = 0;
    let n = 0;
    if (halfD) {
      s += Math.abs(d - halfD) / halfD;
      n++;
    }
    if (halfG) {
      s += Math.abs(g - halfG) / halfG;
      n++;
    }
    if (n === 0) continue;
    s /= n;
    if (s < 0.35) scored.push({ idx: i, s });
  }
  scored.sort((a, b) => a.s - b.s);
  // Spread candidates spatially: skip nodes within 80 m of an already chosen one.
  const chosen: number[] = [];
  for (const c of scored) {
    if (chosen.length >= max) break;
    const p = graph.nodes[c.idx]!;
    if (chosen.some((k) => fastDistance(graph.nodes[k]!, p) < 80)) continue;
    chosen.push(c.idx);
  }
  return chosen;
}

/**
 * Out-and-back from `start`: finds a turnaround node so that the whole route reaches the targets.
 * `differentReturn` computes the way back with the outbound edges penalised.
 */
export function outAndBack(graph: Graph, start: number, t: Targets, prefs: RoutingPreferences, differentReturn: boolean, opts: GeneratorOptions = {}): GeneratedRoute[] {
  const analysisOpts = opts.analysis ?? DEFAULT_ANALYSIS_OPTIONS;
  const maxCandidates = opts.maxCandidates ?? (differentReturn ? 12 : 40);
  const budget = t.distanceM ? t.distanceM * 1.2 : t.gainM ? t.gainM * 60 : 10000;
  const tree = dijkstra(graph, start, prefs, budget * 3);
  const candidates = halfTargetCandidates(graph, tree, t, maxCandidates);
  const results: GeneratedRoute[] = [];
  for (const c of candidates) {
    const out = pathFromTree(graph, tree, c);
    if (!out) continue;
    let back: RouteLeg | null;
    if (differentReturn) {
      back = astar(graph, c, start, prefs, { penalizedEdges: penaltyMap(out.edges, opts.reusePenalty ?? 4) });
      if (!back) continue;
    } else {
      back = reverseLeg(out);
    }
    const route = concatLegs([start, c, start], [out, back]);
    const analysis = analyzeRoute(graph, route, analysisOpts);
    const score = targetScore(analysis.length, analysis.gainLoss.gain, t) + (differentReturn ? edgeOverlap(back.edges, out.edges) * 0.3 : 0);
    results.push({ route, analysis, score, label: differentReturn ? 'A/R retour différent' : 'A/R même chemin' });
  }
  results.sort((a, b) => a.score - b.score);
  return results.slice(0, 5);
}

/** Candidates at about `targetDist` tree distance from start, spread in bearing. */
function ringCandidates(graph: Graph, start: number, tree: DijkstraResult, targetDist: number, tol: number, max: number, random: () => number): number[] {
  const p0 = graph.nodes[start]!;
  const buckets = new Map<number, number[]>();
  for (let i = 0; i < graph.nodes.length; i++) {
    const d = tree.dist[i]!;
    if (!Number.isFinite(d) || Math.abs(d - targetDist) > targetDist * tol) continue;
    const b = Math.floor(bearing(p0, graph.nodes[i]!) / 30);
    let arr = buckets.get(b);
    if (!arr) {
      arr = [];
      buckets.set(b, arr);
    }
    arr.push(i);
  }
  const out: number[] = [];
  const keys = [...buckets.keys()].sort((a, b) => a - b);
  let round = 0;
  while (out.length < max && round < 4) {
    for (const k of keys) {
      const arr = buckets.get(k)!;
      if (arr.length === 0) continue;
      const j = Math.floor(random() * arr.length);
      out.push(arr.splice(j, 1)[0]!);
      if (out.length >= max) break;
    }
    round++;
  }
  return out;
}

/** Loops from `start` matching the targets: start -> A -> B -> start with reuse penalties. */
export function generateLoops(graph: Graph, start: number, t: Targets, prefs: RoutingPreferences, opts: GeneratorOptions = {}): GeneratedRoute[] {
  const analysisOpts = opts.analysis ?? DEFAULT_ANALYSIS_OPTIONS;
  const random = rng(opts.seed ?? 42);
  const D = t.distanceM && t.distanceM > 0 ? t.distanceM : t.gainM ? Math.max(3000, t.gainM * 25) : 5000;
  const tree = dijkstra(graph, start, prefs, D * 1.5);
  const aList = ringCandidates(graph, start, tree, D / 3, 0.2, opts.maxCandidates ?? 10, random);
  const p0 = graph.nodes[start]!;
  const results: GeneratedRoute[] = [];
  let evaluations = 0;
  const maxEval = (opts.maxCandidates ?? 10) * 2;
  for (const a of aList) {
    const legA = pathFromTree(graph, tree, a);
    if (!legA) continue;
    const bearA = bearing(p0, graph.nodes[a]!);
    // B: same ring, bearing 70..150° away from A, choose up to 2 per A.
    const bCands = ringCandidates(graph, start, tree, D / 3, 0.25, 24, random).filter((b) => {
      const db = Math.abs((((bearing(p0, graph.nodes[b]!) - bearA) % 360) + 540) % 360 - 180);
      const sep = 180 - db; // angular separation 0..180
      return sep >= 70 && sep <= 150 && b !== a;
    });
    for (const b of bCands.slice(0, 2)) {
      if (evaluations++ > maxEval) break;
      const legAB = astar(graph, a, b, prefs, { penalizedEdges: penaltyMap(legA.edges, opts.reusePenalty ?? 4) });
      if (!legAB) continue;
      const used = [...legA.edges, ...legAB.edges];
      const legB0 = astar(graph, b, start, prefs, { penalizedEdges: penaltyMap(used, opts.reusePenalty ?? 4) });
      if (!legB0) continue;
      const route = concatLegs([start, a, b, start], [legA, legAB, legB0]);
      const analysis = analyzeRoute(graph, route, analysisOpts);
      const reuse = edgeOverlap(legB0.edges, used) * 0.5 + edgeOverlap(legAB.edges, legA.edges) * 0.3;
      const score = targetScore(analysis.length, analysis.gainLoss.gain, t) + reuse;
      results.push({ route, analysis, score, label: 'Boucle' });
    }
  }
  results.sort((a, b) => a.score - b.score);
  // Keep loops that are really different from each other.
  const kept: GeneratedRoute[] = [];
  for (const r of results) {
    if (kept.some((k) => edgeOverlap(r.route.edges, k.route.edges) > 0.7)) continue;
    kept.push(r);
    if (kept.length >= 5) break;
  }
  return kept;
}
