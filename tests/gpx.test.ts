import { describe, expect, it } from 'vitest';
import { matchStairs, parseGpx, segmentLengths, serializeGpx } from '../src/core/gpx';
import { profileFromPolyline } from '../src/core/profile';
import { analyzeProfile } from '../src/core/analysis';
import { syntheticGraph, gridPoint, hillEle } from './helpers/synthetic';

const sample = `<?xml version="1.0"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
<trk><name>Test &amp; co</name><trkseg>
<trkpt lat="45.7578" lon="4.8322"><ele>168.0</ele><time>2024-01-01T10:00:00Z</time></trkpt>
<trkpt lat="45.7600" lon="4.8300"><ele>175.5</ele></trkpt>
<trkpt lat="45.7624" lon="4.8226"/>
</trkseg></trk></gpx>`;

describe('gpx', () => {
  it('parses track points with and without elevation', () => {
    const t = parseGpx(sample);
    expect(t.name).toBe('Test & co');
    expect(t.points).toHaveLength(3);
    expect(t.points[0]).toMatchObject({ lat: 45.7578, lng: 4.8322, ele: 168, time: '2024-01-01T10:00:00Z' });
    expect(Number.isNaN(t.points[2]!.ele)).toBe(true);
  });
  it('round-trips through serialize', () => {
    const t = parseGpx(sample);
    const xml = serializeGpx(t);
    expect(xml).toContain('<trkpt lat="45.757800" lon="4.832200"><ele>168.0</ele></trkpt>');
    expect(xml).toContain('<name>Test &amp; co</name>');
    const back = parseGpx(xml);
    expect(back.points).toHaveLength(3);
    expect(back.points[1]!.ele).toBeCloseTo(175.5, 1);
  });
  it('matches GPX points to OSM stairs and classifies them as stairs', () => {
    const g = syntheticGraph();
    // Walk the synthetic stairs (1,1) -> (0.5,2) -> (0,3) with a few intermediate samples.
    const pts = [gridPoint(1, 1), gridPoint(0.75, 1.5), gridPoint(0.5, 2), gridPoint(0.25, 2.5), gridPoint(0, 3), gridPoint(0, 4)].map((p) => ({ ...p, ele: hillEle(p) }));
    const prof = profileFromPolyline(pts, segmentLengths(pts));
    const matched = matchStairs(g, prof, 15);
    expect(matched).toBeGreaterThanOrEqual(2);
    const a = analyzeProfile(g, prof);
    const stairs = a.segments.filter((s) => s.kind === 'stairs_up');
    expect(stairs.length).toBeGreaterThanOrEqual(1);
    expect(stairs[0]!.steps).toBe(120);
    const last = a.segments[a.segments.length - 1]!;
    expect(last.kind).not.toBe('stairs_up');
  });
});
