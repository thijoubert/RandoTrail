/** Orchestration: zone -> graph -> elevations -> route -> analysis. DOM-free except fetch/perf. */
import { analyzeProfile, analyzeRoute } from '../core/analysis';
import { assignElevations, correctAnomalies, fillMissingElevations, graphVertices, vertexElevationsById, type ElevationProvider } from '../core/elevation';
import type { LngLat } from '../core/geo';
import { graphSummary } from '../core/graph';
import { buildGraph, parseOverpass, stairsStats, type OverpassJson } from '../core/osm';
import { buildProfile, type ProfilePoint } from '../core/profile';
import { routeThrough } from '../core/router';
import { downloadZone, type DownloadOptions } from '../data/overpass';
import { IgnAltiProvider, NodeFileProvider, OpenMeteoProvider, TerrariumProvider } from '../data/elevationProviders';
import { addTiming, nextFrame, notify, state, type GraphInfo } from './state';
import type { ZonePreset } from './zones';

export const providers = {
  terrarium: new TerrariumProvider(),
  ign: new IgnAltiProvider(),
  openMeteo: new OpenMeteoProvider(),
  ignFile: new NodeFileProvider(`${import.meta.env.BASE_URL}fixtures/lyon-centre.ign-alti.json`),
};

export type GraphSource = 'overpass' | 'embedded';

export interface LoadOptions {
  source: GraphSource;
  elevation: 'terrarium' | 'ign-file';
  download?: DownloadOptions;
}

async function fetchEmbedded(): Promise<OverpassJson> {
  const res = await fetch(`${import.meta.env.BASE_URL}fixtures/lyon-centre.overpass.json`);
  if (!res.ok) throw new Error(`Données embarquées indisponibles (HTTP ${res.status})`);
  return (await res.json()) as OverpassJson;
}

export async function loadZone(zone: ZonePreset, opts: LoadOptions): Promise<void> {
  state.busy = 'Chargement du graphe…';
  state.error = null;
  state.zone = zone;
  notify();
  await nextFrame();
  try {
    const t0 = performance.now();
    let json: OverpassJson;
    let fromCache = false;
    let mirror: string | null = null;
    let bytes = 0;
    let parts = 0;
    if (opts.source === 'embedded') {
      json = await fetchEmbedded();
      bytes = JSON.stringify(json).length;
    } else {
      const r = await downloadZone(zone.bbox, {
        ...opts.download,
        onProgress: (p) => {
          state.busy = p.message;
          notify();
        },
      });
      json = r.json;
      fromCache = r.fromCache;
      mirror = r.mirror;
      bytes = r.bytes;
      parts = r.parts;
    }
    const downloadMs = performance.now() - t0;
    state.busy = 'Construction du graphe…';
    notify();
    await nextFrame();
    const t1 = performance.now();
    const ways = parseOverpass(json);
    const graph = buildGraph(ways, { bbox: zone.bbox });
    const buildMs = performance.now() - t1;
    const stairs = stairsStats(ways);

    state.busy = 'Altitudes…';
    notify();
    await nextFrame();
    const t2 = performance.now();
    let elevationSource = '';
    let anomalies = null;
    if (opts.elevation === 'ign-file') {
      const byId = await providers.ignFile.load();
      assignElevations(graph, vertexElevationsById(graph, byId));
      elevationSource = providers.ignFile.label;
    } else {
      const verts = graphVertices(graph);
      const eles = await providers.terrarium.elevations(verts);
      assignElevations(graph, eles);
      elevationSource = providers.terrarium.label;
    }
    const missing = fillMissingElevations(graph);
    anomalies = correctAnomalies(graph);
    const elevationMs = performance.now() - t2;
    const s = graphSummary(graph);
    const info: GraphInfo = {
      zone,
      nodes: s.nodes,
      edges: s.edges,
      steps: s.steps,
      lengthKm: s.lengthKm,
      downloadMs,
      buildMs,
      elevationMs,
      fromCache,
      mirror,
      bytes,
      parts,
      source: opts.source,
      stairs,
      anomalies,
      elevationSource,
      missingEle: missing,
    };
    if (json.osm3s?.timestamp_osm_base) info.osmTimestamp = json.osm3s.timestamp_osm_base;
    state.graph = graph;
    state.graphInfo = info;
    state.route = null;
    state.analysis = null;
    state.generated = [];
    state.variants = [];
    state.hillRepeat = null;
    addTiming('Téléchargement/chargement graphe', downloadMs);
    addTiming('Construction graphe', buildMs);
    addTiming('Altitudes graphe', elevationMs);
  } catch (e) {
    state.error = (e as Error).message;
  } finally {
    state.busy = null;
    notify();
  }
}

/** Re-elevate profile points with an external provider (route-level precision). */
const routeEleCache = new Map<string, number>();

async function elevatePoints(points: ProfilePoint[], provider: ElevationProvider): Promise<ProfilePoint[]> {
  const missing: LngLat[] = [];
  const keys: string[] = [];
  for (const p of points) {
    const k = `${provider.id}:${p.lng.toFixed(6)},${p.lat.toFixed(6)}`;
    keys.push(k);
    if (!routeEleCache.has(k)) missing.push(p);
  }
  if (missing.length > 0) {
    const eles = await provider.elevations(missing);
    missing.forEach((p, i) => routeEleCache.set(`${provider.id}:${p.lng.toFixed(6)},${p.lat.toFixed(6)}`, eles[i]!));
  }
  return points.map((p, i) => ({ ...p, ele: routeEleCache.get(keys[i]!) ?? NaN }));
}

export async function computeRoute(): Promise<void> {
  const g = state.graph;
  if (!g || state.waypoints.length < 2) {
    state.route = null;
    state.analysis = null;
    notify();
    return;
  }
  const t0 = performance.now();
  const route = routeThrough(g, state.waypoints, state.prefs);
  state.routeMs = performance.now() - t0;
  addTiming('Routage A*', state.routeMs);
  state.route = route;
  state.error = route ? null : 'Aucun itinéraire trouvé (point hors zone ou graphe déconnecté).';
  state.selectedClimb = -1;
  await analyzeCurrentRoute();
}

export async function analyzeCurrentRoute(): Promise<void> {
  const g = state.graph;
  const route = state.route;
  if (!g || !route) {
    state.analysis = null;
    notify();
    return;
  }
  const t0 = performance.now();
  if (state.routeElevation === 'graph') {
    state.analysis = analyzeRoute(g, route, state.analysisOptions);
  } else {
    state.busy = 'Altitudes du tracé…';
    notify();
    try {
      const provider = state.routeElevation === 'ign' ? providers.ign : providers.openMeteo;
      const pts = await elevatePoints(buildProfile(g, route), provider);
      let corrected = 0;
      for (const eid of route.edges) if (g.edges[eid]!.eleCorrected) corrected++;
      state.analysis = analyzeProfile(g, pts, state.analysisOptions, corrected);
    } catch (e) {
      state.error = `Altitudes ${state.routeElevation} indisponibles : ${(e as Error).message}`;
      state.analysis = analyzeRoute(g, route, state.analysisOptions);
    } finally {
      state.busy = null;
    }
  }
  addTiming('Analyse du tracé', performance.now() - t0);
  notify();
}
