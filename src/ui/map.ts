/** MapLibre map: IGN basemap with fallback, graph + stairs layers, route by classification, markers, hover. */
import maplibregl, { type GeoJSONSource, type Map as MlMap, type StyleSpecification } from 'maplibre-gl';
import type { Feature, FeatureCollection } from 'geojson';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { RouteAnalysis } from '../core/analysis';
import type { SegmentKind } from '../core/classify';
import type { LngLat } from '../core/geo';
import { isSteps, orientedGeometry, type Graph } from '../core/graph';
import type { Route } from '../core/router';

export const BASEMAPS = {
  ign: {
    id: 'ign',
    label: 'Plan IGN v2 (Géoplateforme, sans clé)',
    tiles: ['https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM&FORMAT=image/png&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}'],
    attribution: '© IGN – Géoplateforme (Plan IGN v2)',
    maxzoom: 19,
  },
  opentopomap: {
    id: 'opentopomap',
    label: 'OpenTopoMap (repli)',
    tiles: ['https://a.tile.opentopomap.org/{z}/{x}/{y}.png', 'https://b.tile.opentopomap.org/{z}/{x}/{y}.png'],
    attribution: '© OpenStreetMap contributors, SRTM | © OpenTopoMap (CC-BY-SA)',
    maxzoom: 17,
  },
  none: { id: 'none', label: 'Aucun fond (graphe seul)', tiles: [] as string[], attribution: '', maxzoom: 19 },
};

export type BasemapId = keyof typeof BASEMAPS;

export const KIND_COLORS: Record<SegmentKind, string> = {
  stairs_up: '#d7263d',
  stairs_down: '#f46036',
  very_steep: '#7b2cbf',
  steep: '#e63946',
  moderate: '#f77f00',
  gentle: '#fcbf49',
  flat: '#2a9d8f',
  descent: '#457b9d',
};

export interface MapController {
  map: MlMap;
  setBasemap(id: BasemapId): void;
  setGraph(graph: Graph | null): void;
  setRoute(graph: Graph | null, route: Route | null, analysis: RouteAnalysis | null): void;
  setAltRoutes(graph: Graph | null, routes: Route[], highlight: number): void;
  setWaypoints(points: LngLat[]): void;
  setHover(p: LngLat | null): void;
  setHighlight(points: LngLat[]): void;
  setGpx(points: LngLat[], analysis: RouteAnalysis | null): void;
  fitZone(bbox: { south: number; west: number; north: number; east: number }): void;
  onClick(fn: (p: LngLat) => void): void;
  onRouteHover(fn: (p: LngLat | null) => void): void;
  currentBasemap: BasemapId;
}

function emptyFc(): FeatureCollection {
  return { type: 'FeatureCollection', features: [] };
}

