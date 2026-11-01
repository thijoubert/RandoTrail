/**
 * Overpass JSON -> pedestrian graph. Pure TypeScript.
 * Accepts both `out tags geom` output (ways with inline geometry) and classic `out body` (nodes + ways).
 */
import { fastDistance, type BBox, type LngLat } from './geo';
import { buildGrid, type EdgeTags, type Graph, type GraphEdge, type GraphNode, type HighwayType } from './graph';

export interface OsmWay {
  id: number;
  nodeIds: number[];
  coords: LngLat[];
  tags: Record<string, string>;
}

export interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  nodes?: number[];
  geometry?: { lat: number; lon: number }[];
  tags?: Record<string, string>;
}

export interface OverpassJson {
  elements: OverpassElement[];
  osm3s?: { timestamp_osm_base?: string };
}

/** Highway values considered walkable (motorways/trunks excluded). */
export const WALKABLE_HIGHWAYS: readonly string[] = [
  'steps',
  'footway',
  'path',
  'pedestrian',
  'living_street',
  'residential',
  'service',
  'track',
  'unclassified',
  'tertiary',
  'tertiary_link',
  'secondary',
  'secondary_link',
  'primary',
  'primary_link',
  'cycleway',
  'bridleway',
  'corridor',
  'road',
];

/** Overpass QL query for the walkable network of a bbox (compact output with inline geometry). */
export function overpassQuery(b: BBox, timeoutSec = 90): string {
  const bbox = `${b.south},${b.west},${b.north},${b.east}`;
  const re = `^(${WALKABLE_HIGHWAYS.join('|')})$`;
  return (
    `[out:json][timeout:${timeoutSec}][bbox:${bbox}];` +
    `way["highway"~"${re}"]["foot"!~"^(no|private)$"]["access"!~"^(private|no)$"]["area"!="yes"];` +
    `out tags geom qt;`
  );
}

export function parseOverpass(json: OverpassJson): OsmWay[] {
  const nodePos = new Map<number, LngLat>();
  for (const el of json.elements) {
    if (el.type === 'node' && typeof el.lat === 'number' && typeof el.lon === 'number') {
      nodePos.set(el.id, { lng: el.lon, lat: el.lat });
    }
  }
  const ways: OsmWay[] = [];
  for (const el of json.elements) {
    if (el.type !== 'way' || !el.nodes || el.nodes.length < 2) continue;
    const tags = el.tags ?? {};
    if (!tags['highway']) continue;
    let coords: LngLat[] | null = null;
    if (el.geometry && el.geometry.length === el.nodes.length) {
      coords = el.geometry.map((g) => ({ lng: g.lon, lat: g.lat }));
    } else {
      const c: LngLat[] = [];
      let ok = true;
      for (const nid of el.nodes) {
        const p = nodePos.get(nid);
        if (!p) {
          ok = false;
          break;
        }
        c.push(p);
      }
      if (ok) coords = c;
    }
    if (!coords) continue;
    ways.push({ id: el.id, nodeIds: el.nodes, coords, tags });
  }
  return ways;
}

function toHighway(v: string | undefined): HighwayType {
  switch (v) {
    case 'steps':
    case 'footway':
    case 'path':
    case 'pedestrian':
    case 'living_street':
    case 'residential':
    case 'service':
    case 'track':
    case 'unclassified':
    case 'cycleway':
    case 'bridleway':
    case 'corridor':
      return v;
    case 'tertiary':
    case 'tertiary_link':
      return 'tertiary';
    case 'secondary':
    case 'secondary_link':
      return 'secondary';
    case 'primary':
    case 'primary_link':
      return 'primary';
    default:
      return 'other';
  }
}

