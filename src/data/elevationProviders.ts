/**
 * Browser elevation providers behind the ElevationProvider interface:
 *  - Terrarium terrain tiles (AWS Open Data) decoded in the browser, cached in IndexedDB (default, bulk)
 *  - IGN Géoplateforme altimetry (RGE ALTI 1 m), batched POST (precise, for routes)
 *  - Open-Meteo elevation (Copernicus GLO-90), batched GET (comparison)
 *  - Per-node JSON file (IGN fixture) for the embedded Lyon demo
 */
import type { LngLat } from '../core/geo';
import { decodeTilePixels, elevationsFromTiles, tileKey, tilesForPoints, type ElevationProvider, type ElevationTile, type TileCoord } from '../core/elevation';
import { cacheGet, cacheSet } from './cache';

export const TERRARIUM_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
export const IGN_ALTI_URL = 'https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json';
export const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/elevation';

export interface ProviderStats {
  requests: number;
  bytes: number;
  ms: number;
  cacheHits: number;
  errors: string[];
}

function newStats(): ProviderStats {
  return { requests: 0, bytes: 0, ms: 0, cacheHits: 0, errors: [] };
}

async function decodePng(blob: Blob): Promise<Uint8ClampedArray> {
  const bmp = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('canvas 2d indisponible');
  ctx.drawImage(bmp, 0, 0);
  const data = ctx.getImageData(0, 0, 256, 256).data;
  bmp.close();
  return data;
}

export class TerrariumProvider implements ElevationProvider {
  readonly id = 'terrarium';
  readonly label: string;
  readonly resolutionM: number;
  readonly stats = newStats();
  private tiles = new Map<string, ElevationTile>();
  private pending = new Map<string, Promise<ElevationTile | null>>();

  constructor(
    private urlTemplate: string = TERRARIUM_URL,
    private zoom: number = 14,
    label = 'Terrarium AWS (z14, ~7 m/px, source SRTM/EU-DEM ~30 m)',
  ) {
    this.label = label;
    this.resolutionM = 156543 * Math.cos((45.76 * Math.PI) / 180) / 2 ** zoom;
  }

  private async loadTile(t: TileCoord): Promise<ElevationTile | null> {
    const key = tileKey(t);
    const have = this.tiles.get(key);
    if (have) return have;
    let p = this.pending.get(key);
    if (p) return p;
    p = (async () => {
      const cacheKey = `terrarium:${this.urlTemplate}:${key}`;
      const cached = await cacheGet<ArrayBuffer>(cacheKey);
      if (cached) {
        const tile = { coord: t, data: new Float32Array(cached) };
        this.tiles.set(key, tile);
        this.stats.cacheHits++;
        return tile;
      }
      const url = this.urlTemplate.replace('{z}', String(t.z)).replace('{x}', String(t.x)).replace('{y}', String(t.y));
      const t0 = performance.now();
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        this.stats.requests++;
        this.stats.bytes += blob.size;
        const data = decodeTilePixels(await decodePng(blob), 'terrarium');
        const tile = { coord: t, data };
        this.tiles.set(key, tile);
        await cacheSet(cacheKey, data.buffer);
        return tile;
      } catch (e) {
        this.stats.errors.push(`${url}: ${(e as Error).message}`);
        return null;
      } finally {
        this.stats.ms += performance.now() - t0;
        this.pending.delete(key);
      }
    })();
    this.pending.set(key, p);
    return p;
  }

  async elevations(points: LngLat[]): Promise<number[]> {
    const needed = tilesForPoints(points, this.zoom);
    await Promise.all(needed.map((t) => this.loadTile(t)));
    return elevationsFromTiles(points, this.tiles, this.zoom);
  }

  get tileCount(): number {
    return this.tiles.size;
  }
}

export class IgnAltiProvider implements ElevationProvider {
  readonly id = 'ign';
  readonly label = 'IGN Géoplateforme RGE ALTI (1 m)';
  readonly resolutionM = 1;
  readonly stats = newStats();
  constructor(
    private url: string = IGN_ALTI_URL,
    private batch = 1000,
    private resource = 'ign_rge_alti_wld',
  ) {}

  async elevations(points: LngLat[]): Promise<number[]> {
    const out = new Array<number>(points.length).fill(NaN);
    for (let i = 0; i < points.length; i += this.batch) {
      const chunk = points.slice(i, i + this.batch);
      const body = new URLSearchParams({
        lon: chunk.map((p) => p.lng.toFixed(6)).join('|'),
        lat: chunk.map((p) => p.lat.toFixed(6)).join('|'),
        resource: this.resource,
        zonly: 'true',
        delimiter: '|',
      });
      const t0 = performance.now();
      try {
        const res = await fetch(this.url, { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
        this.stats.requests++;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        this.stats.bytes += text.length;
        const json = JSON.parse(text) as { elevations?: (number | { z: number })[] };
        const els = json.elevations ?? [];
        for (let k = 0; k < chunk.length; k++) {
          const e = els[k];
          const z = typeof e === 'number' ? e : e?.z;
          out[i + k] = typeof z === 'number' && z > -1000 ? z : NaN;
        }
      } catch (e) {
        this.stats.errors.push((e as Error).message);
      } finally {
        this.stats.ms += performance.now() - t0;
      }
    }
    return out;
  }
}

export class OpenMeteoProvider implements ElevationProvider {
  readonly id = 'open-meteo';
  readonly label = 'Open-Meteo (Copernicus GLO-90, 90 m)';
  readonly resolutionM = 90;
  readonly stats = newStats();
  constructor(private url: string = OPEN_METEO_URL) {}

  async elevations(points: LngLat[]): Promise<number[]> {
    const out = new Array<number>(points.length).fill(NaN);
    for (let i = 0; i < points.length; i += 100) {
      const chunk = points.slice(i, i + 100);
      const url = `${this.url}?latitude=${chunk.map((p) => p.lat.toFixed(6)).join(',')}&longitude=${chunk.map((p) => p.lng.toFixed(6)).join(',')}`;
      const t0 = performance.now();
      try {
        const res = await fetch(url);
        this.stats.requests++;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { elevation?: number[] };
        for (let k = 0; k < chunk.length; k++) out[i + k] = json.elevation?.[k] ?? NaN;
      } catch (e) {
        this.stats.errors.push((e as Error).message);
      } finally {
        this.stats.ms += performance.now() - t0;
      }
    }
    return out;
  }
}

/** Provider that answers from a per-OSM-node file; needs the ids of the points, so it exposes `byId`. */
export class NodeFileProvider implements ElevationProvider {
  readonly id = 'ign-file';
  readonly label: string;
  readonly resolutionM = 1;
  byId: Record<string, number> | null = null;
  readonly stats = newStats();
  constructor(
    private url: string,
    label = 'IGN RGE ALTI (fichier pré-calculé par nœud OSM)',
  ) {
    this.label = label;
  }
  async load(): Promise<Record<string, number>> {
    if (this.byId) return this.byId;
    const t0 = performance.now();
    const res = await fetch(this.url);
    this.stats.requests++;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    this.stats.bytes += text.length;
    const json = JSON.parse(text) as { nodes: Record<string, number> };
    this.byId = json.nodes;
    this.stats.ms += performance.now() - t0;
    return this.byId;
  }
  /** Not usable by coordinates: returns NaN (callers must use vertexElevationsById). */
  async elevations(points: LngLat[]): Promise<number[]> {
    return points.map(() => NaN);
  }
}
