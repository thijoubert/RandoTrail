/**
 * Time estimation: distinct models for running, fast walking, stairs up and stairs down,
 * summed over typed segments. Pure TypeScript.
 */
import type { ClassifiedSegment, SegmentKind } from './classify';

export interface TimeModel {
  /** Flat running speed (km/h). */
  runSpeedKmh: number;
  /** Fast walking speed on steep ground (km/h). */
  walkSpeedKmh: number;
  /** Grade (%) above which the runner walks. */
  walkAbovePct: number;
  /** Extra time per metre of ascent when running/walking (s/m). 1 m of D+ ~ 8 s is close to Naismith. */
  ascentSPerM: number;
  /** Extra time per metre of steep descent (s/m), applied beyond -10 %. */
  steepDescentSPerM: number;
  /** Vertical speed climbing stairs (m/h). */
  stairsUpVerticalMh: number;
  /** Vertical speed descending stairs (m/h). */
  stairsDownVerticalMh: number;
}

export const DEFAULT_TIME_MODEL: TimeModel = {
  runSpeedKmh: 10,
  walkSpeedKmh: 5.5,
  walkAbovePct: 15,
  ascentSPerM: 7,
  steepDescentSPerM: 2,
  stairsUpVerticalMh: 600,
  stairsDownVerticalMh: 900,
};

export interface TimeEstimate {
  totalS: number;
  byKind: Partial<Record<SegmentKind, number>>;
  runS: number;
  walkS: number;
  stairsUpS: number;
  stairsDownS: number;
}

/** Duration of a single segment (seconds). */
export function segmentTime(s: ClassifiedSegment, m: TimeModel): { s: number; mode: 'run' | 'walk' | 'stairs_up' | 'stairs_down' } {
  const rise = Number.isFinite(s.rise) ? s.rise : 0;
  if (s.kind === 'stairs_up') {
    // vertical speed + a minimum horizontal pace of 3 km/h
    const t = Math.max((rise * 3600) / m.stairsUpVerticalMh, (s.length * 3.6) / 3);
    return { s: t, mode: 'stairs_up' };
  }
  if (s.kind === 'stairs_down') {
    const t = Math.max((-rise * 3600) / m.stairsDownVerticalMh, (s.length * 3.6) / 4);
    return { s: t, mode: 'stairs_down' };
  }
  const grade = s.gradePct;
  if (grade >= m.walkAbovePct) {
    const t = (s.length * 3.6) / m.walkSpeedKmh + Math.max(0, rise) * m.ascentSPerM;
    return { s: t, mode: 'walk' };
  }
  let t = (s.length * 3.6) / m.runSpeedKmh + Math.max(0, rise) * m.ascentSPerM;
  if (grade < -10) t += -rise * m.steepDescentSPerM;
  return { s: t, mode: 'run' };
}

export function estimateTime(segments: ClassifiedSegment[], m: TimeModel = DEFAULT_TIME_MODEL): TimeEstimate {
  const out: TimeEstimate = { totalS: 0, byKind: {}, runS: 0, walkS: 0, stairsUpS: 0, stairsDownS: 0 };
  for (const s of segments) {
    const r = segmentTime(s, m);
    out.totalS += r.s;
    out.byKind[s.kind] = (out.byKind[s.kind] ?? 0) + r.s;
    if (r.mode === 'run') out.runS += r.s;
    else if (r.mode === 'walk') out.walkS += r.s;
    else if (r.mode === 'stairs_up') out.stairsUpS += r.s;
    else out.stairsDownS += r.s;
  }
  return out;
}

export function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const mi = Math.floor((s % 3600) / 60);
  const se = s % 60;
  if (h > 0) return `${h} h ${String(mi).padStart(2, '0')} min`;
  if (mi > 0) return `${mi} min ${String(se).padStart(2, '0')} s`;
  return `${se} s`;
}