export function parseNumber(v: string | undefined): number | undefined {
  if (v === undefined) return undefined;
  const m = /-?\d+(?:[.,]\d+)?/.exec(v);
  if (!m) return undefined;
  const n = Number(m[0].replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
}

export function edgeTagsFromOsm(tags: Record<string, string>): EdgeTags {
  const t: EdgeTags = { highway: toHighway(tags['highway']) };
  if (tags['name']) t.name = tags['name'];
  const sc = parseNumber(tags['step_count']);
  if (sc !== undefined && sc > 0) t.stepCount = Math.round(sc);
  if (tags['incline']) t.incline = tags['incline'];
  if (tags['surface']) t.surface = tags['surface'];
  if (tags['handrail']) t.handrail = tags['handrail'];
  if (tags['bridge'] && tags['bridge'] !== 'no') t.bridge = true;
  if (tags['tunnel'] && tags['tunnel'] !== 'no') t.tunnel = true;
  if (tags['footway']) t.footwayKind = tags['footway'];
  if (tags['lit']) t.lit = tags['lit'];
  const w = parseNumber(tags['width']);
  if (w !== undefined) t.width = w;
  return t;
}

export interface BuildGraphOptions {
  /** Edges longer than this are split at geometry points to add snapping/turnaround nodes. */
  maxEdgeLength?: number;
  /** Keep only ways intersecting this bbox (default: all). */
  bbox?: BBox;
}

/**
 * Build the graph: nodes shared by >= 2 ways and way endpoints become graph nodes; each way is cut into edges
 * at those nodes (and additionally every `maxEdgeLength` metres).
 */
export function buildGraph(ways: OsmWay[], opts: BuildGraphOptions = {}): Graph {
  const maxEdgeLength = opts.maxEdgeLength ?? 120;
  const usage = new Map<number, number>();
  for (const w of ways) {
    for (let i = 0; i < w.nodeIds.length; i++) {
      const nid = w.nodeIds[i]!;
      const endpoint = i === 0 || i === w.nodeIds.length - 1;
      usage.set(nid, (usage.get(nid) ?? 0) + (endpoint ? 2 : 1));
    }
  }
  const nodes: GraphNode[] = [];
  const nodeIndex = new Map<number, number>();
  const edges: GraphEdge[] = [];
  let south = 90;
  let north = -90;
  let west = 180;
  let east = -180;

  const getNode = (nid: number, p: LngLat): number => {
    let idx = nodeIndex.get(nid);
    if (idx === undefined) {
      idx = nodes.length;
      nodeIndex.set(nid, idx);
      nodes.push({ id: nid, lng: p.lng, lat: p.lat, ele: NaN, edges: [] });
      if (p.lat < south) south = p.lat;
      if (p.lat > north) north = p.lat;
      if (p.lng < west) west = p.lng;
      if (p.lng > east) east = p.lng;
    }
    return idx;
  };

  for (const w of ways) {
    const tags = edgeTagsFromOsm(w.tags);
    let startI = 0;
    let acc = 0;
    for (let i = 1; i < w.nodeIds.length; i++) {
      acc += fastDistance(w.coords[i - 1]!, w.coords[i]!);
      const nid = w.nodeIds[i]!;
      const isCut = i === w.nodeIds.length - 1 || (usage.get(nid) ?? 0) >= 2 || acc >= maxEdgeLength;
      if (!isCut) continue;
      const geometry = w.coords.slice(startI, i + 1);
      const segLengths: number[] = [];
      for (let k = 1; k < geometry.length; k++) segLengths.push(fastDistance(geometry[k - 1]!, geometry[k]!));
      const fromIdx = getNode(w.nodeIds[startI]!, w.coords[startI]!);
      const toIdx = getNode(nid, w.coords[i]!);
      if (fromIdx !== toIdx || geometry.length > 2) {
        const e: GraphEdge = {
          id: edges.length,
          osmWayId: w.id,
          from: fromIdx,
          to: toIdx,
          geometry,
          length: acc,
          segLengths,
          tags,
        };
        edges.push(e);
        nodes[fromIdx]!.edges.push(e.id);
        if (toIdx !== fromIdx) nodes[toIdx]!.edges.push(e.id);
      }
      startI = i;
      acc = 0;
    }
  }
  const bbox: BBox = opts.bbox ?? { south, west, north, east };
  return { nodes, edges, bbox, nodeIndex, grid: buildGrid(nodes) };
}

/** Convenience: Overpass JSON -> Graph. */
export function graphFromOverpass(json: OverpassJson, opts: BuildGraphOptions = {}): Graph {
  return buildGraph(parseOverpass(json), opts);
}

/** Statistics on OSM stairs tagging quality (R1). */
export interface StairsStats {
  ways: number;
  withStepCount: number;
  withIncline: number;
  withName: number;
  withHandrail: number;
  withSurface: number;
  withWidth: number;
  withLit: number;
  totalLengthM: number;
  totalStepCount: number;
}

export function stairsStats(ways: OsmWay[]): StairsStats {
  const s: StairsStats = {
    ways: 0,
    withStepCount: 0,
    withIncline: 0,
    withName: 0,
    withHandrail: 0,
    withSurface: 0,
    withWidth: 0,
    withLit: 0,
    totalLengthM: 0,
    totalStepCount: 0,
  };
  for (const w of ways) {
    if (w.tags['highway'] !== 'steps') continue;
    s.ways++;
    const sc = parseNumber(w.tags['step_count']);
    if (sc !== undefined) {
      s.withStepCount++;
      s.totalStepCount += sc;
    }
    if (w.tags['incline']) s.withIncline++;
    if (w.tags['name']) s.withName++;
    if (w.tags['handrail'] || w.tags['handrail:left'] || w.tags['handrail:right'] || w.tags['handrail:center']) s.withHandrail++;
    if (w.tags['surface']) s.withSurface++;
    if (w.tags['width']) s.withWidth++;
    if (w.tags['lit']) s.withLit++;
    for (let i = 1; i < w.coords.length; i++) s.totalLengthM += fastDistance(w.coords[i - 1]!, w.coords[i]!);
  }
  return s;
}
