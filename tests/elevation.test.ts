import { describe, expect, it } from 'vitest';
import { correctAnomalies, decodeTerrainRgb, decodeTerrarium, decodeTilePixels, elevationsFromTiles, pointToTile, sampleTile, stats, tileKey, tilesForPoints } from '../src/core/elevation';
import { syntheticGraph, hillEle } from './helpers/synthetic';

describe('elevation decoding', () => {
  it('decodes terrarium and terrain-rgb', () => {
    // 0 m: R=128, G=0, B=0
    expect(decodeTerrarium(128, 0, 0)).toBe(0);
    expect(decodeTerrarium(129, 10, 128)).toBeCloseTo(266.5, 5);
    expect(decodeTerrainRgb(1, 134, 160)).toBeCloseTo(-10000 + (65536 + 134 * 256 + 160) * 0.1, 5);
  });
  it('maps a point to the right tile (Fourvière, z14)', () => {
    const { tile, px, py } = pointToTile({ lng: 4.8226, lat: 45.7624 }, 14);
    expect(tile).toEqual({ z: 14, x: 8411, y: 5844 });
    expect(px).toBeGreaterThanOrEqual(0);
    expect(px).toBeLessThan(256);
    expect(py).toBeGreaterThanOrEqual(0);
    expect(py).toBeLessThan(256);
  });
  it('samples bilinearly', () => {
    const data = new Float32Array(256 * 256);
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) data[y * 256 + x] = x; // ramp
    const tile = { coord: { z: 1, x: 0, y: 0 }, data };
    expect(sampleTile(tile, 10.5, 10.5)).toBeCloseTo(10, 5);
    expect(sampleTile(tile, 11, 100)).toBeCloseTo(10.5, 5);
    const rgba = new Uint8Array(256 * 256 * 4);
    for (let i = 0; i < 256 * 256; i++) {
      rgba[i * 4] = 129;
      rgba[i * 4 + 1] = 10;
      rgba[i * 4 + 2] = 0;
    }
    const dec = decodeTilePixels(rgba, 'terrarium');
    expect(dec[0]).toBe(266);
    const tiles = new Map([[tileKey({ z: 14, x: 8411, y: 5844 }), { coord: { z: 14, x: 8411, y: 5844 }, data: dec }]]);
    expect(elevationsFromTiles([{ lng: 4.8226, lat: 45.7624 }, { lng: 0, lat: 0 }], tiles, 14)).toEqual([266, NaN]);
    expect(tilesForPoints([{ lng: 4.8226, lat: 45.7624 }, { lng: 4.8227, lat: 45.7624 }], 14)).toHaveLength(1);
  });
  it('computes error statistics', () => {
    const s = stats([1, -1, 2, -2, NaN]);
    expect(s.n).toBe(4);
    expect(s.mean).toBe(0);
    expect(s.mae).toBe(1.5);
    expect(s.max).toBe(2);
  });
});

describe('anomaly correction', () => {
  it('linearises bridge and tunnel edges and flags them', () => {
    const g = syntheticGraph({ elevations: true, correct: false });
    const bridge = g.edges.find((e) => e.tags.bridge)!;
    const tunnel = g.edges.find((e) => e.tags.tunnel)!;
    const before = bridge.eles![1]!;
    const a = bridge.eles![0]!;
    const b = bridge.eles![2]!;
    expect(before).toBeLessThan(Math.min(a, b) - 5); // the DEM sees the trench under the bridge
    const r = correctAnomalies(g);
    expect(r.bridgeEdges).toBe(1);
    expect(r.tunnelEdges).toBe(1);
    expect(bridge.eleCorrected).toBe(true);
    expect(bridge.eles![1]).toBeCloseTo((a + b) / 2, 3);
    expect(tunnel.eles![1]).toBeCloseTo((tunnel.eles![0]! + tunnel.eles![2]!) / 2, 3);
    expect(r.corrected).toContain(bridge.id);
  });
  it('never corrects stairs', () => {
    const g = syntheticGraph({ elevations: true, correct: false });
    const stairs = g.edges.find((e) => e.tags.highway === 'steps')!;
    stairs.eles![1] = stairs.eles![0]! + 40; // absurd spike on stairs stays
    const r = correctAnomalies(g);
    expect(r.corrected).not.toContain(stairs.id);
    expect(stairs.eles![1]).toBe(stairs.eles![0]! + 40);
  });
  it('smooths aberrant jumps on streets', () => {
    const g = syntheticGraph({ elevations: true, correct: false });
    const street = g.edges.find((e) => e.tags.name === 'Chemin du Détour');
    expect(street).toBeDefined();
    expect(street!.geometry.length).toBe(3);
    const original = hillEle(street!.geometry[1]!);
    street!.eles![1] = original + 80; // 80 m spike over ~70 m: > 60 % grade -> aberrant
    const r = correctAnomalies(g);
    expect(r.jumpEdges).toBeGreaterThanOrEqual(1);
    expect(Math.abs(street!.eles![1]! - original)).toBeLessThan(5);
  });
});
