/**
 * Minimal GPX 1.1 parser/serializer (regex based, no DOM) for track points with elevation.
 */
import type { LngLat } from './geo';
import { fastDistance } from './geo';
import type { Graph } from './graph';
import { isSteps } from './graph';
import type { ProfilePoint } from './profile';

export interface GpxPoint extends LngLat {
  ele: number;
  time?: string;
}

export interface GpxTrack {
  name: string;
  points: GpxPoint[];
}

function unescapeXml(s: string): string {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Parse the first track (all segments concatenated) or the route points if there is no track. */
export function parseGpx(xml: string): GpxTrack {
  const nameMatch = /<trk>[\s\S]*?<name>([\s\S]*?)<\/name>/.exec(xml) ?? /<name>([\s\S]*?)<\/name>/.exec(xml);
  const name = nameMatch ? unescapeXml(nameMatch[1]!.trim()) : 'Trace GPX';
  const points: GpxPoint[] = [];
  const re = /<(trkpt|rtept)\b([^>]*)>([\s\S]*?)<\/\1>|<(trkpt|rtept)\b([^>]*)\/>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const attrs = m[2] ?? m[5] ?? '';
    const inner = m[3] ?? '';
    const lat = /lat="([^"]+)"/.exec(attrs);
    const lon = /lon="([^"]+)"/.exec(attrs);
    if (!lat || !lon) continue;
    const ele = /<ele>([^<]+)<\/ele>/.exec(inner);
    const time = /<time>([^<]+)<\/time>/.exec(inner);
    const p: GpxPoint = { lat: Number(lat[1]), lng: Number(lon[1]), ele: ele ? Number(ele[1]) : NaN };
    if (time) p.time = time[1]!;
    if (Number.isFinite(p.lat) && Number.isFinite(p.lng)) points.push(p);
  }
  return { name, points };
}

export function serializeGpx(track: GpxTrack, creator = 'RandoTrail lab'): string {
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(`<gpx version="1.1" creator="${escapeXml(creator)}" xmlns="http://www.topografix.com/GPX/1/1">`);
  lines.push(`  <metadata><name>${escapeXml(track.name)}</name></metadata>`);
  lines.push(`  <trk><name>${escapeXml(track.name)}</name><trkseg>`);
  for (const p of track.points) {
    const ele = Number.isFinite(p.ele) ? `<ele>${p.ele.toFixed(1)}</ele>` : '';
    lines.push(`    <trkpt lat="${p.lat.toFixed(6)}" lon="${p.lng.toFixed(6)}">${ele}</trkpt>`);
  }
  lines.push('  </trkseg></trk>');
  lines.push('</gpx>');
  return lines.join('\n') + '\n';
}

/** Segment lengths of a polyline. */
export function segmentLengths(points: LngLat[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < points.length; i++) out.push(fastDistance(points[i - 1]!, points[i]!));
  return out;
}

/**
 * Mark GPX profile points that follow an OSM stairs edge: a sub-segment is stairs when both its ends are
 * within `radius` metres of the same stairs edge. Sets `edgeId` so that classifyProfile treats it as stairs.
 */
export function matchStairs(graph: Graph, points: ProfilePoint[], radius = 12): number {
  let matched = 0;
  // Grid of stairs sub-segments (a -> b) indexed by the cells of their bounding box.
  const cell = 0.001; // ~80-110 m
  const grid = new Map<string, { a: LngLat; b: LngLat; eid: number }[]>();
  for (const e of graph.edges) {
    if (!isSteps(e)) continue;
    for (let i = 1; i < e.geometry.length; i++) {
      const a = e.geometry[i - 1]!;
      const b = e.geometry[i]!;
      const x0 = Math.floor(Math.min(a.lng, b.lng) / cell);
      const x1 = Math.floor(Math.max(a.lng, b.lng) / cell);
      const y0 = Math.floor(Math.min(a.lat, b.lat) / cell);
      const y1 = Math.floor(Math.max(a.lat, b.lat) / cell);
      for (let x = x0; x <= x1; x++) {
        for (let y = y0; y <= y1; y++) {
          const k = `${x}:${y}`;
          let arr = grid.get(k);
          if (!arr) {
            arr = [];
            grid.set(k, arr);
          }
          arr.push({ a, b, eid: e.id });
        }
      }
    }
  }
  const stairsNear = (p: LngLat): Set<number> => {
    const out = new Set<number>();
    const cx = Math.floor(p.lng / cell);
    const cy = Math.floor(p.lat / cell);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const arr = grid.get(`${cx + dx}:${cy + dy}`);
        if (!arr) continue;
        for (const seg of arr) if (pointToSegmentDistance(p, seg.a, seg.b) <= radius) out.add(seg.eid);
      }
    }
    return out;
  };
  let prev = stairsNear(points[0] ?? { lng: 0, lat: 0 });
  for (let i = 1; i < points.length; i++) {
    const cur = stairsNear(points[i]!);
    let common = -1;
    for (const e of cur) {
      if (prev.has(e)) {
        common = e;
        break;
      }
    }
    if (common >= 0) {
      points[i]!.edgeId = common;
      matched++;
    }
    prev = cur;
  }
  return matched;
}

/** Distance (m) from point p to segment [a, b] using a local equirectangular projection. */
export function pointToSegmentDistance(p: LngLat, a: LngLat, b: LngLat): number {
  const k = Math.cos((p.lat * Math.PI) / 180) * 111320;
  const ax = (a.lng - p.lng) * k;
  const ay = (a.lat - p.lat) * 111320;
  const bx = (b.lng - p.lng) * k;
  const by = (b.lat - p.lat) * 111320;
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? -(ax * dx + ay * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.sqrt(cx * cx + cy * cy);
}
