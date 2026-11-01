/**
 * A* and Dijkstra on the pedestrian graph. Hand-written binary heap; no external library.
 * Portable to Swift: arrays + typed indexes only.
 */
import { fastDistance, type LngLat } from './geo';
import { edgeCost, edgeSegments, minFactor, type RoutingPreferences } from './cost';
import { nearestNode, otherEnd, type Graph, type GraphEdge } from './graph';

/** Minimal binary min-heap keyed by number. */
export class MinHeap {
  private keys: number[] = [];
  private vals: number[] = [];
  get size(): number {
    return this.keys.length;
  }
  push(key: number, val: number): void {
    const k = this.keys;
    const v = this.vals;
    k.push(key);
    v.push(val);
    let i = k.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p]! <= k[i]!) break;
      [k[p], k[i]] = [k[i]!, k[p]!];
      [v[p], v[i]] = [v[i]!, v[p]!];
      i = p;
    }
  }
  pop(): { key: number; val: number } | undefined {
    const k = this.keys;
    const v = this.vals;
    if (k.length === 0) return undefined;
    const top = { key: k[0]!, val: v[0]! };
    const lk = k.pop()!;
    const lv = v.pop()!;
    if (k.length > 0) {
      k[0] = lk;
      v[0] = lv;
      let i = 0;
      const n = k.length;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < n && k[l]! < k[m]!) m = l;
        if (r < n && k[r]! < k[m]!) m = r;
        if (m === i) break;
        [k[m], k[i]] = [k[i]!, k[m]!];
        [v[m], v[i]] = [v[i]!, v[m]!];
        i = m;
      }
    }
    return top;
  }
}

export interface RouteLeg {
  /** Node indexes visited, start to end. */
  nodes: number[];
  /** Edge indexes traversed (length = nodes.length - 1). */
  edges: number[];
  cost: number;
  length: number;
}

export interface RouteOptions {
  /** Extra cost multiplier for edges listed here (used to find alternative routes). */
  penalizedEdges?: Map<number, number>;
  /** Hard limit on explored nodes (safety on mobile). */
  maxExplored?: number;
}

/** Cost of an edge in a direction, with optional penalty. */
export function directedCost(
  graph: Graph,
  edge: GraphEdge,
  fromIdx: number,
  prefs: RoutingPreferences,
  penalized?: Map<number, number>,
): number {
  let c = edgeCost(edge, edgeSegments(graph, edge, fromIdx), prefs);
  if (penalized) {
    const m = penalized.get(edge.id);
    if (m !== undefined) c *= m;
  }
  return c;
}

/** A* from node `start` to node `goal`. Returns null if unreachable. */
export function astar(
  graph: Graph,
  start: number,
  goal: number,
  prefs: RoutingPreferences,
  opts: RouteOptions = {},
): RouteLeg | null {
  if (start === goal) return { nodes: [start], edges: [], cost: 0, length: 0 };
  const n = graph.nodes.length;
  const g = new Float64Array(n).fill(Infinity);
  const prevNode = new Int32Array(n).fill(-1);
  const prevEdge = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const hf = minFactor(prefs);
  const goalP: LngLat = graph.nodes[goal]!;
  const h = (i: number): number => fastDistance(graph.nodes[i]!, goalP) * hf;
  const heap = new MinHeap();
  g[start] = 0;
  heap.push(h(start), start);
  let explored = 0;
  const maxExplored = opts.maxExplored ?? 400_000;
  while (heap.size > 0) {
    const top = heap.pop()!;
    const u = top.val;
    if (closed[u]) continue;
    closed[u] = 1;
    if (u === goal) break;
    if (++explored > maxExplored) return null;
    const node = graph.nodes[u]!;
    for (const eid of node.edges) {
      const e = graph.edges[eid]!;
      const v = otherEnd(e, u);
      if (closed[v]) continue;
      const c = g[u]! + directedCost(graph, e, u, prefs, opts.penalizedEdges);
      if (c < g[v]!) {
        g[v] = c;
        prevNode[v] = u;
        prevEdge[v] = eid;
        heap.push(c + h(v), v);
      }
    }
  }
  if (!closed[goal]) return null;
  return reconstruct(graph, prevNode, prevEdge, goal, g[goal]!);
}

function reconstruct(graph: Graph, prevNode: Int32Array, prevEdge: Int32Array, goal: number, cost: number): RouteLeg {
  const nodes: number[] = [];
  const edges: number[] = [];
  let cur = goal;
  while (cur !== -1) {
    nodes.push(cur);
    const pe = prevEdge[cur]!;
    if (pe !== -1) edges.push(pe);
    cur = prevNode[cur]!;
  }
  nodes.reverse();
  edges.reverse();
  let length = 0;
  for (const eid of edges) length += graph.edges[eid]!.length;
  return { nodes, edges, cost, length };
}

