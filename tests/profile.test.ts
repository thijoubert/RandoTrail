import { describe, expect, it } from 'vitest';
import { gainLoss, smoothProfile, indexAtDistance, buildProfile, type ProfilePoint } from '../src/core/profile';
import { syntheticGraph } from './helpers/synthetic';
import { astar, concatLegs } from '../src/core/router';
import { DEFAULT_PREFERENCES } from '../src/core/cost';

const pts = (eles: number[], step = 10): ProfilePoint[] => eles.map((e, i) => ({ d: i * step, ele: e, lng: 0, lat: 0, edgeId: 0, nodeIdx: -1 }));

describe('profile', () => {
  it('gain/loss with hysteresis ignores small oscillations', () => {
    const raw = gainLoss([100, 101, 100, 101, 100, 110, 109, 110, 105], 0);
    expect(raw.gain).toBeCloseTo(13, 5);
    const filtered = gainLoss([100, 101, 100, 101, 100, 110, 109, 110, 105], 3);
    expect(filtered.gain).toBeCloseTo(10, 5);
    expect(filtered.loss).toBeCloseTo(5, 5);
    expect(filtered.minEle).toBe(100);
    expect(filtered.maxEle).toBe(110);
  });
  it('gain/loss on a monotonic climb', () => {
    const g = gainLoss([0, 10, 20, 30], 1);
    expect(g.gain).toBe(30);
    expect(g.loss).toBe(0);
  });
  it('smoothing flattens a spike but keeps locked points', () => {
    const p = pts([100, 100, 100, 130, 100, 100, 100]);
    const s = smoothProfile(p, 15);
    expect(s[3]!).toBeLessThan(120);
    const locked = smoothProfile(p, 15, new Set([3]));
    expect(locked[3]).toBe(130);
    expect(smoothProfile(p, 0)).toEqual(p.map((x) => x.ele));
  });
  it('indexAtDistance binary search', () => {
    const p = pts([0, 0, 0, 0, 0]);
    expect(indexAtDistance(p, 0)).toBe(0);
    expect(indexAtDistance(p, 14)).toBe(1);
    expect(indexAtDistance(p, 16)).toBe(2);
    expect(indexAtDistance(p, 1000)).toBe(4);
  });
  it('builds a route profile with monotonic distances and elevations', () => {
    const g = syntheticGraph();
    const a = g.nodeIndex.get(1000)!;
    const b = g.nodeIndex.get(1404)!;
    const leg = astar(g, a, b, { ...DEFAULT_PREFERENCES, avoidMajorRoads: false })!;
    const route = concatLegs([a, b], [leg]);
    const prof = buildProfile(g, route);
    expect(prof[0]!.d).toBe(0);
    expect(prof[prof.length - 1]!.d).toBeCloseTo(route.length, 3);
    for (let i = 1; i < prof.length; i++) expect(prof[i]!.d).toBeGreaterThanOrEqual(prof[i - 1]!.d);
    expect(prof.every((p) => Number.isFinite(p.ele))).toBe(true);
  });
});
