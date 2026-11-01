// Shared helpers for CI data scripts (Node 20+, no dependency).
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

export const LYON_CENTRE = { south: 45.746, west: 4.796, north: 45.786, east: 4.85 };

/** Reference points (public approximate altitudes, see REPORT.md for sources). */
export const REFERENCE_POINTS = [
  { name: 'Esplanade de Fourvière (basilique)', lat: 45.76235, lng: 4.82250, publicAlt: 287, source: 'IGN carte / Wikipédia (colline 294 m au point culminant)' },
  { name: 'Place Bellecour (centre)', lat: 45.75777, lng: 4.83215, publicAlt: 168, source: 'Wikipédia / IGN' },
  { name: 'Place de la Croix-Rousse', lat: 45.77445, lng: 4.83165, publicAlt: 250, source: 'Wikipédia (plateau ~250 m)' },
  { name: 'Place des Terreaux', lat: 45.76737, lng: 4.83360, publicAlt: 170, source: 'Wikipédia' },
  { name: 'Quai Saint-Antoine (Saône)', lat: 45.76230, lng: 4.83160, publicAlt: 166, source: 'niveau quai bas Saône ~164-168 m' },
  { name: 'Place Saint-Jean (Vieux Lyon)', lat: 45.76080, lng: 4.82720, publicAlt: 170, source: 'Wikipédia / IGN' },
  { name: 'Parc de la Tête d\'Or (lac)', lat: 45.77760, lng: 4.85300, publicAlt: 170, source: 'Wikipédia (parc ~170 m)' },
  { name: 'Montée de la Grande-Côte (haut)', lat: 45.77080, lng: 4.83230, publicAlt: 230, source: 'estimation carte IGN' },
  { name: 'Montée de la Grande-Côte (bas)', lat: 45.76800, lng: 4.83370, publicAlt: 180, source: 'estimation carte IGN' },
  { name: 'Pont Bonaparte (milieu, tablier)', lat: 45.76040, lng: 4.82980, publicAlt: 172, source: 'tablier ~6 m au-dessus de la Saône' },
];

/** Known Lyon stairs / climbs to look up in OSM (R1). */
export const KNOWN_STAIRS = [
  'Montée du Gourguillon',
  'Montée Saint-Barthélemy',
  'Montée des Chazeaux',
  'Montée de la Grande-Côte',
  'Montée des Carmélites',
  'Montée Nicolas de Lange',
  'Montée des Épies',
  'Montée du Garillan',
  'Montée du Chemin Neuf',
  'Montée Saint-Sébastien',
  'Montée de la Sarra',
  'Escaliers Mermet',
  'Montée des Esses',
  'Montée du Change',
  'Montée Rey',
  'Montée Hoche',
  'Montée de Choulans',
  'Montée Bonafous',
  'Escalier de la Pente de Chartreux',
  'Montée du Télégraphe',
];

export const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

export function writeJson(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data));
  console.log(`wrote ${path} (${(statSize(path) / 1e6).toFixed(2)} MB)`);
}

export function writeJsonPretty(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
  console.log(`wrote ${path}`);
}

function statSize(path) {
  return readFileSync(path).length;
}

export function readJson(path) {
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
}

