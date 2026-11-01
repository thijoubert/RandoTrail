import { describe, expect, it } from 'vitest';
import { bearing, destination, fastDistance, haversine, splitBBox, LYON_CENTRE, bboxArea } from '../src/core/geo';

const bellecour = { lng: 4.83215, lat: 45.75777 };
const fourviere = { lng: 4.8225, lat: 45.76235 };

describe('geo', () => {
  it('haversine Bellecour -> Fourvière ≈ 0.9 km', () => {
    const d = haversine(bellecour, fourviere);
    expect(d).toBeGreaterThan(850);
    expect(d).toBeLessThan(950);
    expect(Math.abs(fastDistance(bellecour, fourviere) - d)).toBeLessThan(1);
  });
  it('bearing and destination are consistent', () => {
    const b = bearing(bellecour, fourviere);
    const p = destination(bellecour, b, haversine(bellecour, fourviere));
    expect(haversine(p, fourviere)).toBeLessThan(0.5);
  });
  it('splits a bbox into n² cells', () => {
    const cells = splitBBox(LYON_CENTRE, 2);
    expect(cells).toHaveLength(4);
    const sum = cells.reduce((a, c) => a + bboxArea(c), 0);
    expect(Math.abs(sum - bboxArea(LYON_CENTRE)) / bboxArea(LYON_CENTRE)).toBeLessThan(0.01);
  });
  it('Lyon centre zone is about 4 x 4.5 km', () => {
    const a = bboxArea(LYON_CENTRE) / 1e6;
    expect(a).toBeGreaterThan(15);
    expect(a).toBeLessThan(22);
  });
});
