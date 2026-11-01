/**
 * Automatic detection of the climbs of a route from its (smoothed) profile. Pure TypeScript.
 */
import type { ClassifiedSegment } from './classify';
import type { ProfilePoint } from './profile';
import { estimateTime, type TimeModel } from './time';

export interface Climb {
  /** Profile point indexes. */
  i: number;
  j: number;
  startD: number;
  endD: number;
  length: number;
  gain: number;
  /** Descent inside the climb (small dips tolerated). */
  loss: number;
  avgGradePct: number;
  maxGradePct: number;
  steps: number;
  stepsEstimated: number;
  stairsLength: number;
  /** Most frequent OSM name along the climb (by length), if any. */
  name?: string;
  /** Estimated duration in seconds. */
  durationS: number;
  /** Difficulty score (gain weighted by steepness and stairs). */
  score: number;
}

export interface ClimbOptions {
  /** Minimum total gain for a climb to be reported (m). */
  minGainM: number;
  /** A descent larger than this ends the climb (m). */
  maxDipM: number;
  /** Window used for the max grade (m). */
  maxGradeWindowM: number;
}

export const DEFAULT_CLIMB_OPTIONS: ClimbOptions = { minGainM: 10, maxDipM: 5, maxGradeWindowM: 50 };

/** Detect climbs on an elevation array aligned with `points`. Segments give stairs/name info. */
export function detectClimbs(
  points: ProfilePoint[],
  eles: number[],
  segments: ClassifiedSegment[],
  model: TimeModel,
  opts: ClimbOptions = DEFAULT_CLIMB_OPTIONS,
): Climb[] {
  const climbs: Climb[] = [];
  const n = points.length;
  if (n < 2) return climbs;
  let i = 0;
  while (i < n - 1) {
    // Start a climb at a local minimum followed by a rise.
    if (!(eles[i + 1]! > eles[i]!)) {
      i++;
      continue;
    }
    const start = i;
    let peak = i;
    let k = i + 1;
    while (k < n) {
      if (eles[k]! >= eles[peak]!) peak = k;
      else if (eles[peak]! - eles[k]! > opts.maxDipM) break;
      k++;
    }
    const gain = eles[peak]! - eles[start]!;
    if (gain >= opts.minGainM) {
      climbs.push(makeClimb(points, eles, segments, start, peak, model, opts));
    }
    i = Math.max(peak, start + 1);
  }
  return climbs.sort((a, b) => b.score - a.score);
}

function makeClimb(points: ProfilePoint[], eles: number[], segments: ClassifiedSegment[], i: number, j: number, model: TimeModel, opts: ClimbOptions): Climb {
  const startD = points[i]!.d;
  const endD = points[j]!.d;
  const length = endD - startD;
  const gain = eles[j]! - eles[i]!;
  let loss = 0;
  for (let k = i + 1; k <= j; k++) {
    const dh = eles[k]! - eles[k - 1]!;
    if (dh < 0) loss -= dh;
  }
  // Max grade over a sliding window.
  let maxGrade = 0;
  let a = i;
  for (let b = i + 1; b <= j; b++) {
    while (points[b]!.d - points[a]!.d > opts.maxGradeWindowM && a < b - 1) a++;
    const dd = points[b]!.d - points[a]!.d;
    if (dd >= Math.min(opts.maxGradeWindowM, length) * 0.5 || b === j) {
      const g = dd > 0 ? (100 * (eles[b]! - eles[a]!)) / dd : 0;
      if (g > maxGrade) maxGrade = g;
    }
  }
  let steps = 0;
  let stepsEstimated = 0;
  let stairsLength = 0;
  const names = new Map<string, number>();
  const inside = segments.filter((s) => s.i >= i && s.j <= j);
  for (const s of inside) {
    if (s.steps !== undefined) {
      steps += s.steps;
      if (s.stepsEstimated) stepsEstimated += s.steps;
      stairsLength += s.length;
    }
    if (s.name) names.set(s.name, (names.get(s.name) ?? 0) + s.length);
  }
  let name: string | undefined;
  let bestLen = 0;
  for (const [nm, len] of names) {
    if (len > bestLen) {
      bestLen = len;
      name = nm;
    }
  }
  const durationS = estimateTime(inside, model).totalS;
  const avgGradePct = length > 0 ? (100 * gain) / length : 0;
  const score = gain * (1 + avgGradePct / 20) + steps * 0.15;
  const c: Climb = { i, j, startD, endD, length, gain: gain + loss, loss, avgGradePct, maxGradePct: maxGrade, steps, stepsEstimated, stairsLength, durationS, score };
  if (name) c.name = name;
  return c;
}
