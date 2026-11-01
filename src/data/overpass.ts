/**
 * Overpass download in the browser: public mirrors with fallback, timeout, automatic bbox split
 * when the zone is too large or the server refuses, IndexedDB cache.
 */
import { bboxArea, bboxKey, splitBBox, type BBox } from '../core/geo';
import type { OverpassJson } from '../core/osm';
import { overpassQuery } from '../core/osm';
import { cacheGet, cacheSet } from './cache';

export const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

/** Query version: bump when overpassQuery changes to invalidate caches. */
export const QUERY_VERSION = 'v2';

export interface DownloadProgress {
  stage: 'cache' | 'download' | 'merge' | 'done';
  message: string;
  /** 0..1 */
  fraction: number;
}

export interface DownloadResult {
  json: OverpassJson;
  fromCache: boolean;
  mirror: string | null;
  ms: number;
  bytes: number;
  parts: number;
}

export interface DownloadOptions {
  timeoutMs?: number;
  /** Split the zone into n×n parts when its area exceeds this (m²). Default 30 km². */
  maxAreaM2?: number;
  onProgress?: (p: DownloadProgress) => void;
  signal?: AbortSignal;
  /** Override mirrors (tests). */
  mirrors?: string[];
  /** Skip cache lookup. */
  force?: boolean;
}

async function fetchOne(bbox: BBox, mirrors: string[], timeoutMs: number, signal?: AbortSignal): Promise<{ json: OverpassJson; mirror: string; bytes: number }> {
  const errors: string[] = [];
  for (const url of mirrors) {
    const ctrl = new AbortController();
    const onAbort = (): void => ctrl.abort();
    signal?.addEventListener('abort', onAbort);
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'POST',
        body: 'data=' + encodeURIComponent(overpassQuery(bbox, Math.round(timeoutMs / 1000))),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        signal: ctrl.signal,
      });
      if (!res.ok) {
        errors.push(`${url}: HTTP ${res.status}`);
        continue;
      }
      const text = await res.text();
      const json = JSON.parse(text) as OverpassJson;
      if (!Array.isArray(json.elements)) {
        errors.push(`${url}: réponse invalide`);
        continue;
      }
      return { json, mirror: url, bytes: text.length };
    } catch (e) {
      if (signal?.aborted) throw e;
      errors.push(`${url}: ${(e as Error).message}`);
    } finally {
      clearTimeout(t);
      signal?.removeEventListener('abort', onAbort);
    }
  }
  throw new Error('Tous les miroirs Overpass ont échoué : ' + errors.join(' | '));
}

export function mergeOverpass(parts: OverpassJson[]): OverpassJson {
  const seen = new Set<string>();
  const elements: OverpassJson['elements'] = [];
  for (const p of parts) {
    for (const el of p.elements) {
      const k = el.type + ':' + el.id;
      if (seen.has(k)) continue;
      seen.add(k);
      elements.push(el);
    }
  }
  const first = parts[0];
  return first?.osm3s ? { elements, osm3s: first.osm3s } : { elements };
}

export function overpassCacheKey(bbox: BBox): string {
  return `overpass:${QUERY_VERSION}:${bboxKey(bbox)}`;
}

export async function downloadZone(bbox: BBox, opts: DownloadOptions = {}): Promise<DownloadResult> {
  const t0 = performance.now();
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const mirrors = opts.mirrors ?? OVERPASS_MIRRORS;
  const key = overpassCacheKey(bbox);
  const progress = (p: DownloadProgress): void => opts.onProgress?.(p);
  if (!opts.force) {
    progress({ stage: 'cache', message: 'Recherche dans le cache…', fraction: 0.02 });
    const cached = await cacheGet<OverpassJson>(key);
    if (cached) {
      progress({ stage: 'done', message: 'Graphe chargé depuis le cache', fraction: 1 });
      return { json: cached, fromCache: true, mirror: null, ms: performance.now() - t0, bytes: 0, parts: 0 };
    }
  }
  const maxArea = opts.maxAreaM2 ?? 30e6;
  const area = bboxArea(bbox);
  const n = area > maxArea ? Math.ceil(Math.sqrt(area / maxArea)) : 1;
  let parts = n > 1 ? splitBBox(bbox, n) : [bbox];
  const results: OverpassJson[] = [];
  let mirror: string | null = null;
  let bytes = 0;
  let i = 0;
  while (i < parts.length) {
    const part = parts[i]!;
    progress({ stage: 'download', message: `Téléchargement Overpass ${i + 1}/${parts.length}…`, fraction: 0.05 + (0.85 * i) / parts.length });
    try {
      const r = await fetchOne(part, mirrors, timeoutMs, opts.signal);
      results.push(r.json);
      mirror = r.mirror;
      bytes += r.bytes;
      i++;
    } catch (e) {
      if (opts.signal?.aborted) throw e;
      // Retry by splitting this part in 4 (too big / timeout), unless it is already tiny.
      if (bboxArea(part) < 1e6) throw e;
      const sub = splitBBox(part, 2);
      parts = [...parts.slice(0, i), ...sub, ...parts.slice(i + 1)];
    }
  }
  progress({ stage: 'merge', message: 'Fusion…', fraction: 0.92 });
  const json = results.length === 1 ? results[0]! : mergeOverpass(results);
  await cacheSet(key, json);
  progress({ stage: 'done', message: 'Graphe téléchargé', fraction: 1 });
  return { json, fromCache: false, mirror, ms: performance.now() - t0, bytes, parts: parts.length };
}
