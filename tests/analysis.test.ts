import { describe, expect, it } from 'vitest';
import { analyzeRoute, DEFAULT_ANALYSIS_OPTIONS } from '../src/core/analysis';
import { estimateSteps, kindForGrade, DEFAULT_THRESHOLDS } from '../src/core/classify';
import { DEFAULT_PREFERENCES } from '../src/core/cost';
import { astar, concatLegs, routeNodes } from '../src/core/router';
import { estimateTime, formatDuration, segmentTime, DEFAULT_TIME_MODEL } from '../src/core/time';
import { detectClimbs } from '../src/core/climbs';
import { syntheticGraph } from './helpers/synthetic';

describe('classification', () => {
  it('maps grades to kinds with default thresholds', () => {
    expect(kindForGrade(0, DEFAULT_THRESHOLDS)).toBe('flat');
    expect(kindForGrade(-3, DEFAULT_THRESHOLDS)).toBe('descent');
    expect(kindForGrade(4, DEFAULT_THRESHOLDS)).toBe('gentle');
    expect(kindForGrade(8, DEFAULT_THRESHOLDS)).toBe('moderate');
    expect(kindForGrade(15, DEFAULT_THRESHOLDS)).toBe('steep');
    expect(kindForGrade(25, DEFAULT_THRESHOLDS)).toBe('very_steep');
    expect(kindForGrade(8, { ...DEFAULT_THRESHOLDS, moderatePct: 7 })).toBe('steep');
  });
  it('estimates steps from the rise', () => {
    expect(estimateSteps(17, 0.17)).toBe(100);
    expect(estimateSteps(-3.4, 0.17)).toBe(20);
  });
});

describe('route analysis on the synthetic hill', () => {
  const g = syntheticGraph();
  const idx = (x: number, y: number): number => g.nodeIndex.get(1000 + y * 100 + x)!;

  it('a route over the stairs reports OSM step_count (not estimated)', () => {
    const r = routeNodes(g, [idx(1, 1), idx(0, 3)], { ...DEFAULT_PREFERENCES, stairs: 'prefer' })!;
    const a = analyzeRoute(g, r);
    expect(a.breakdown.totalSteps).toBe(120);
    expect(a.breakdown.estimatedSteps).toBe(0);
    const stairs = a.segments.filter((s) => s.kind === 'stairs_up');
    expect(stairs).toHaveLength(1);
    expect(stairs[0]!.name).toBe('Escalier de la Colline');
    expect(a.gainLoss.gain).toBeGreaterThan(5);
    expect(a.time.stairsUpS).toBeGreaterThan(0);
  });

  it('a route over stairs without step_count estimates steps and flags it', () => {
    const r = routeNodes(g, [idx(2, 3), idx(2, 4)], { ...DEFAULT_PREFERENCES, stairs: 'prefer' })!;
    const a = analyzeRoute(g, r);
    const st = a.segments.find((s) => s.kind === 'stairs_up' || s.kind === 'stairs_down')!;
    expect(st.stepsEstimated).toBe(true);
    expect(st.steps).toBe(Math.max(1, Math.round(Math.abs(st.rise) / 0.17)));
    expect(a.breakdown.estimatedSteps).toBe(st.steps);
  });

  it('a flat route produces no climb and only flat/gentle segments', () => {
    // Boulevard du Sud (y=0) is far from the hill centre: nearly flat.
    const leg = astar(g, idx(0, 0), idx(4, 0), { ...DEFAULT_PREFERENCES, avoidMajorRoads: false })!;
    const a = analyzeRoute(g, concatLegs([idx(0, 0), idx(4, 0)], [leg]));
    expect(a.climbs).toHaveLength(0);
    expect(a.gainLoss.gain).toBeLessThan(10);
  });

  it('a route to the top of the hill detects one climb with plausible stats', () => {
    const r = routeNodes(g, [idx(4, 0), idx(0, 4)], { ...DEFAULT_PREFERENCES, avoidMajorRoads: false, stairs: 'avoid' })!;
    const a = analyzeRoute(g, r);
    expect(a.climbs.length).toBeGreaterThanOrEqual(1);
    const c = a.climbs[0]!;
    expect(c.gain).toBeGreaterThan(40);
    expect(c.length).toBeGreaterThan(250);
    expect(c.avgGradePct).toBeGreaterThan(5);
    expect(c.maxGradePct).toBeGreaterThanOrEqual(c.avgGradePct - 0.01);
    expect(c.durationS).toBeGreaterThan(60);
    expect(c.name).toBeDefined();
    expect(a.gainLoss.gain).toBeGreaterThanOrEqual(c.gain - 1);
    expect(a.breakdown.byKind.reduce((s, k) => s + k.length, 0)).toBeCloseTo(a.length, 3);
  });

  it('bridge crossing is corrected (no dip in the profile) and reported', () => {
    const r = routeNodes(g, [idx(2, 2), idx(4, 2)], { ...DEFAULT_PREFERENCES })!;
    const a = analyzeRoute(g, r);
    expect(a.correctedEdges).toBe(1);
    expect(a.gainLoss.gain).toBeLessThan(1); // monotonic: no dip under the bridge
    const uncorrected = syntheticGraph({ elevations: true, correct: false });
    const r2 = routeNodes(uncorrected, [idx(2, 2), idx(4, 2)], { ...DEFAULT_PREFERENCES })!;
    const a2 = analyzeRoute(uncorrected, r2);
    expect(a2.gainLoss.gain).toBeGreaterThan(5);
  });

  it('climb options are adjustable', () => {
    const r = routeNodes(g, [idx(4, 0), idx(0, 4)], { ...DEFAULT_PREFERENCES, avoidMajorRoads: false, stairs: 'avoid' })!;
    const a = analyzeRoute(g, r);
    const none = detectClimbs(a.points, a.eles, a.segments, DEFAULT_TIME_MODEL, { minGainM: 500, maxDipM: 5, maxGradeWindowM: 50 });
    expect(none).toHaveLength(0);
  });
});

