/**
 * Elevation: provider interface, Terrarium tile decoding, assignment to the graph,
 * and anomaly correction (bridges, tunnels, aberrant jumps). Pure TypeScript.
 */
import { lerp, type LngLat } from './geo';
import type { Graph, GraphEdge } from './graph';
import { isSteps } from './graph';

export interface ElevationProvider {
  readonly id: string;
  readonly label: string;
  /** Nominal resolution in metres. */
  readonly resolutionM: number;
  /** Elevations (metres) for the points, NaN when unknown. */
  elevations(points: LngLat[]): Promise<number[]>;
}

/** Terrarium encoding: h = (R * 256 + G + B / 256) - 32768. */
export function decodeTerrarium(r: number, g: number, b: number): number {
  return r * 256 + g + b / 256 - 32768;
}

/** Mapbox Terrain-RGB encoding: h = -10000 + (R*256*256 + G*256 + B) * 0.1 */
export function decodeTerrainRgb(r: number, g: number, b: number): number {
  return -10000 + (r * 65536 + g * 256 + b) * 0.1;
}

export interface TileCoord {
  z: number;
  x: number;
  y: number;
}

/** Slippy-map tile containing a point, plus fractional pixel position (0..256). */
export function pointToTile(p: LngLat, z: number): { tile: TileCoord; px: number; py: number } {
  const n = 2 ** z;
  const xf = ((p.lng + 180) / 360) * n;
  const latRad = (p.lat * Math.PI) / 180;
  const yf = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  const x = Math.floor(xf);
  const y = Math.floor(yf);
  return { tile: { z, x, y }, px: (xf - x) * 256, py: (yf - y) * 256 };
}

export function tileKey(t: TileCoord): string {
  return `${t.z}/${t.x}/${t.y}`;
}

/** Decoded elevation raster of one 256x256 tile (row-major). */
export interface ElevationTile {
  coord: TileCoord;
  data: Float32Array;
}