export interface DijkstraResult {
  /** Cost from source to each node (Infinity if unreachable). */
  cost: Float64Array;
  /** Horizontal distance along the best path. */
  dist: Float64Array;
  /** Elevation gain along the best path (D+). */
  gain: Float64Array;
  prevNode: Int32Array;
  prevEdge: Int32Array;
}

/** Dijkstra from `source`, stopping when cost exceeds `maxCost` (used by generators). */
export function dijkstra(graph: Graph, source: number, prefs: RoutingPreferences, maxCost = Infinity, opts: RouteOptions = {}): DijkstraResult {
  const n = graph.nodes.length;
  const cost = new Float64Array(n).fill(Infinity);
  const dist = new Float64Array(n).fill(Infinity);
  const gain = new Float64Array(n).fill(Infinity);
  const prevNode = new Int32Array(n).fill(-1);
  const prevEdge = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const heap = new MinHeap();
  cost[source] = 0;
  dist[source] = 0;
  gain[source] = 0;
  heap.push(0, source);
  while (heap.size > 0) {
    const top = heap.pop()!;
    const u = top.val;
    if (closed[u]) continue;
    closed[u] = 1;
    if (top.key > maxCost) break;
    const node = graph.nodes[u]!;
    for (const eid of node.edges) {
      const e = graph.edges[eid]!;
      const v = otherEnd(e, u);
      if (closed[v]) continue;
      const c = cost[u]! + directedCost(graph, e, u, prefs, opts.penalizedEdges);
      if (c < cost[v]!) {
        cost[v] = c;
        dist[v] = dist[u]! + e.length;
        gain[v] = gain[u]! + positiveRise(graph, e, u);
        prevNode[v] = u;
        prevEdge[v] = eid;
        heap.push(c, v);
      }
    }
  }
  return { cost, dist, gain, prevNode, prevEdge };
}

/** Sum of positive sub-segment rises of an edge traversed from `fromIdx`. */
export function positiveRise(graph: Graph, edge: GraphEdge, fromIdx: number): number {
  const seg = edgeSegments(graph, edge, fromIdx);
  let s = 0;
  for (const r of seg.rises) if (Number.isFinite(r) && r > 0) s += r;
  return s;
}

/** Path from a Dijkstra tree to `target`. */
export function pathFromTree(graph: Graph, tree: DijkstraResult, target: number): RouteLeg | null {
  if (!Number.isFinite(tree.cost[target]!)) return null;
  return reconstruct(graph, tree.prevNode, tree.prevEdge, target, tree.cost[target]!);
}

export interface Route {
  /** Snapped waypoint node indexes. */
  waypoints: number[];
  legs: RouteLeg[];
  nodes: number[];
  edges: number[];
  length: number;
  cost: number;
}

/** Concatenate legs into a route. */
export function concatLegs(waypoints: number[], legs: RouteLeg[]): Route {
  const nodes: number[] = [];
  const edges: number[] = [];
  let length = 0;
  let cost = 0;
  legs.forEach((leg, i) => {
    if (i === 0) nodes.push(...leg.nodes);
    else nodes.push(...leg.nodes.slice(1));
    edges.push(...leg.edges);
    length += leg.length;
    cost += leg.cost;
  });
  return { waypoints, legs, nodes, edges, length, cost };
}

/** Route through a list of geographic waypoints (snapped to the nearest graph node). */
export function routeThrough(graph: Graph, points: LngLat[], prefs: RoutingPreferences, opts: RouteOptions = {}): Route | null {
  const wp: number[] = [];
  for (const p of points) {
    const idx = nearestNode(graph, p);
    if (idx < 0) return null;
    wp.push(idx);
  }
  return routeNodes(graph, wp, prefs, opts);
}

export function routeNodes(graph: Graph, wp: number[], prefs: RoutingPreferences, opts: RouteOptions = {}): Route | null {
  if (wp.length < 2) return null;
  const legs: RouteLeg[] = [];
  for (let i = 1; i < wp.length; i++) {
    const leg = astar(graph, wp[i - 1]!, wp[i]!, prefs, opts);
    if (!leg) return null;
    legs.push(leg);
  }
  return concatLegs(wp, legs);
}

/** Reverse a route (same geometry, opposite direction). */
export function reverseLeg(leg: RouteLeg): RouteLeg {
  return { nodes: [...leg.nodes].reverse(), edges: [...leg.edges].reverse(), cost: leg.cost, length: leg.length };
}
