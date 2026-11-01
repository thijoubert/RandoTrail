/** Application state with a tiny pub/sub. All heavy data lives here; panels render from it. */
import type { RouteAnalysis, AnalysisOptions } from '../core/analysis';
import { DEFAULT_ANALYSIS_OPTIONS } from '../core/analysis';
import type { RoutingPreferences } from '../core/cost';
import { DEFAULT_PREFERENCES } from '../core/cost';
import type { AnomalyReport } from '../core/elevation';
import type { LngLat } from '../core/geo';
import type { Graph } from '../core/graph';
import type { Objectives } from '../core/objectives';
import type { Route } from '../core/router';
import type { GeneratedRoute } from '../core/generate';
import type { Variant, HillRepeat } from '../core/variants';
import type { StairsStats } from '../core/osm';
import type { ZonePreset } from './zones';
import { ZONES } from './zones';

export type ElevationSourceId = 'terrarium' | 'ign-file' | 'ign' | 'open-meteo';

export interface GraphInfo {
  zone: ZonePreset;
  nodes: number;
  edges: number;
  steps: number;
  lengthKm: number;
  downloadMs: number;
  buildMs: number;
  elevationMs: number;
  fromCache: boolean;
  mirror: string | null;
  bytes: number;
  parts: number;
  source: 'overpass' | 'embedded';
  osmTimestamp?: string;
  stairs: StairsStats;
  anomalies: AnomalyReport | null;
  elevationSource: string;
  missingEle: number;
}

export interface Timing {
  label: string;
  ms: number;
  at: number;
}

export interface GpxImport {
  name: string;
  points: LngLat[];
  analysis: RouteAnalysis;
  matchedStairs: number;
  missingEle: number;
}

export interface AppState {
  zone: ZonePreset;
  graph: Graph | null;
  graphInfo: GraphInfo | null;
  busy: string | null;
  error: string | null;
  prefs: RoutingPreferences;
  analysisOptions: AnalysisOptions;
  waypoints: LngLat[];
  route: Route | null;
  analysis: RouteAnalysis | null;
  routeMs: number;
  /** Elevation source used for the current route profile ('graph' = whatever the graph has). */
  routeElevation: 'graph' | 'ign' | 'open-meteo';
  objectives: Objectives;
  generated: GeneratedRoute[];
  variants: Variant[];
  hillRepeat: HillRepeat | null;
  selectedClimb: number;
  hoverIndex: number;
  gpx: GpxImport | null;
  timings: Timing[];
  tab: string;
  mode: 'trace' | 'none';
}

type Listener = (s: AppState) => void;

const listeners = new Set<Listener>();

export const state: AppState = {
  zone: ZONES[0]!,
  graph: null,
  graphInfo: null,
  busy: null,
  error: null,
  prefs: { ...DEFAULT_PREFERENCES },
  analysisOptions: structuredClone(DEFAULT_ANALYSIS_OPTIONS),
  waypoints: [],
  route: null,
  analysis: null,
  routeMs: 0,
  routeElevation: 'graph',
  objectives: { tolerance: 0.1 },
  generated: [],
  variants: [],
  hillRepeat: null,
  selectedClimb: -1,
  hoverIndex: -1,
  gpx: null,
  timings: [],
  tab: 'zone',
  mode: 'trace',
};

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

let scheduled = false;
export function notify(): void {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    for (const l of listeners) l(state);
  });
}

export function addTiming(label: string, ms: number): void {
  state.timings.push({ label, ms, at: Date.now() });
  if (state.timings.length > 200) state.timings.shift();
}

/** Yield to the browser so that the UI can paint a status before a long computation. */
export function nextFrame(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
}
