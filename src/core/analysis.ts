/**
 * One-stop route analysis combining profile, smoothing, classification, climbs and time.
 * This is the function the UI (and the future Swift app) calls after routing.
 */
import { breakdown, classifyProfile, mergeSegments, type Breakdown, type ClassifiedSegment, type ClassifyThresholds, DEFAULT_THRESHOLDS } from './classify';
import { detectClimbs, type Climb, type ClimbOptions, DEFAULT_CLIMB_OPTIONS } from './climbs';
import type { Graph } from './graph';
import { isSteps } from './graph';
import { buildProfile, gainLoss, smoothProfile, type GainLoss, type ProfileOptions, type ProfilePoint, DEFAULT_PROFILE_OPTIONS } from './profile';
import type { Route } from './router';
import { estimateTime, type TimeEstimate, type TimeModel, DEFAULT_TIME_MODEL } from './time';

export interface AnalysisOptions {
  profile: ProfileOptions;
  thresholds: ClassifyThresholds;
  climbs: ClimbOptions;
  time: TimeModel;
}

export const DEFAULT_ANALYSIS_OPTIONS: AnalysisOptions = {
  profile: DEFAULT_PROFILE_OPTIONS,
  thresholds: DEFAULT_THRESHOLDS,
  climbs: DEFAULT_CLIMB_OPTIONS,
  time: DEFAULT_TIME_MODEL,
};

export interface RouteAnalysis {
  points: ProfilePoint[];
  /** Smoothed elevations aligned with points. */
  eles: number[];
  length: number;
  gainLoss: GainLoss;
  segments: ClassifiedSegment[];
  merged: ClassifiedSegment[];
  breakdown: Breakdown;
  climbs: Climb[];
  time: TimeEstimate;
  /** Number of edges whose elevation was corrected (bridge/tunnel/jump). */
  correctedEdges: number;
  /** Count of profile points without elevation. */
  missingEle: number;
}

/** Indexes of profile points belonging to stairs edges (never smoothed). */
export function stairsLockedIndexes(graph: Graph | null, points: ProfilePoint[]): Set<number> {
  const locked = new Set<number>();
  if (!graph) return locked;
  for (let i = 0; i < points.length; i++) {
    const e = points[i]!.edgeId >= 0 ? graph.edges[points[i]!.edgeId] : undefined;
    if (e && isSteps(e)) {
      locked.add(i);
      if (i > 0) locked.add(i - 1);
    }
  }
  return locked;
}

export function analyzeProfile(graph: Graph | null, points: ProfilePoint[], opts: AnalysisOptions = DEFAULT_ANALYSIS_OPTIONS, correctedEdges = 0): RouteAnalysis {
  const locked = stairsLockedIndexes(graph, points);
  const eles = smoothProfile(points, opts.profile.smoothWindowM, locked);
  const gl = gainLoss(eles, opts.profile.gainThresholdM);
  const segments = classifyProfile(graph, points, eles, opts.thresholds);
  const merged = mergeSegments(segments);
  const bd = breakdown(segments);
  const climbs = detectClimbs(points, eles, segments, opts.time, opts.climbs);
  const time = estimateTime(segments, opts.time);
  const missingEle = points.reduce((a, p) => a + (Number.isFinite(p.ele) ? 0 : 1), 0);
  return {
    points,
    eles,
    length: points.length ? points[points.length - 1]!.d : 0,
    gainLoss: gl,
    segments,
    merged,
    breakdown: bd,
    climbs,
    time,
    correctedEdges,
    missingEle,
  };
}

export function analyzeRoute(graph: Graph, route: Route, opts: AnalysisOptions = DEFAULT_ANALYSIS_OPTIONS): RouteAnalysis {
  const points = buildProfile(graph, route);
  let corrected = 0;
  for (const eid of route.edges) if (graph.edges[eid]!.eleCorrected) corrected++;
  return analyzeProfile(graph, points, opts, corrected);
}