function style(basemap: BasemapId): StyleSpecification {
  const b = BASEMAPS[basemap];
  const sources: StyleSpecification['sources'] = {};
  const layers: StyleSpecification['layers'] = [{ id: 'bg', type: 'background', paint: { 'background-color': '#eef0f2' } }];
  if (b.tiles.length > 0) {
    sources['basemap'] = { type: 'raster', tiles: b.tiles, tileSize: 256, attribution: b.attribution, maxzoom: b.maxzoom };
    layers.push({ id: 'basemap', type: 'raster', source: 'basemap', paint: { 'raster-opacity': 0.9 } });
  }
  for (const id of ['graph', 'stairs', 'alts', 'route', 'gpx', 'highlight', 'waypoints', 'hover']) {
    sources[id] = { type: 'geojson', data: emptyFc() };
  }
  layers.push(
    { id: 'graph-lines', type: 'line', source: 'graph', paint: { 'line-color': '#6c757d', 'line-width': 1, 'line-opacity': 0.45 }, minzoom: 13 },
    // Stairs: colour AND pattern (white casing + red dashes) so they are distinguishable without colour.
    { id: 'stairs-casing', type: 'line', source: 'stairs', paint: { 'line-color': '#ffffff', 'line-width': 7, 'line-opacity': 0.9 }, layout: { 'line-cap': 'round' } },
    { id: 'stairs-lines', type: 'line', source: 'stairs', paint: { 'line-color': '#d7263d', 'line-width': 4, 'line-dasharray': [0.6, 0.8] } },
    { id: 'alts-lines', type: 'line', source: 'alts', paint: { 'line-color': ['get', 'color'], 'line-width': ['case', ['get', 'active'], 6, 3], 'line-opacity': ['case', ['get', 'active'], 0.95, 0.55] }, layout: { 'line-cap': 'round', 'line-join': 'round' } },
    { id: 'gpx-casing', type: 'line', source: 'gpx', paint: { 'line-color': '#ffffff', 'line-width': 8 }, layout: { 'line-cap': 'round', 'line-join': 'round' } },
    { id: 'gpx-lines', type: 'line', source: 'gpx', paint: { 'line-color': ['get', 'color'], 'line-width': 4, 'line-dasharray': [2, 1] }, layout: { 'line-cap': 'round', 'line-join': 'round' } },
    { id: 'route-casing', type: 'line', source: 'route', paint: { 'line-color': '#ffffff', 'line-width': 9 }, layout: { 'line-cap': 'round', 'line-join': 'round' } },
    { id: 'route-lines', type: 'line', source: 'route', paint: { 'line-color': ['get', 'color'], 'line-width': 5 }, layout: { 'line-cap': 'round', 'line-join': 'round' } },
    { id: 'route-stairs', type: 'line', source: 'route', filter: ['==', ['get', 'stairs'], true], paint: { 'line-color': '#ffffff', 'line-width': 2, 'line-dasharray': [0.5, 1.2] } },
    { id: 'highlight-lines', type: 'line', source: 'highlight', paint: { 'line-color': '#ffd60a', 'line-width': 12, 'line-opacity': 0.6, 'line-blur': 2 }, layout: { 'line-cap': 'round' } },
    { id: 'waypoints-circles', type: 'circle', source: 'waypoints', paint: { 'circle-radius': 9, 'circle-color': ['get', 'color'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } },
    { id: 'waypoints-labels', type: 'symbol', source: 'waypoints', layout: { 'text-field': ['get', 'label'], 'text-size': 11, 'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'], 'text-allow-overlap': true }, paint: { 'text-color': '#fff' } },
    { id: 'hover-circle', type: 'circle', source: 'hover', paint: { 'circle-radius': 8, 'circle-color': '#ffd60a', 'circle-stroke-color': '#222', 'circle-stroke-width': 2 } },
  );
  return { version: 8, sources, layers, glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf' };
}

export function createMap(container: HTMLElement, center: [number, number], zoom: number, basemap: BasemapId = 'ign'): MapController {
  const map = new maplibregl.Map({
    container,
    style: style(basemap),
    center,
    zoom,
    attributionControl: { compact: true },
    maxZoom: 19,
    minZoom: 10,
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  map.addControl(new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: false }), 'top-right');
  map.addControl(new maplibregl.ScaleControl({ maxWidth: 100, unit: 'metric' }), 'bottom-left');

  // Keep the data of each source so that we can re-apply it after a style change (basemap switch).
  const data: Record<string, FeatureCollection> = {};
  const setData = (id: string, fc: FeatureCollection): void => {
    data[id] = fc;
    const apply = (): void => {
      const src = map.getSource(id) as GeoJSONSource | undefined;
      if (src) src.setData(fc);
    };
    if (map.isStyleLoaded()) apply();
    else map.once('load', apply);
  };
  let currentBasemap: BasemapId = basemap;
  let basemapErrors = 0;
  map.on('error', (e) => {
    // Automatic fallback when the basemap tiles fail (blocked network, service down).
    const err = e as unknown as { sourceId?: string; error?: { message?: string } };
    if (err.sourceId === 'basemap') {
      basemapErrors++;
      if (basemapErrors >= 3 && currentBasemap === 'ign') ctl.setBasemap('opentopomap');
      else if (basemapErrors >= 8 && currentBasemap === 'opentopomap') ctl.setBasemap('none');
    }
  });
  const clickHandlers: ((p: LngLat) => void)[] = [];
  map.on('click', (e) => {
    for (const h of clickHandlers) h({ lng: e.lngLat.lng, lat: e.lngLat.lat });
  });
  const hoverHandlers: ((p: LngLat | null) => void)[] = [];
  map.on('mousemove', 'route-lines', (e) => {
    for (const h of hoverHandlers) h({ lng: e.lngLat.lng, lat: e.lngLat.lat });
  });
  map.on('mouseleave', 'route-lines', () => {
    for (const h of hoverHandlers) h(null);
  });

  const ctl: MapController = {
    map,
    currentBasemap,
    setBasemap(id) {
      currentBasemap = id;
      ctl.currentBasemap = id;
      basemapErrors = 0;
      map.setStyle(style(id));
      map.once('style.load', () => {
        for (const [sid, fc] of Object.entries(data)) {
          const src = map.getSource(sid) as GeoJSONSource | undefined;
          if (src) src.setData(fc);
        }
      });
    },
    setGraph(graph) {
      if (!graph) {
        setData('graph', emptyFc());
        setData('stairs', emptyFc());
        return;
      }
      const lines: Feature[] = [];
      const stairs: Feature[] = [];
      for (const e of graph.edges) {
        const f: Feature = { type: 'Feature', properties: { id: e.id, name: e.tags.name ?? '', steps: e.tags.stepCount ?? null }, geometry: { type: 'LineString', coordinates: e.geometry.map((p) => [p.lng, p.lat]) } };
        if (isSteps(e)) stairs.push(f);
        else lines.push(f);
      }
      setData('graph', { type: 'FeatureCollection', features: lines });
      setData('stairs', { type: 'FeatureCollection', features: stairs });
    },
    setRoute(graph, route, analysis) {
      if (!graph || !route || !analysis) {
        setData('route', emptyFc());
        return;
      }
      setData('route', routeFeatures(analysis));
    },
    setAltRoutes(graph, routes, highlight) {
      if (!graph || routes.length === 0) {
        setData('alts', emptyFc());
        return;
      }
      const palette = ['#1d3557', '#2a9d8f', '#e76f51', '#8338ec', '#ff006e', '#3a86ff'];
      const features: Feature[] = routes.map((r, i) => ({
        type: 'Feature',
        properties: { color: palette[i % palette.length], active: i === highlight, index: i },
        geometry: { type: 'LineString', coordinates: routeCoords(graph, r).map((p) => [p.lng, p.lat]) },
      }));
      setData('alts', { type: 'FeatureCollection', features });
    },
    setWaypoints(points) {
      const n = points.length;
      setData('waypoints', {
        type: 'FeatureCollection',
        features: points.map((p, i) => ({
          type: 'Feature',
          properties: { color: i === 0 ? '#2a9d8f' : i === n - 1 ? '#d7263d' : '#3a86ff', label: i === 0 ? 'D' : i === n - 1 ? 'A' : String(i) },
          geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
        })),
      });
    },
    setHover(p) {
      setData('hover', p ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [p.lng, p.lat] } }] } : emptyFc());
    },
    setHighlight(points) {
      setData('highlight', points.length > 1 ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: points.map((p) => [p.lng, p.lat]) } }] } : emptyFc());
    },
    setGpx(points, analysis) {
      if (points.length < 2) {
        setData('gpx', emptyFc());
        return;
      }
      if (analysis) setData('gpx', routeFeatures(analysis));
      else setData('gpx', { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { color: '#6a4c93' }, geometry: { type: 'LineString', coordinates: points.map((p) => [p.lng, p.lat]) } }] });
    },
    fitZone(bbox) {
      map.fitBounds([[bbox.west, bbox.south], [bbox.east, bbox.north]], { padding: 20, duration: 600 });
    },
    onClick(fn) {
      clickHandlers.push(fn);
    },
    onRouteHover(fn) {
      hoverHandlers.push(fn);
    },
  };
  return ctl;
}

export function routeCoords(graph: Graph, route: Route): LngLat[] {
  const out: LngLat[] = [];
  for (let i = 0; i < route.edges.length; i++) {
    const g = orientedGeometry(graph.edges[route.edges[i]!]!, route.nodes[i]!);
    for (let k = i === 0 ? 0 : 1; k < g.length; k++) out.push(g[k]!);
  }
  return out;
}

/** One feature per merged classified segment, coloured by kind; stairs flagged for the dash overlay. */
export function routeFeatures(a: RouteAnalysis): FeatureCollection {
  const features: Feature[] = [];
  for (const s of a.merged) {
    const coords: [number, number][] = [];
    for (let k = s.i; k <= s.j; k++) coords.push([a.points[k]!.lng, a.points[k]!.lat]);
    if (coords.length < 2) continue;
    features.push({
      type: 'Feature',
      properties: { kind: s.kind, color: KIND_COLORS[s.kind], stairs: s.kind === 'stairs_up' || s.kind === 'stairs_down', grade: Math.round(s.gradePct * 10) / 10 },
      geometry: { type: 'LineString', coordinates: coords },
    });
  }
  return { type: 'FeatureCollection', features };
}
