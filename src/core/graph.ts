/**
 * Pedestrian graph model. Pure TypeScript, portable to Swift.
 *
 * Nodes are OSM nodes (deduplicated). Edges are OSM way segments between two consecutive
 * intersection nodes, keeping the intermediate geometry. Each edge is stored once; direction
 * is handled at routing time (cost depends on slope sign and on `oneway` for steps `incline`).
 */
import { fastDistance, type BBox, type LngLat } from './geo';

export type HighwayType =
  | 'steps'
  | 'footway'
  | 'path'
  | 'pedestrian'
  | 'living_street'
  | 'residential'
  | 'service'
  | 'track'
  | 'unclassified'
  | 'tertiary'
  | 'secondary'
  | 'primary'
  | 'cycleway'
  | 'bridleway'
  | 'corridor'
  | 'other';

export interface EdgeTags {
  highway: HighwayType;
  name?: string;
  /** OSM step_count (number of steps) when tagged. */
  stepCount?: number;
  /** OSM incline: 'up' | 'down' | numeric percent string, as tagged. */
  incline?: string;
  surface?: string;
  handrail?: string;
  bridge?: boolean;
  tunnel?: boolean;
  /** Sidewalk / crossing footways are tagged for stats only. */
  footwayKind?: string;
  lit?: string;
  width?: number;
}

export interface GraphNode {
  /** OSM node id. */
  id: number;
  lng: number;
  lat: number;
  /** Elevation in metres (NaN until assigned). */
  ele: number;
  /** Indexes into graph.edges of incident edges. */
  edges: number[];
}

export interface GraphEdge {
  /** Index in graph.edges. */
  id: number;
  osmWayId: number;
  from: number; // node index
  to: number; // node index
  /** Full geometry including both endpoints (lng/lat). */
  geometry: LngLat[];
  /** Horizontal length in metres. */
  length: number;
  /** Length of each sub-segment geometry[i] -> geometry[i+1] (metres). */
  segLengths: number[];
  /** Elevation at each geometry vertex (metres), assigned by the elevation step. */
  eles?: number[];
  /** True when the elevations of this edge were corrected (bridge/tunnel/aberrant jump). */
  eleCorrected?: boolean;
  tags: EdgeTags;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  bbox: BBox;
  /** OSM node id -> node index. */
  nodeIndex: Map<number, number>;
  /** Spatial grid for nearest-node lookup. */
  grid: SpatialGrid;
}

export interface SpatialGrid {
  cellSizeDeg: number;
  cells: Map<string, number[]>;
}

export function gridKey(lng: number, lat: number, cellSizeDeg: number): string {
  return `${Math.floor(lng / cellSizeDeg)}:${Math.floor(lat / cellSizeDeg)}`;
}

export function buildGrid(nodes: GraphNode[], cellSizeDeg = 0.002): SpatialGrid {
  const cells = new Map<string, number[]>();
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]!;
    const k = gridKey(n.lng, n.lat, cellSizeDeg);
    let arr = cells.get(k);
    if (!arr) {
      arr = [];
      cells.set(k, arr);
    }
    arr.push(i);
  }
  return { cellSizeDeg, cells };
}

/** Nearest graph node to `p` (only nodes that have at least one edge). Returns -1 if none within `maxDistance`. */
export function nearestNode(graph: Graph, p: LngLat, maxDistance = 250): number {
  const g = graph.grid;
  const cx = Math.floor(p.lng / g.cellSizeDeg);
  const cy = Math.floor(p.lat / g.cellSizeDeg);
  let best = -1;
  let bestD = maxDistance;
  const ring = Math.max(1, Math.ceil(maxDistance / (g.cellSizeDeg * 111000)));
  for (let dx = -ring; dx <= ring; dx++) {
    for (let dy = -ring; dy <= ring; dy++) {
      const arr = g.cells.get(`${cx + dx}:${cy + dy}`);
      if (!arr) continue;
      for (const idx of arr) {
        const n = graph.nodes[idx]!;
        if (n.edges.length === 0) continue;
        const d = fastDistance(p, n);
        if (d < bestD) {
          bestD = d;
          best = idx;
        }
      }
    }
  }
  return best;
}

/** Nodes within `radius` metres of `p`. */
export function nodesWithin(graph: Graph, p: LngLat, radius: number): number[] {
  const g = graph.grid;
  const cx = Math.floor(p.lng / g.cellSizeDeg);
  const cy = Math.floor(p.lat / g.cellSizeDeg);
  const ring = Math.max(1, Math.ceil(radius / (g.cellSizeDeg * 111000)));
  const out: number[] = [];
  for (let dx = -ring; dx <= ring; dx++) {
    for (let dy = -ring; dy <= ring; dy++) {
      const arr = g.cells.get(`${cx + dx}:${cy + dy}`);
      if (!arr) continue;
      for (const idx of arr) {
        const n = graph.nodes[idx]!;
        if (n.edges.length > 0 && fastDistance(p, n) <= radius) out.push(idx);
      }
    }
  }
  return out;
}

/** Other endpoint of an edge seen from `nodeIdx`. */
export function otherEnd(edge: GraphEdge, nodeIdx: number): number {
  return edge.from === nodeIdx ? edge.to : edge.from;
}

/** Geometry of an edge oriented so that it starts at node `fromIdx`. */
export function orientedGeometry(edge: GraphEdge, fromIdx: number): LngLat[] {
  return edge.from === fromIdx ? edge.geometry : [...edge.geometry].reverse();
}

export function isSteps(edge: GraphEdge): boolean {
  return edge.tags.highway === 'steps';
}

export function polylineLength(pts: LngLat[]): number {
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += fastDistance(pts[i - 1]!, pts[i]!);
  return d;
}

/** Elevation gain of an edge going from `fromIdx` (positive = uphill), NaN if unknown. */
export function edgeRise(graph: Graph, edge: GraphEdge, fromIdx: number): number {
  const a = graph.nodes[fromIdx]!.ele;
  const b = graph.nodes[otherEnd(edge, fromIdx)]!.ele;
  return b - a;
}

export function graphSummary(g: Graph): { nodes: number; edges: number; steps: number; lengthKm: number } {
  let steps = 0;
  let len = 0;
  for (const e of g.edges) {
    if (isSteps(e)) steps++;
    len += e.length;
  }
  return { nodes: g.nodes.length, edges: g.edges.length, steps, lengthKm: len / 1000 };
}
