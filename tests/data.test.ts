import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cacheClear, cacheGet, cacheSet } from '../src/data/cache';
import { downloadZone, mergeOverpass, overpassCacheKey } from '../src/data/overpass';
import { LYON_FOURVIERE } from '../src/core/geo';

const json = { elements: [{ type: 'way', id: 1, nodes: [1, 2], geometry: [{ lat: 45.76, lon: 4.82 }, { lat: 45.761, lon: 4.821 }], tags: { highway: 'steps' } }] };

describe('IndexedDB cache', () => {
  it('stores and reads values', async () => {
    await cacheClear();
    expect(await cacheGet('x')).toBeUndefined();
    expect(await cacheSet('x', { a: 1 })).toBe(true);
    expect(await cacheGet('x')).toEqual({ a: 1 });
  });
});

describe('Overpass download', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('merges parts without duplicates', () => {
    const m = mergeOverpass([json as never, json as never]);
    expect(m.elements).toHaveLength(1);
  });

  it('falls back to the next mirror, then caches', async () => {
    await cacheClear();
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      calls.push(url);
      if (url.includes('a.example')) return new Response('busy', { status: 429 });
      return new Response(JSON.stringify(json), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('performance', { now: () => Date.now() });
    const r = await downloadZone(LYON_FOURVIERE, { mirrors: ['https://a.example/api/interpreter', 'https://b.example/api/interpreter'], timeoutMs: 5000 });
    expect(r.fromCache).toBe(false);
    expect(r.mirror).toContain('b.example');
    expect(r.json.elements).toHaveLength(1);
    expect(calls).toHaveLength(2);
    const r2 = await downloadZone(LYON_FOURVIERE, { mirrors: ['https://a.example/api/interpreter'] });
    expect(r2.fromCache).toBe(true);
    expect(calls).toHaveLength(2);
    expect(await cacheGet(overpassCacheKey(LYON_FOURVIERE))).toBeTruthy();
  });

  it('splits a large zone into parts', async () => {
    await cacheClear();
    let n = 0;
    vi.stubGlobal('fetch', async () => {
      n++;
      return new Response(JSON.stringify(json), { status: 200 });
    });
    vi.stubGlobal('performance', { now: () => Date.now() });
    const big = { south: 45.7, west: 4.75, north: 45.8, east: 4.9 }; // ~ 11 x 12 km
    const r = await downloadZone(big, { mirrors: ['https://c.example/api/interpreter'], maxAreaM2: 30e6 });
    expect(r.parts).toBeGreaterThan(1);
    expect(n).toBe(r.parts);
  });
});