/** Bilinear sample at fractional pixel (px, py) in a 256x256 tile, pixel centres at +0.5. */
export function sampleTile(tile: ElevationTile, px: number, py: number): number {
  const x = Math.min(255, Math.max(0, px - 0.5));
  const y = Math.min(255, Math.max(0, py - 0.5));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(255, x0 + 1);
  const y1 = Math.min(255, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const d = tile.data;
  const a = lerp(d[y0 * 256 + x0]!, d[y0 * 256 + x1]!, tx);
  const b = lerp(d[y1 * 256 + x0]!, d[y1 * 256 + x1]!, tx);
  return lerp(a, b, ty);
}

/** Decode RGBA pixel buffer (256*256*4) into elevations using an encoding. */
export function decodeTilePixels(rgba: Uint8ClampedArray | Uint8Array, encoding: 'terrarium' | 'terrain-rgb'): Float32Array {
  const out = new Float32Array(256 * 256);
  const dec = encoding === 'terrarium' ? decodeTerrarium : decodeTerrainRgb;
  for (let i = 0; i < 256 * 256; i++) {
    out[i] = dec(rgba[i * 4]!, rgba[i * 4 + 1]!, rgba[i * 4 + 2]!);
  }
  return out;
}

/** Elevations of points from a set of decoded tiles (NaN when the tile is missing). */
export function elevationsFromTiles(points: LngLat[], tiles: Map<string, ElevationTile>, z: number): number[] {
  return points.map((p) => {
    const { tile, px, py } = pointToTile(p, z);
    const t = tiles.get(tileKey(tile));
    return t ? sampleTile(t, px, py) : NaN;
  });
}

/** Tiles needed to cover the points. */
export function tilesForPoints(points: LngLat[], z: number): TileCoord[] {
  const seen = new Map<string, TileCoord>();
  for (const p of points) {
    const { tile } = pointToTile(p, z);
    seen.set(tileKey(tile), tile);
  }
  return [...seen.values()];
}

/** All geometry vertices of the graph (nodes + intermediate points), deduplicated by edge order. */
export function graphVertices(graph: Graph): LngLat[] {
  const pts: LngLat[] = [];
  for (const e of graph.edges) for (const p of e.geometry) pts.push(p);
  return pts;
}

/** Assign elevations to nodes and edge vertices from a flat list aligned with graphVertices(). */
export function assignElevations(graph: Graph, vertexEles: number[]): void {
  let k = 0;
  for (const e of graph.edges) {
    const eles: number[] = [];
    for (let i = 0; i < e.geometry.length; i++) eles.push(vertexEles[k++]!);
    e.eles = eles;
    e.eleCorrected = false;
  }
  // Node elevation = average of the elevations seen at that node across its edges (identical by construction).
  for (const n of graph.nodes) n.ele = NaN;
  for (const e of graph.edges) {
    const a = e.eles![0]!;
    const b = e.eles![e.eles!.length - 1]!;
    const na = graph.nodes[e.from]!;
    const nb = graph.nodes[e.to]!;
    if (Number.isFinite(a)) na.ele = a;
    if (Number.isFinite(b)) nb.ele = b;
  }
}

/** Elevations of all graph vertices from a map OSM node id -> elevation (e.g. IGN per-node file); NaN when missing. */
export function vertexElevationsById(graph: Graph, byId: Record<string, number>): number[] {
  const out: number[] = [];
  for (const e of graph.edges) {
    for (const id of e.vertexIds) {
      const v = byId[String(id)];
      out.push(v === undefined ? NaN : v);
    }
  }
  return out;
}

/** Fill NaN vertex elevations by linear interpolation inside each edge (or copy the other end). */
export function fillMissingElevations(graph: Graph): number {
  let filled = 0;
  for (const e of graph.edges) {
    const eles = e.eles;
    if (!eles) continue;
    const n = eles.length;
    for (let i = 0; i < n; i++) {
      if (Number.isFinite(eles[i]!)) continue;
      let a = i - 1;
      while (a >= 0 && !Number.isFinite(eles[a]!)) a--;
      let b = i + 1;
      while (b < n && !Number.isFinite(eles[b]!)) b++;
      if (a >= 0 && b < n) eles[i] = lerp(eles[a]!, eles[b]!, (i - a) / (b - a));
      else if (a >= 0) eles[i] = eles[a]!;
      else if (b < n) eles[i] = eles[b]!;
      else continue;
      filled++;
    }
    const na = graph.nodes[e.from]!;
    const nb = graph.nodes[e.to]!;
    if (!Number.isFinite(na.ele) && Number.isFinite(eles[0]!)) na.ele = eles[0]!;
    if (!Number.isFinite(nb.ele) && Number.isFinite(eles[n - 1]!)) nb.ele = eles[n - 1]!;
  }
  return filled;
}

export interface AnomalyReport {
  bridgeEdges: number;
  tunnelEdges: number;
  jumpEdges: number;
  /** Edge ids corrected. */
  corrected: number[];
  /** Details for the UI. */
  details: { edgeId: number; kind: 'bridge' | 'tunnel' | 'jump'; maxDeltaM: number }[];
}

export interface AnomalyOptions {
  /** Grade (%) above which a non-stairs sub-segment is considered aberrant. */
  maxGradePct: number;
  /** Minimum absolute rise (m) for a jump to be considered (filters DEM noise on tiny segments). */
  minJumpM: number;
}

export const DEFAULT_ANOMALY_OPTIONS: AnomalyOptions = { maxGradePct: 60, minJumpM: 3 };

/**
 * Fix elevations along an edge by interpolating linearly between its two endpoints.
 * Used for bridges and tunnels: the DEM sees the river / the hill, not the deck / the gallery.
 */
export function linearizeEdge(edge: GraphEdge): number {
  const eles = edge.eles;
  if (!eles || eles.length < 3) return 0;
  const a = eles[0]!;
  const b = eles[eles.length - 1]!;
  let acc = 0;
  let maxDelta = 0;
  for (let i = 1; i < eles.length - 1; i++) {
    acc += edge.segLengths[i - 1]!;
    const v = edge.length > 0 ? lerp(a, b, acc / edge.length) : a;
    maxDelta = Math.max(maxDelta, Math.abs(v - eles[i]!));
    eles[i] = v;
  }
  return maxDelta;
}

/**
 * Detect and correct elevation anomalies. Stairs are never modified (R3 rule: stairs come from OSM,
 * and their steepness is real).
 */
export function correctAnomalies(graph: Graph, opts: AnomalyOptions = DEFAULT_ANOMALY_OPTIONS): AnomalyReport {
  const report: AnomalyReport = { bridgeEdges: 0, tunnelEdges: 0, jumpEdges: 0, corrected: [], details: [] };
  for (const e of graph.edges) {
    if (!e.eles || isSteps(e)) continue;
    if (e.tags.bridge || e.tags.tunnel) {
      const kind = e.tags.bridge ? 'bridge' : 'tunnel';
      const d = linearizeEdge(e);
      if (kind === 'bridge') report.bridgeEdges++;
      else report.tunnelEdges++;
      if (d > 0.5) {
        e.eleCorrected = true;
        report.corrected.push(e.id);
        report.details.push({ edgeId: e.id, kind, maxDeltaM: d });
      }
      continue;
    }
    // Aberrant jumps inside an edge: smooth vertex i when both adjacent grades exceed the limit with opposite signs
    // (spike), or when a single sub-segment grade exceeds the limit (cliff) -> linearize the whole edge.
    let aberrant = false;
    let maxDelta = 0;
    for (let i = 1; i < e.eles.length; i++) {
      const len = e.segLengths[i - 1]!;
      const rise = e.eles[i]! - e.eles[i - 1]!;
      if (len > 0 && Math.abs(rise) >= opts.minJumpM && (100 * Math.abs(rise)) / len > opts.maxGradePct) {
        aberrant = true;
        maxDelta = Math.max(maxDelta, Math.abs(rise));
      }
    }
    if (aberrant && e.eles.length >= 3) {
      const d = linearizeEdge(e);
      e.eleCorrected = true;
      report.jumpEdges++;
      report.corrected.push(e.id);
      report.details.push({ edgeId: e.id, kind: 'jump', maxDeltaM: Math.max(d, maxDelta) });
    } else if (aberrant) {
      // Two-vertex edge: cannot interpolate; flag only.
      report.jumpEdges++;
      report.details.push({ edgeId: e.id, kind: 'jump', maxDeltaM: maxDelta });
    }
  }
  return report;
}

/** Simple statistics helpers for the report. */
export function stats(values: number[]): { n: number; mean: number; mae: number; rmse: number; max: number; p90: number } {
  const v = values.filter((x) => Number.isFinite(x));
  const n = v.length;
  if (n === 0) return { n: 0, mean: NaN, mae: NaN, rmse: NaN, max: NaN, p90: NaN };
  const mean = v.reduce((a, b) => a + b, 0) / n;
  const abs = v.map(Math.abs).sort((a, b) => a - b);
  const mae = abs.reduce((a, b) => a + b, 0) / n;
  const rmse = Math.sqrt(v.reduce((a, b) => a + b * b, 0) / n);
  return { n, mean, mae, rmse, max: abs[n - 1]!, p90: abs[Math.min(n - 1, Math.floor(0.9 * n))]! };
}
