import { describe, expect, it } from 'vitest';
import { buildGraph, edgeTagsFromOsm, overpassQuery, parseNumber, parseOverpass, stairsStats } from '../src/core/osm';
import { nearestNode, graphSummary } from '../src/core/graph';
import { LYON_CENTRE } from '../src/core/geo';
import { syntheticOverpass, gridPoint, syntheticGraph } from './helpers/synthetic';

describe('osm parsing', () => {
  it('builds the Overpass query with bbox and walkable highways only', () => {
    const q = overpassQuery(LYON_CENTRE);
    expect(q).toContain('[bbox:45.746,4.796,45.786,4.85]');
    expect(q).toContain('steps');
    expect(q).not.toContain('motorway');
    expect(q).toContain('out body geom');
  });
  it('parses numbers from OSM tag strings', () => {
    expect(parseNumber('20')).toBe(20);
    expect(parseNumber('12,5')).toBe(12.5);
    expect(parseNumber('up')).toBeUndefined();
    expect(parseNumber('~30')).toBe(30);
  });
  it('maps OSM tags to edge tags', () => {
    const t = edgeTagsFromOsm({ highway: 'steps', step_count: '42', incline: 'down', handrail: 'yes', bridge: 'no' });
    expect(t).toEqual({ highway: 'steps', stepCount: 42, incline: 'down', handrail: 'yes' });
    expect(edgeTagsFromOsm({ highway: 'primary_link' }).highway).toBe('primary');
    expect(edgeTagsFromOsm({ highway: 'busway' }).highway).toBe('other');
  });
  it('parses out-geom ways and builds a connected graph', () => {
    const ways = parseOverpass(syntheticOverpass());
    expect(ways.length).toBeGreaterThan(10);
    const g = buildGraph(ways, { maxEdgeLength: 1000 });
    const s = graphSummary(g);
    // 25 grid intersections + stairs intermediate endpoints
    expect(s.nodes).toBeGreaterThanOrEqual(25);
    expect(s.steps).toBe(2);
    expect(s.edges).toBeGreaterThan(40);
    for (const n of g.nodes) expect(n.edges.length).toBeGreaterThan(0);
    for (const e of g.edges) expect(e.segLengths.length).toBe(e.geometry.length - 1);
  });
  it('splits long edges at maxEdgeLength', () => {
    const ways = parseOverpass(syntheticOverpass());
    const a = buildGraph(ways, { maxEdgeLength: 1000 });
    const b = buildGraph(ways, { maxEdgeLength: 50 });
    expect(b.edges.length).toBeGreaterThan(a.edges.length);
    for (const e of b.edges) expect(e.length).toBeLessThanOrEqual(160);
  });
  it('finds the nearest node to a point', () => {
    const g = syntheticGraph();
    const idx = nearestNode(g, { lng: gridPoint(2, 2).lng + 1e-5, lat: gridPoint(2, 2).lat });
    expect(g.nodes[idx]!.id).toBe(1202);
    expect(nearestNode(g, { lng: 5, lat: 46 }, 100)).toBe(-1);
  });
  it('computes stairs statistics', () => {
    const s = stairsStats(parseOverpass(syntheticOverpass()));
    expect(s.ways).toBe(2);
    expect(s.withStepCount).toBe(1);
    expect(s.withIncline).toBe(1);
    expect(s.withName).toBe(2);
    expect(s.withHandrail).toBe(1);
    expect(s.totalStepCount).toBe(120);
  });
});
