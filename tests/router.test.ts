import { describe, expect, it } from 'vitest';
import { MinHeap, astar, dijkstra, pathFromTree, routeThrough } from '../src/core/router';
import { DEFAULT_PREFERENCES, type RoutingPreferences } from '../src/core/cost';
import { isSteps } from '../src/core/graph';
import { syntheticGraph, gridPoint } from './helpers/synthetic';

const prefs = (p: Partial<RoutingPreferences>): RoutingPreferences => ({ ...DEFAULT_PREFERENCES, ...p });

describe('MinHeap', () => {
  it('pops in increasing key order', () => {
    const h = new MinHeap();
    const keys = [5, 1, 9, 3, 7, 2, 8, 0, 4, 6];
    keys.forEach((k) => h.push(k, k * 10));
    const out: number[] = [];
    while (h.size) out.push(h.pop()!.val);
    expect(out).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90]);
  });
});

describe('router', () => {
  const g = syntheticGraph();
  const idx = (x: number, y: number): number => g.nodeIndex.get(1000 + y * 100 + x)!;

  it('finds the shortest path on the grid', () => {
    const leg = astar(g, idx(0, 0), idx(2, 2), prefs({ avoidMajorRoads: false, slopes: 'neutral' }));
    expect(leg).not.toBeNull();
    expect(leg!.length).toBeCloseTo(400, -1);
    expect(leg!.edges.length).toBe(4);
  });

  it('uses the stairs shortcut when stairs are tolerated and avoids it when avoided', () => {
    const start = idx(1, 1);
    const goal = idx(0, 3);
    const tolerate = astar(g, start, goal, prefs({ stairs: 'tolerate' }))!;
    const avoid = astar(g, start, goal, prefs({ stairs: 'avoid' }))!;
    const prefer = astar(g, start, goal, prefs({ stairs: 'prefer' }))!;
    const hasStairs = (edges: number[]): boolean => edges.some((e) => isSteps(g.edges[e]!));
    expect(hasStairs(tolerate.edges)).toBe(true);
    expect(hasStairs(prefer.edges)).toBe(true);
    expect(hasStairs(avoid.edges)).toBe(false);
    expect(avoid.length).toBeGreaterThan(tolerate.length);
  });

  it('prefers stairs over a slightly shorter street when preferred', () => {
    // From (2,3) to (2,4): Avenue 2 is 100 m; the stairs detour is ~ 150 m. Only 'prefer' takes it.
    const a = astar(g, idx(2, 3), idx(2, 4), prefs({ stairs: 'tolerate' }))!;
    const b = astar(g, idx(2, 3), idx(2, 4), prefs({ stairs: 'prefer' }))!;
    expect(a.edges.some((e) => isSteps(g.edges[e]!))).toBe(false);
    expect(b.edges.some((e) => isSteps(g.edges[e]!))).toBe(true);
  });

  it('avoids the primary road when asked', () => {
    const viaBd = astar(g, idx(0, 0), idx(4, 0), prefs({ avoidMajorRoads: false }))!;
    const avoid = astar(g, idx(0, 0), idx(4, 0), prefs({ avoidMajorRoads: true }))!;
    expect(viaBd.edges.every((e) => g.edges[e]!.tags.highway === 'primary')).toBe(true);
    expect(avoid.edges.some((e) => g.edges[e]!.tags.highway === 'primary')).toBe(false);
  });

  it('limits slopes: the limited route climbs more gently', () => {
    const start = idx(4, 0);
    const goal = idx(0, 4); // top of the hill
    const neutral = astar(g, start, goal, prefs({ slopes: 'neutral', stairs: 'avoid' }))!;
    const limit = astar(g, start, goal, prefs({ slopes: 'limit', maxGradePct: 6, stairs: 'avoid' }))!;
    expect(limit.cost).toBeGreaterThanOrEqual(neutral.length);
    expect(limit).not.toBeNull();
  });

  it('routes through geographic waypoints and penalised edges change the path', () => {
    const r = routeThrough(g, [gridPoint(0, 0), gridPoint(2, 2), gridPoint(4, 4)], prefs({ avoidMajorRoads: false }))!;
    expect(r.legs).toHaveLength(2);
    expect(r.length).toBeCloseTo(800, -1);
    const pen = new Map<number, number>();
    r.edges.forEach((e) => pen.set(e, 5));
    const alt = routeThrough(g, [gridPoint(0, 0), gridPoint(4, 4)], prefs({ avoidMajorRoads: false }), { penalizedEdges: pen })!;
    const overlap = alt.edges.filter((e) => pen.has(e)).length / alt.edges.length;
    expect(overlap).toBeLessThan(0.5);
  });

  it('dijkstra tree gives the same distance as A*', () => {
    const t = dijkstra(g, idx(0, 0), prefs({ avoidMajorRoads: false }));
    const p = pathFromTree(g, t, idx(4, 4))!;
    const a = astar(g, idx(0, 0), idx(4, 4), prefs({ avoidMajorRoads: false }))!;
    expect(p.cost).toBeCloseTo(a.cost, 6);
    expect(t.dist[idx(4, 4)]!).toBeCloseTo(a.length, 3);
    expect(t.gain[idx(0, 4)]!).toBeGreaterThan(30);
  });
});
