/**
 * Segment classification (stairs from OSM only; slopes from the elevation profile), breakdown by type,
 * stairs count estimation. Pure TypeScript.
 */
import type { Graph } from './graph';
import { isSteps } from './graph';
import type { ProfilePoint } from './profile';

export type SegmentKind = 'stairs_up' | 'stairs_down' | 'flat' | 'gentle' | 'moderate' | 'steep' | 'very_steep' | 'descent';

export interface ClassifyThresholds {
  /** |grade| below this is flat (%). */
  flatPct: number;
  gentlePct: number;
  moderatePct: number;
  steepPct: number;
  /** Average step rise used to estimate step counts (m). */
  stepRiseM: number;
}

export const DEFAULT_THRESHOLDS: ClassifyThresholds = { flatPct: 2, gentlePct: 6, moderatePct: 12, steepPct: 20, stepRiseM: 0.17 };

export const KIND_LABELS_FR: Record<SegmentKind, string> = {
  stairs_up: 'Escalier (montée)',
  stairs_down: 'Escalier (descente)',
  flat: 'Plat',
  gentle: 'Montée douce',
  moderate: 'Montée modérée',
  steep: 'Montée raide',
  very_steep: 'Montée très raide',
  descent: 'Descente',
};

export const KIND_ORDER: SegmentKind[] = ['stairs_up', 'stairs_down', 'very_steep', 'steep', 'moderate', 'gentle', 'flat', 'descent'];

export interface ClassifiedSegment {
  /** Index range in the profile (points i..j). */
  i: number;
  j: number;
  kind: SegmentKind;
  length: number;
  rise: number;
  gradePct: number;
  edgeId: number;
  /** For stairs: number of steps (OSM step_count or estimated). */
  steps?: number;
  stepsEstimated?: boolean;
  name?: string;
}

export function kindForGrade(gradePct: number, t: ClassifyThresholds): SegmentKind {
  if (gradePct <= -t.flatPct) return 'descent';
  if (gradePct < t.flatPct) return 'flat';
  if (gradePct < t.gentlePct) return 'gentle';
  if (gradePct < t.moderatePct) return 'moderate';
  if (gradePct < t.steepPct) return 'steep';
  return 'very_steep';
}

/** Estimated number of steps from the rise. */
export function estimateSteps(rise: number, stepRiseM: number): number {
  return Math.max(1, Math.round(Math.abs(rise) / stepRiseM));
}

/**
 * Classify each sub-segment of the profile. `eles` is the (possibly smoothed) elevation array aligned with points.
 * Stairs sub-segments are grouped per edge so that step counts are attributed once per OSM edge traversal.
 */
export function classifyProfile(graph: Graph | null, points: ProfilePoint[], eles: number[], t: ClassifyThresholds = DEFAULT_THRESHOLDS): ClassifiedSegment[] {
  const out: ClassifiedSegment[] = [];
  let i = 1;
  while (i < points.length) {
    const p0 = points[i - 1]!;
    const p1 = points[i]!;
    const edge = graph && p1.edgeId >= 0 ? graph.edges[p1.edgeId] : undefined;
    if (edge && isSteps(edge)) {
      // Merge all consecutive sub-segments of the same stairs edge.
      let j = i;
      while (j + 1 < points.length && points[j + 1]!.edgeId === p1.edgeId) j++;
      const length = points[j]!.d - p0.d;
      const rise = eles[j]! - eles[i - 1]!;
      const seg: ClassifiedSegment = {
        i: i - 1,
        j,
        kind: rise >= 0 ? 'stairs_up' : 'stairs_down',
        length,
        rise,
        gradePct: length > 0 ? (100 * rise) / length : 0,
        edgeId: p1.edgeId,
      };
      if (edge.tags.stepCount !== undefined) {
        seg.steps = edge.tags.stepCount;
        seg.stepsEstimated = false;
      } else {
        seg.steps = Number.isFinite(rise) ? estimateSteps(rise, t.stepRiseM) : 0;
        seg.stepsEstimated = true;
      }
      if (edge.tags.name) seg.name = edge.tags.name;
      out.push(seg);
      i = j + 1;
      continue;
    }
    const length = p1.d - p0.d;
    const rise = eles[i]! - eles[i - 1]!;
    const gradePct = length > 0 && Number.isFinite(rise) ? (100 * rise) / length : 0;
    const seg: ClassifiedSegment = { i: i - 1, j: i, kind: kindForGrade(gradePct, t), length, rise, gradePct, edgeId: p1.edgeId };
    if (edge?.tags.name) seg.name = edge.tags.name;
    out.push(seg);
    i++;
  }
  return out;
}

export interface KindBreakdown {
  kind: SegmentKind;
  length: number;
  gain: number;
  loss: number;
  count: number;
  steps: number;
}

export interface Breakdown {
  byKind: KindBreakdown[];
  totalLength: number;
  totalSteps: number;
  estimatedSteps: number;
  stairsEdges: number;
}

export function breakdown(segments: ClassifiedSegment[]): Breakdown {
  const map = new Map<SegmentKind, KindBreakdown>();
  for (const k of KIND_ORDER) map.set(k, { kind: k, length: 0, gain: 0, loss: 0, count: 0, steps: 0 });
  let totalLength = 0;
  let totalSteps = 0;
  let estimatedSteps = 0;
  let stairsEdges = 0;
  for (const s of segments) {
    const b = map.get(s.kind)!;
    b.length += s.length;
    b.count++;
    if (Number.isFinite(s.rise)) {
      if (s.rise > 0) b.gain += s.rise;
      else b.loss += -s.rise;
    }
    totalLength += s.length;
    if (s.steps !== undefined) {
      b.steps += s.steps;
      totalSteps += s.steps;
      if (s.stepsEstimated) estimatedSteps += s.steps;
      stairsEdges++;
    }
  }
  return { byKind: [...map.values()], totalLength, totalSteps, estimatedSteps, stairsEdges };
}

/** Merge consecutive segments of the same kind (for drawing). */
export function mergeSegments(segments: ClassifiedSegment[]): ClassifiedSegment[] {
  const out: ClassifiedSegment[] = [];
  for (const s of segments) {
    const last = out[out.length - 1];
    if (last && last.kind === s.kind && last.kind !== 'stairs_up' && last.kind !== 'stairs_down') {
      last.j = s.j;
      last.length += s.length;
      last.rise += s.rise;
      last.gradePct = last.length > 0 ? (100 * last.rise) / last.length : 0;
    } else {
      out.push({ ...s });
    }
  }
  return out;
}
