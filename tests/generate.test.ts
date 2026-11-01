import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFERENCES } from '../src/core/cost';
import { edgeOverlap, generateLoops, outAndBack, rng, targetScore } from '../src/core/generate';
import { generateVariants, hillRepeats } from '../src/core/variants';
import { routeNodes } from '../src/core/router';
import { analyzeRoute } from '../src/core/analysis';
import { evaluateObjectives } from '../src/core/objectives';
import { isSteps } from '../src/core/graph';
import { syntheticGraph } from './helpers/synthetic';

const g = syntheticGraph();
const idx = (x: number, y: number): number => g.nodeIndex.get(1000 + y * 100 + x)!;
const prefs = { ...DEFAULT_PREFERENCES, avoidMajorRoads: false };

describe('generators', () => {
  it('helpers: targetScore, edgeOverlap, rng', () => {
    expect(targetScore(1000, 100, { distanceM: 1000, gainM: 100 })).toBe(0);
    expect(targetScore(1100, 100, { distanceM: 1000 })).toBeCloseTo(0.1, 6);
    expect(edgeOverlap([1, 2, 3], [2, 3, 4])).toBeCloseTo(2 / 3, 6);
    const r = rng(1);
    const a = r();
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(1);
    expect(rng(1)()).toBe(a);
  });

  it('out-and-back same return hits the distance target within 15 %', () => {
    const res = outAndBack(g, idx(2, 0), { distanceM: 600 }, prefs, false);
    expect(res.length).toBeGreaterThan(0);
    const best = res[0]!;
    expect(Math.abs(best.analysis.length - 600) / 600).toBeLessThan(0.15);
    // same path back: edges are mirrored
    const n = best.route.edges.length;
    expect(best.route.edges.slice(0, n / 2)).toEqual([...best.route.edges.slice(n / 2)].reverse());
    expect(best.route.nodes[0]).toBe(idx(2, 0));
    expect(best.route.nodes[best.route.nodes.length - 1]).toBe(idx(2, 0));
  });

  it('out-and-back different return reuses few edges', () => {
    const res = outAndBack(g, idx(2, 0), { distanceM: 600 }, prefs, true);
    expect(res.length).toBeGreaterThan(0);
    const best = res[0]!;
    const n = best.route.legs[0]!.edges.length;
    const back = best.route.edges.slice(n);
    expect(edgeOverlap(back, best.route.legs[0]!.edges)).toBeLessThan(0.5);
    expect(Math.abs(best.analysis.length - 600) / 600).toBeLessThan(0.3);
  });

  it('out-and-back with a D+ target climbs the hill', () => {
    const res = outAndBack(g, idx(4, 0), { gainM: 60 }, { ...prefs, stairs: 'avoid' }, false);
    expect(res.length).toBeGreaterThan(0);
    expect(res[0]!.analysis.gainLoss.gain).toBeGreaterThan(40);
  });

  it('loops close on the start node, approach the target and differ from each other', () => {
    const loops = generateLoops(g, idx(2, 2), { distanceM: 900 }, prefs, { seed: 7 });
    expect(loops.length).toBeGreaterThanOrEqual(1);
    for (const l of loops) {
      expect(l.route.nodes[0]).toBe(idx(2, 2));
      expect(l.route.nodes[l.route.nodes.length - 1]).toBe(idx(2, 2));
      expect(l.analysis.length).toBeGreaterThan(500);
    }
    for (let i = 1; i < loops.length; i++) expect(edgeOverlap(loops[i]!.route.edges, loops[0]!.route.edges)).toBeLessThanOrEqual(0.7);
    expect(loops[0]!.score).toBeLessThan(0.6);
  });
});

describe('variants and hill repeats', () => {
  it('produces at least 3 really different variants between the bottom and the top of the hill', () => {
    const base = routeNodes(g, [idx(4, 0), idx(0, 4)], prefs)!;
    const vs = generateVariants(g, base, prefs);
    expect(vs.length).toBeGreaterThanOrEqual(3);
    const labels = vs.map((v) => v.label);
    expect(new Set(labels).size).toBe(labels.length);
    for (const v of vs) {
      expect(v.route.nodes[0]).toBe(idx(4, 0));
      expect(v.route.nodes[v.route.nodes.length - 1]).toBe(idx(0, 4));
    }
    const withStairs = vs.find((v) => v.label === 'Max escaliers');
    const without = vs.find((v) => v.label === 'Sans escaliers');
    if (withStairs) expect(withStairs.route.edges.some((e) => isSteps(g.edges[e]!))).toBe(true);
    if (without) expect(without.route.edges.some((e) => isSteps(g.edges[e]!))).toBe(false);
    for (let i = 0; i < vs.length; i++) for (let j = i + 1; j < vs.length; j++) {
      const o = Math.min(edgeOverlap(vs[i]!.route.edges, vs[j]!.route.edges), edgeOverlap(vs[j]!.route.edges, vs[i]!.route.edges));
      expect(o).toBeLessThanOrEqual(0.75);
    }
  });

  it('hill repeats multiply distance and D+ by N', () => {
    const base = routeNodes(g, [idx(4, 0), idx(0, 4)], { ...prefs, stairs: 'avoid' })!;
    const a = analyzeRoute(g, base);
    const climb = a.climbs[0]!;
    const rep = hillRepeats(g, base, a.points, climb, 3)!;
    expect(rep).not.toBeNull();
    expect(rep.analysis.length).toBeCloseTo(rep.single.length * 6, -1);
    expect(rep.analysis.gainLoss.gain).toBeCloseTo(rep.single.gainLoss.gain * 3, 0);
    expect(rep.analysis.gainLoss.loss).toBeCloseTo(rep.single.gainLoss.gain * 3, 0);
  });
});

describe('objectives', () => {
  it('reports gaps and suggestions', () => {
    const base = routeNodes(g, [idx(4, 0), idx(0, 4)], prefs)!;
    const a = analyzeRoute(g, base);
    const r = evaluateObjectives(a, { distanceM: a.length * 2, gainM: a.gainLoss.gain, tolerance: 0.1 });
    expect(r.gaps).toHaveLength(2);
    expect(r.gaps[0]!.ok).toBe(false);
    expect(r.gaps[1]!.ok).toBe(true);
    expect(r.allOk).toBe(false);
    expect(r.suggestions[0]).toContain('Prolongez');
    const none = evaluateObjectives(null, { distanceM: 5000, tolerance: 0.1 });
    expect(none.suggestions[0]).toContain('Tracez');
    const ok = evaluateObjectives(a, { distanceM: a.length, ratioMPerKm: a.gainLoss.gain / (a.length / 1000), tolerance: 0.05 });
    expect(ok.allOk).toBe(true);
  });
});