describe('time model', () => {
  it('stairs use the vertical speed, streets use the running speed', () => {
    const stairs = segmentTime({ i: 0, j: 1, kind: 'stairs_up', length: 30, rise: 20, gradePct: 66, edgeId: 0, steps: 120 }, DEFAULT_TIME_MODEL);
    expect(stairs.mode).toBe('stairs_up');
    expect(stairs.s).toBeCloseTo((20 * 3600) / 600, 3);
    const down = segmentTime({ i: 0, j: 1, kind: 'stairs_down', length: 30, rise: -20, gradePct: -66, edgeId: 0 }, DEFAULT_TIME_MODEL);
    expect(down.s).toBeLessThan(stairs.s);
    const flat = segmentTime({ i: 0, j: 1, kind: 'flat', length: 1000, rise: 0, gradePct: 0, edgeId: 0 }, DEFAULT_TIME_MODEL);
    expect(flat.mode).toBe('run');
    expect(flat.s).toBeCloseTo(360, 3);
    const steep = segmentTime({ i: 0, j: 1, kind: 'very_steep', length: 100, rise: 25, gradePct: 25, edgeId: 0 }, DEFAULT_TIME_MODEL);
    expect(steep.mode).toBe('walk');
    const t = estimateTime([
      { i: 0, j: 1, kind: 'flat', length: 1000, rise: 0, gradePct: 0, edgeId: 0 },
      { i: 1, j: 2, kind: 'stairs_up', length: 30, rise: 20, gradePct: 66, edgeId: 1, steps: 120 },
    ]);
    expect(t.totalS).toBeCloseTo(360 + 120, 3);
    expect(formatDuration(3725)).toBe('1 h 02 min');
    expect(formatDuration(125)).toBe('2 min 05 s');
  });
  it('vertical speed is adjustable', () => {
    const fast = segmentTime({ i: 0, j: 1, kind: 'stairs_up', length: 30, rise: 20, gradePct: 66, edgeId: 0 }, { ...DEFAULT_TIME_MODEL, stairsUpVerticalMh: 1200 });
    expect(fast.s).toBeCloseTo(60, 3);
  });
});