export async function fetchWithTimeout(url, init = {}, timeoutMs = 120000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

export async function overpass(query, { timeoutMs = 180000 } = {}) {
  const errors = [];
  for (const url of OVERPASS_MIRRORS) {
    const t0 = Date.now();
    try {
      const res = await fetchWithTimeout(url, { method: 'POST', body: 'data=' + encodeURIComponent(query), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }, timeoutMs);
      if (!res.ok) {
        errors.push(`${url}: HTTP ${res.status}`);
        continue;
      }
      const json = await res.json();
      console.log(`overpass ${url}: ${json.elements?.length ?? 0} elements in ${Date.now() - t0} ms`);
      return { json, mirror: url, ms: Date.now() - t0 };
    } catch (e) {
      errors.push(`${url}: ${e.message}`);
    }
  }
  throw new Error('All Overpass mirrors failed: ' + errors.join(' | '));
}

export function overpassQuery(b, timeoutSec = 180) {
  const walkable = ['steps','footway','path','pedestrian','living_street','residential','service','track','unclassified','tertiary','tertiary_link','secondary','secondary_link','primary','primary_link','cycleway','bridleway','corridor','road'];
  const bbox = `${b.south},${b.west},${b.north},${b.east}`;
  return `[out:json][timeout:${timeoutSec}][bbox:${bbox}];way["highway"~"^(${walkable.join('|')})$"]["foot"!~"^(no|private)$"]["access"!~"^(private|no)$"]["area"!="yes"];out tags geom qt;`;
}

/** IGN Géoplateforme altimetry, RGE ALTI (1 m). Up to 5000 points per POST. */
export async function ignElevations(points, { resource = 'ign_rge_alti_wld', batch = 2000 } = {}) {
  const out = new Array(points.length).fill(null);
  const log = [];
  for (let i = 0; i < points.length; i += batch) {
    const chunk = points.slice(i, i + batch);
    const body = new URLSearchParams({
      lon: chunk.map((p) => p.lng.toFixed(6)).join('|'),
      lat: chunk.map((p) => p.lat.toFixed(6)).join('|'),
      resource,
      zonly: 'true',
      delimiter: '|',
    });
    const t0 = Date.now();
    let ok = false;
    for (let attempt = 0; attempt < 3 && !ok; attempt++) {
      try {
        const res = await fetchWithTimeout('https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json', { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }, 120000);
        if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + (await res.text()).slice(0, 200));
        const json = await res.json();
        const els = json.elevations ?? [];
        for (let k = 0; k < chunk.length; k++) {
          const e = els[k];
          const z = typeof e === 'number' ? e : e?.z;
          out[i + k] = typeof z === 'number' && z > -1000 ? z : null;
        }
        ok = true;
        log.push({ i, n: chunk.length, ms: Date.now() - t0, cors: res.headers.get('access-control-allow-origin') });
        console.log(`ign ${i}/${points.length} ${chunk.length} pts ${Date.now() - t0} ms`);
      } catch (e) {
        console.warn('ign retry', attempt, e.message);
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      }
    }
    if (!ok) throw new Error('IGN altimetry failed at ' + i);
  }
  return { values: out, log };
}

/** Open-Meteo elevation (Copernicus GLO-90). Up to 100 points per request. */
export async function openMeteoElevations(points) {
  const out = new Array(points.length).fill(null);
  const log = [];
  for (let i = 0; i < points.length; i += 100) {
    const chunk = points.slice(i, i + 100);
    const url = `https://api.open-meteo.com/v1/elevation?latitude=${chunk.map((p) => p.lat.toFixed(6)).join(',')}&longitude=${chunk.map((p) => p.lng.toFixed(6)).join(',')}`;
    const t0 = Date.now();
    const res = await fetchWithTimeout(url, {}, 60000);
    if (!res.ok) throw new Error('open-meteo HTTP ' + res.status);
    const json = await res.json();
    for (let k = 0; k < chunk.length; k++) out[i + k] = json.elevation?.[k] ?? null;
    log.push({ i, n: chunk.length, ms: Date.now() - t0, cors: res.headers.get('access-control-allow-origin') });
    await new Promise((r) => setTimeout(r, 300));
  }
  return { values: out, log };
}

/** Probe a URL and record status, content type and CORS header. */
export async function probe(name, url, init = {}) {
  const t0 = Date.now();
  try {
    const res = await fetchWithTimeout(url, init, 30000);
    const buf = await res.arrayBuffer();
    return {
      name,
      url,
      status: res.status,
      ok: res.ok,
      contentType: res.headers.get('content-type'),
      bytes: buf.byteLength,
      cors: res.headers.get('access-control-allow-origin'),
      ms: Date.now() - t0,
    };
  } catch (e) {
    return { name, url, status: 0, ok: false, error: e.message, ms: Date.now() - t0 };
  }
}
