/** Bottom-sheet tabs. Each tab mounts once and updates from state. */
import type { RouteAnalysis } from '../core/analysis';
import { KIND_LABELS_FR } from '../core/classify';
import type { Climb } from '../core/climbs';
import { formatDuration } from '../core/time';
import { evaluateObjectives } from '../core/objectives';
import { generateLoops, outAndBack, type GeneratedRoute } from '../core/generate';
import { generateVariants, hillRepeats } from '../core/variants';
import { nearestNode } from '../core/graph';
import { parseGpx, segmentLengths, serializeGpx, matchStairs } from '../core/gpx';
import { analyzeProfile, type AnalysisOptions } from '../core/analysis';
import { profileFromPolyline } from '../core/profile';
import type { LngLat } from '../core/geo';
import type { Route } from '../core/router';
import { escapeHtml, km, metres, ms, pct } from './format';
import { BASEMAPS, KIND_COLORS, routeCoords, type BasemapId, type MapController } from './map';
import { analyzeCurrentRoute, computeRoute, loadZone, providers } from './pipeline';
import { addTiming, nextFrame, notify, state, type AppState } from './state';
import { ZONES } from './zones';
import type { ProfileChart } from './chart';

export interface PanelContext {
  mapCtl: MapController;
  chart: ProfileChart;
}

export interface Tab {
  id: string;
  label: string;
  mount(root: HTMLElement, ctx: PanelContext): void;
  update(s: AppState, ctx: PanelContext): void;
}

function q<T extends Element>(root: ParentNode, sel: string): T {
  const e = root.querySelector<T>(sel);
  if (!e) throw new Error('missing element ' + sel);
  return e;
}

function statsHtml(a: RouteAnalysis | null, extra = ''): string {
  if (!a) return '<p class="muted">Aucun tracé.</p>';
  const gl = a.gainLoss;
  return `<div class="stats">
    <div><b>${km(a.length)}</b><span>distance</span></div>
    <div><b>+${Math.round(gl.gain)} m</b><span>D+</span></div>
    <div><b>−${Math.round(gl.loss)} m</b><span>D−</span></div>
    <div><b>${metres(gl.minEle)} / ${metres(gl.maxEle)}</b><span>alt. min / max</span></div>
    <div><b>${formatDuration(a.time.totalS)}</b><span>temps estimé</span></div>
    <div><b>${a.breakdown.totalSteps}${a.breakdown.estimatedSteps ? '*' : ''}</b><span>marches${a.breakdown.estimatedSteps ? ' (*dont estimées)' : ''}</span></div>
    ${extra}
  </div>`;
}

export function useGeneratedRoute(r: { route: Route; analysis: RouteAnalysis }): void {
  const g = state.graph;
  if (!g) return;
  state.route = r.route;
  state.analysis = r.analysis;
  state.waypoints = r.route.waypoints.map((i) => ({ lng: g.nodes[i]!.lng, lat: g.nodes[i]!.lat }));
  state.selectedClimb = -1;
  state.tab = 'trace';
  notify();
}

/* ---------------- Zone ---------------- */
const zoneTab: Tab = {
  id: 'zone',
  label: 'Zone',
  mount(root, ctx) {
    root.innerHTML = `
      <h2>1. Zone et graphe piéton</h2>
      <label>Zone <select id="zone-select">${ZONES.map((z) => `<option value="${z.id}">${escapeHtml(z.label)}</option>`).join('')}</select></label>
      <label>Altitudes du graphe <select id="ele-select">
        <option value="terrarium">Tuiles terrain Terrarium (AWS, en ligne)</option>
        <option value="ign-file">IGN RGE ALTI pré-calculé (données embarquées Lyon centre)</option>
      </select></label>
      <div class="row">
        <button id="btn-load" class="primary">Télécharger (Overpass)</button>
        <button id="btn-embedded">Données embarquées (Lyon réel)</button>
      </div>
      <label>Fond de carte <select id="basemap-select">${Object.values(BASEMAPS).map((b) => `<option value="${b.id}">${escapeHtml(b.label)}</option>`).join('')}</select></label>
      <div id="zone-status" class="status"></div>
      <p class="hint">Les escaliers OSM (<code>highway=steps</code>) sont affichés en rouge pointillé sur liseré blanc. Zoomez pour voir le graphe complet.</p>`;
    const sel = q<HTMLSelectElement>(root, '#zone-select');
    sel.addEventListener('change', () => {
      const z = ZONES.find((x) => x.id === sel.value)!;
      state.zone = z;
      ctx.mapCtl.fitZone(z.bbox);
      notify();
    });
    q<HTMLButtonElement>(root, '#btn-load').addEventListener('click', () => {
      const ele = q<HTMLSelectElement>(root, '#ele-select').value;
      void loadZone(state.zone, { source: 'overpass', elevation: ele === 'ign-file' ? 'ign-file' : 'terrarium' });
    });
    q<HTMLButtonElement>(root, '#btn-embedded').addEventListener('click', () => {
      const ele = q<HTMLSelectElement>(root, '#ele-select').value;
      const z = ZONES[0]!;
      sel.value = z.id;
      void loadZone(z, { source: 'embedded', elevation: ele === 'terrarium' ? 'terrarium' : 'ign-file' });
    });
    q<HTMLSelectElement>(root, '#basemap-select').addEventListener('change', (e) => {
      ctx.mapCtl.setBasemap((e.target as HTMLSelectElement).value as BasemapId);
    });
  },
  update(s, ctx) {
    const st = document.getElementById('zone-status');
    if (!st) return;
    const bm = document.getElementById('basemap-select') as HTMLSelectElement | null;
    if (bm && bm.value !== ctx.mapCtl.currentBasemap) bm.value = ctx.mapCtl.currentBasemap;
    const i = s.graphInfo;
    if (!i) {
      st.innerHTML = s.busy ? `<p class="busy">${escapeHtml(s.busy)}</p>` : '<p class="muted">Aucun graphe chargé.</p>';
      return;
    }
    const an = i.anomalies;
    st.innerHTML = `
      <table class="kv">
        <tr><td>Source</td><td>${i.source === 'embedded' ? 'données embarquées (Overpass réel du dépôt)' : i.fromCache ? 'cache IndexedDB' : escapeHtml(i.mirror ?? '')}${i.osmTimestamp ? ` · OSM ${escapeHtml(i.osmTimestamp.slice(0, 10))}` : ''}</td></tr>
        <tr><td>Graphe</td><td>${i.nodes.toLocaleString('fr')} nœuds, ${i.edges.toLocaleString('fr')} arêtes, ${i.lengthKm.toFixed(0)} km</td></tr>
        <tr><td>Escaliers OSM</td><td><b>${i.stairs.ways}</b> ways (${i.steps} arêtes) · step_count ${pct((100 * i.stairs.withStepCount) / Math.max(1, i.stairs.ways))} · incline ${pct((100 * i.stairs.withIncline) / Math.max(1, i.stairs.ways))} · nom ${pct((100 * i.stairs.withName) / Math.max(1, i.stairs.ways))} · handrail ${pct((100 * i.stairs.withHandrail) / Math.max(1, i.stairs.ways))}</td></tr>
        <tr><td>Temps</td><td>chargement ${ms(i.downloadMs)} (${(i.bytes / 1e6).toFixed(1)} Mo${i.parts > 1 ? `, ${i.parts} parties` : ''}) · graphe ${ms(i.buildMs)} · altitudes ${ms(i.elevationMs)}</td></tr>
        <tr><td>Altitudes</td><td>${escapeHtml(i.elevationSource)}${i.missingEle ? ` · ${i.missingEle} sommets interpolés` : ''}</td></tr>
        <tr><td>Anomalies</td><td>${an ? `${an.bridgeEdges} ponts, ${an.tunnelEdges} tunnels, ${an.jumpEdges} sauts aberrants · ${an.corrected.length} arêtes corrigées` : '—'}</td></tr>
      </table>`;
  },
};

/* ---------------- Tracé ---------------- */
const traceTab: Tab = {
  id: 'trace',
  label: 'Tracé',
  mount(root, ctx) {
    root.innerHTML = `
      <h2>2. Tracé</h2>
      <p class="hint">Touchez la carte pour poser départ, points intermédiaires et arrivée. Le tracé est recalculé à chaque changement.</p>
      <div class="row">
        <button id="btn-undo">Annuler le dernier point</button>
        <button id="btn-clear">Effacer</button>
        <button id="btn-reverse">Inverser</button>
      </div>
      <fieldset><legend>Escaliers</legend>
        <label><input type="radio" name="stairs" value="avoid"> éviter</label>
        <label><input type="radio" name="stairs" value="tolerate" checked> tolérer</label>
        <label><input type="radio" name="stairs" value="prefer"> rechercher</label>
      </fieldset>
      <fieldset><legend>Pentes</legend>
        <label><input type="radio" name="slopes" value="limit"> limiter à <input type="number" id="max-grade" value="12" min="3" max="40" step="1" style="width:3.5em"> %</label>
        <label><input type="radio" name="slopes" value="neutral" checked> neutre</label>
        <label><input type="radio" name="slopes" value="seek"> rechercher</label>
      </fieldset>
      <label><input type="checkbox" id="avoid-major" checked> Éviter les grands axes</label>
      <label>Altitudes du profil <select id="route-ele">
        <option value="graph">celles du graphe</option>
        <option value="ign">IGN RGE ALTI (API, en ligne, tracé seul)</option>
        <option value="open-meteo">Open-Meteo (API, en ligne, tracé seul)</option>
      </select></label>
      <div id="trace-stats"></div>
      <div id="profile" class="profile"></div>
      <p id="trace-meta" class="muted small"></p>`;
    q<HTMLButtonElement>(root, '#btn-undo').addEventListener('click', () => {
      state.waypoints.pop();
      void computeRoute();
    });
    q<HTMLButtonElement>(root, '#btn-clear').addEventListener('click', () => {
      state.waypoints = [];
      state.route = null;
      state.analysis = null;
      state.generated = [];
      state.variants = [];
      state.hillRepeat = null;
      notify();
    });
    q<HTMLButtonElement>(root, '#btn-reverse').addEventListener('click', () => {
      state.waypoints.reverse();
      void computeRoute();
    });
    root.querySelectorAll<HTMLInputElement>('input[name=stairs]').forEach((r) =>
      r.addEventListener('change', () => {
        state.prefs.stairs = r.value as 'avoid' | 'tolerate' | 'prefer';
        void computeRoute();
      }),
    );
    root.querySelectorAll<HTMLInputElement>('input[name=slopes]').forEach((r) =>
      r.addEventListener('change', () => {
        state.prefs.slopes = r.value as 'limit' | 'neutral' | 'seek';
        void computeRoute();
      }),
    );
    q<HTMLInputElement>(root, '#max-grade').addEventListener('change', (e) => {
      state.prefs.maxGradePct = Number((e.target as HTMLInputElement).value) || 12;
      void computeRoute();
    });
    q<HTMLInputElement>(root, '#avoid-major').addEventListener('change', (e) => {
      state.prefs.avoidMajorRoads = (e.target as HTMLInputElement).checked;
      void computeRoute();
    });
    q<HTMLSelectElement>(root, '#route-ele').addEventListener('change', (e) => {
      state.routeElevation = (e.target as HTMLSelectElement).value as 'graph' | 'ign' | 'open-meteo';
      void analyzeCurrentRoute();
    });
    ctx.chart.onHover((i) => {
      const a = state.analysis;
      if (!a || i < 0 || i >= a.points.length) return;
      state.hoverIndex = i;
      ctx.mapCtl.setHover(a.points[i]!);
    });
  },
  update(s) {
    const st = document.getElementById('trace-stats');
    if (st) st.innerHTML = statsHtml(s.analysis);
    const meta = document.getElementById('trace-meta');
    if (meta) {
      const a = s.analysis;
      meta.textContent = a
        ? `${s.waypoints.length} points · routage ${ms(s.routeMs)} · ${a.segments.length} segments · ${a.climbs.length} montées · ${a.correctedEdges} arêtes corrigées${a.missingEle ? ` · ${a.missingEle} points sans altitude` : ''}`
        : s.graph
          ? `${s.waypoints.length} point(s) posé(s) — posez au moins 2 points.`
          : 'Chargez d’abord un graphe (onglet Zone).';
    }
  },
};

/* ---------------- Analyse ---------------- */
const analysisTab: Tab = {
  id: 'analysis',
  label: 'Analyse',
  mount(root) {
    const t = state.analysisOptions.thresholds;
    root.innerHTML = `
      <h2>3. Classification des segments</h2>
      <div class="grid2">
        <label>Plat &lt; <input type="number" id="th-flat" value="${t.flatPct}" step="0.5" min="0"> %</label>
        <label>Douce &lt; <input type="number" id="th-gentle" value="${t.gentlePct}" step="0.5"> %</label>
        <label>Modérée &lt; <input type="number" id="th-moderate" value="${t.moderatePct}" step="0.5"> %</label>
        <label>Raide &lt; <input type="number" id="th-steep" value="${t.steepPct}" step="0.5"> %</label>
        <label>Hauteur de marche <input type="number" id="th-step" value="${t.stepRiseM}" step="0.01" min="0.1"> m</label>
        <label>Lissage ± <input type="number" id="smooth" value="${state.analysisOptions.profile.smoothWindowM}" step="5" min="0"> m</label>
        <label>Seuil D+ <input type="number" id="gain-th" value="${state.analysisOptions.profile.gainThresholdM}" step="0.5" min="0"> m</label>
      </div>
      <div id="analysis-table"></div>
      <p class="hint">Escaliers = uniquement <code>highway=steps</code> OSM, jamais déduits du relief. Marches estimées = D+ / hauteur de marche, signalées par *.</p>`;
    const bind = (id: string, fn: (v: number) => void): void => {
      q<HTMLInputElement>(root, id).addEventListener('change', (e) => {
        fn(Number((e.target as HTMLInputElement).value));
        void analyzeCurrentRoute();
      });
    };
    bind('#th-flat', (v) => (state.analysisOptions.thresholds.flatPct = v));
    bind('#th-gentle', (v) => (state.analysisOptions.thresholds.gentlePct = v));
    bind('#th-moderate', (v) => (state.analysisOptions.thresholds.moderatePct = v));
    bind('#th-steep', (v) => (state.analysisOptions.thresholds.steepPct = v));
    bind('#th-step', (v) => (state.analysisOptions.thresholds.stepRiseM = v));
    bind('#smooth', (v) => (state.analysisOptions.profile.smoothWindowM = v));
    bind('#gain-th', (v) => (state.analysisOptions.profile.gainThresholdM = v));
  },
  update(s) {
    const el = document.getElementById('analysis-table');
    if (!el) return;
    const a = s.analysis;
    if (!a) {
      el.innerHTML = '<p class="muted">Aucun tracé.</p>';
      return;
    }
    const rows = a.breakdown.byKind
      .filter((k) => k.length > 0 || k.steps > 0)
      .map(
        (k) => `<tr><td><span class="swatch" style="background:${KIND_COLORS[k.kind]}"></span>${KIND_LABELS_FR[k.kind]}</td><td>${km(k.length)}</td><td>${pct((100 * k.length) / Math.max(1, a.length))}</td><td>+${Math.round(k.gain)} / −${Math.round(k.loss)}</td><td>${k.steps || ''}</td></tr>`,
      )
      .join('');
    el.innerHTML = `${statsHtml(a)}<table class="data"><thead><tr><th>Type</th><th>Dist.</th><th>%</th><th>D+ / D−</th><th>Marches</th></tr></thead><tbody>${rows}</tbody></table>
      <p class="small">${a.breakdown.stairsEdges} escalier(s) traversé(s), ${a.breakdown.totalSteps} marches dont ${a.breakdown.estimatedSteps} estimées · ${a.correctedEdges} arête(s) à altitude corrigée (pont/tunnel/saut) sur le tracé.</p>`;
  },
};

/* ---------------- Montées ---------------- */
function climbRow(c: Climb, i: number, selected: boolean): string {
  return `<li class="climb${selected ? ' selected' : ''}" data-i="${i}">
    <div class="climb-head"><b>${i + 1}. ${escapeHtml(c.name ?? 'Montée sans nom')}</b><span>${Math.round(c.gain)} m D+</span></div>
    <div class="small">${km(c.startD)} → ${km(c.endD)} · ${km(c.length)} · moy ${pct(c.avgGradePct)} · max ${pct(c.maxGradePct)} · ${c.steps ? `${c.steps} marches${c.stepsEstimated ? '*' : ''} · ` : ''}${formatDuration(c.durationS)}</div>
  </li>`;
}

const climbsTab: Tab = {
  id: 'climbs',
  label: 'Montées',
  mount(root, ctx) {
    root.innerHTML = `
      <h2>4. Montées détectées</h2>
      <div class="grid2">
        <label>D+ min <input type="number" id="climb-min" value="${state.analysisOptions.climbs.minGainM}" step="5" min="1"> m</label>
        <label>Creux toléré <input type="number" id="climb-dip" value="${state.analysisOptions.climbs.maxDipM}" step="1" min="0"> m</label>
      </div>
      <ol id="climb-list" class="climbs"></ol>`;
    q<HTMLInputElement>(root, '#climb-min').addEventListener('change', (e) => {
      state.analysisOptions.climbs.minGainM = Number((e.target as HTMLInputElement).value);
      void analyzeCurrentRoute();
    });
    q<HTMLInputElement>(root, '#climb-dip').addEventListener('change', (e) => {
      state.analysisOptions.climbs.maxDipM = Number((e.target as HTMLInputElement).value);
      void analyzeCurrentRoute();
    });
    q<HTMLOListElement>(root, '#climb-list').addEventListener('click', (e) => {
      const li = (e.target as HTMLElement).closest('li.climb');
      if (!li) return;
      const i = Number(li.getAttribute('data-i'));
      const a = state.analysis;
      if (!a) return;
      const c = a.climbs[i];
      if (!c) return;
      state.selectedClimb = i;
      const pts = a.points.slice(c.i, c.j + 1);
      ctx.mapCtl.setHighlight(pts);
      const lngs = pts.map((p) => p.lng);
      const lats = pts.map((p) => p.lat);
      ctx.mapCtl.map.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: 60, maxZoom: 17, duration: 500 });
      ctx.chart.highlightRange(c.i, c.j);
      notify();
    });
  },
  update(s) {
    const list = document.getElementById('climb-list');
    if (!list) return;
    const a = s.analysis;
    list.innerHTML = a ? (a.climbs.length ? a.climbs.map((c, i) => climbRow(c, i, i === s.selectedClimb)).join('') : '<p class="muted">Aucune montée détectée (tracé plat).</p>') : '<p class="muted">Aucun tracé.</p>';
  },
};

/* ---------------- Objectifs ---------------- */
const objectivesTab: Tab = {
  id: 'objectives',
  label: 'Objectifs',
  mount(root) {
    root.innerHTML = `
      <h2>5. Objectifs</h2>
      <div class="grid2">
        <label>Distance <input type="number" id="obj-dist" placeholder="ex. 8000" step="100" min="0"> m</label>
        <label>D+ <input type="number" id="obj-gain" placeholder="ex. 400" step="10" min="0"> m</label>
        <label>Ratio <input type="number" id="obj-ratio" placeholder="ex. 50" step="5" min="0"> m/km</label>
        <label>Tolérance ± <input type="number" id="obj-tol" value="10" step="1" min="0"> %</label>
      </div>
      <div id="obj-report"></div>`;
    const upd = (): void => {
      const n = (id: string): number | undefined => {
        const v = Number((root.querySelector(id) as HTMLInputElement).value);
        return v > 0 ? v : undefined;
      };
      const o = { tolerance: (n('#obj-tol') ?? 10) / 100 } as AppState['objectives'];
      const d = n('#obj-dist');
      const g = n('#obj-gain');
      const r = n('#obj-ratio');
      if (d) o.distanceM = d;
      if (g) o.gainM = g;
      if (r) o.ratioMPerKm = r;
      state.objectives = o;
      notify();
    };
    root.querySelectorAll('input').forEach((i) => i.addEventListener('input', upd));
  },
  update(s) {
    const el = document.getElementById('obj-report');
    if (!el) return;
    const r = evaluateObjectives(s.analysis, s.objectives);
    if (r.gaps.length === 0) {
      el.innerHTML = '<p class="muted">Saisissez au moins un objectif.</p>';
      return;
    }
    el.innerHTML = `<table class="data"><thead><tr><th>Objectif</th><th>Cible</th><th>Actuel</th><th>Écart</th></tr></thead><tbody>${r.gaps
      .map((g) => `<tr class="${g.ok ? 'ok' : 'ko'}"><td>${g.label}</td><td>${Math.round(g.target)} ${g.unit}</td><td>${Math.round(g.value)} ${g.unit}</td><td>${g.gap >= 0 ? '+' : ''}${Math.round(g.gap)} ${g.unit} (${(100 * g.gapPct).toFixed(0)} %) ${g.ok ? '✓' : '✗'}</td></tr>`)
      .join('')}</tbody></table>
      ${r.allOk ? '<p class="ok">Objectifs atteints dans la tolérance.</p>' : ''}
      <ul class="suggestions">${r.suggestions.map((x) => `<li>${escapeHtml(x)}</li>`).join('')}</ul>
      <p class="hint">Générez un A/R ou une boucle (onglet Générer) avec ces cibles.</p>`;
  },
};

/* ---------------- Générer ---------------- */
function generatedList(items: GeneratedRoute[], kind: string): string {
  if (items.length === 0) return '<p class="muted">Rien de généré.</p>';
  return `<table class="data"><thead><tr><th>#</th><th>Dist.</th><th>D+</th><th>Marches</th><th>Temps</th><th>Écart</th><th></th></tr></thead><tbody>${items
    .map((r, i) => `<tr><td>${i + 1}</td><td>${km(r.analysis.length)}</td><td>${Math.round(r.analysis.gainLoss.gain)}</td><td>${r.analysis.breakdown.totalSteps}</td><td>${formatDuration(r.analysis.time.totalS)}</td><td>${(100 * r.score).toFixed(0)} %</td><td><button data-use="${kind}:${i}" class="small">Utiliser</button></td></tr>`)
    .join('')}</tbody></table>`;
}

const generateTab: Tab = {
  id: 'generate',
  label: 'Générer',
  mount(root, ctx) {
    root.innerHTML = `
      <h2>6-7. Aller-retour, boucles, variantes</h2>
      <p class="hint">Le point de départ est le premier point posé (ou le centre de la carte si aucun).</p>
      <div class="grid2">
        <label>Distance cible <input type="number" id="gen-dist" value="5000" step="250" min="500"> m</label>
        <label>D+ cible <input type="number" id="gen-gain" placeholder="optionnel" step="10" min="0"> m</label>
      </div>
      <div class="row">
        <button id="btn-ar" class="primary">A/R même chemin</button>
        <button id="btn-ar2">A/R retour différent</button>
        <button id="btn-loop">Boucle</button>
      </div>
      <div id="gen-status" class="small muted"></div>
      <div id="gen-list"></div>
      <h3>Variantes du tracé courant</h3>
      <div class="row"><button id="btn-variants">Générer 3 à 5 variantes</button></div>
      <div id="var-list"></div>
      <h3>Hill repeats</h3>
      <div class="row">
        <select id="hr-climb"></select>
        <input type="number" id="hr-n" value="3" min="1" max="20" style="width:4em"> ×
        <button id="btn-hr">Calculer</button>
      </div>
      <div id="hr-result"></div>`;
    const targets = (): { distanceM?: number; gainM?: number } => {
      const t: { distanceM?: number; gainM?: number } = {};
      const d = Number(q<HTMLInputElement>(root, '#gen-dist').value);
      const g = Number(q<HTMLInputElement>(root, '#gen-gain').value);
      if (d > 0) t.distanceM = d;
      if (g > 0) t.gainM = g;
      return t;
    };
    const startNode = (): number => {
      const g = state.graph!;
      const p: LngLat = state.waypoints[0] ?? { lng: ctx.mapCtl.map.getCenter().lng, lat: ctx.mapCtl.map.getCenter().lat };
      return nearestNode(g, p, 2000);
    };
    const run = async (label: string, fn: () => GeneratedRoute[]): Promise<void> => {
      if (!state.graph) {
        state.error = 'Chargez un graphe d’abord.';
        notify();
        return;
      }
      state.busy = `${label}…`;
      notify();
      await nextFrame();
      const t0 = performance.now();
      try {
        state.generated = fn();
        const dt = performance.now() - t0;
        addTiming(label, dt);
        q<HTMLElement>(root, '#gen-status').textContent = `${label} : ${state.generated.length} résultat(s) en ${ms(dt)}`;
        state.error = state.generated.length ? null : 'Aucun parcours trouvé pour ces cibles (zone trop petite ?).';
      } catch (e) {
        state.error = (e as Error).message;
      } finally {
        state.busy = null;
        notify();
      }
    };
    q<HTMLButtonElement>(root, '#btn-ar').addEventListener('click', () => void run('A/R même chemin', () => outAndBack(state.graph!, startNode(), targets(), state.prefs, false, { analysis: state.analysisOptions })));
    q<HTMLButtonElement>(root, '#btn-ar2').addEventListener('click', () => void run('A/R retour différent', () => outAndBack(state.graph!, startNode(), targets(), state.prefs, true, { analysis: state.analysisOptions })));
    q<HTMLButtonElement>(root, '#btn-loop').addEventListener('click', () => void run('Boucle', () => generateLoops(state.graph!, startNode(), targets(), state.prefs, { analysis: state.analysisOptions })));
    q<HTMLButtonElement>(root, '#btn-variants').addEventListener('click', async () => {
      if (!state.graph || !state.route) {
        state.error = 'Tracez un itinéraire d’abord.';
        notify();
        return;
      }
      state.busy = 'Variantes…';
      notify();
      await nextFrame();
      const t0 = performance.now();
      state.variants = generateVariants(state.graph, state.route, state.prefs, { analysis: state.analysisOptions });
      addTiming('Variantes', performance.now() - t0);
      state.busy = null;
      notify();
    });
    q<HTMLButtonElement>(root, '#btn-hr').addEventListener('click', () => {
      const a = state.analysis;
      if (!state.graph || !state.route || !a) return;
      const i = Number(q<HTMLSelectElement>(root, '#hr-climb').value);
      const c = a.climbs[i];
      if (!c) return;
      const n = Math.max(1, Number(q<HTMLInputElement>(root, '#hr-n').value) || 1);
      state.hillRepeat = hillRepeats(state.graph, state.route, a.points, c, n, { analysis: state.analysisOptions });
      notify();
    });
    root.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button[data-use]');
      if (!b) return;
      const [kind, idx] = (b.getAttribute('data-use') ?? '').split(':');
      const i = Number(idx);
      if (kind === 'gen' && state.generated[i]) useGeneratedRoute(state.generated[i]!);
      if (kind === 'var' && state.variants[i]) useGeneratedRoute(state.variants[i]!);
      if (kind === 'hr' && state.hillRepeat) useGeneratedRoute(state.hillRepeat);
    });
    root.addEventListener('pointerover', (e) => {
      const tr = (e.target as HTMLElement).closest('tr[data-alt]');
      if (!tr || !state.graph) return;
      const i = Number(tr.getAttribute('data-alt'));
      ctx.mapCtl.setAltRoutes(state.graph, state.variants.map((v) => v.route), i);
    });
  },
  update(s, ctx) {
    const gl = document.getElementById('gen-list');
    if (gl) gl.innerHTML = generatedList(s.generated, 'gen');
    const vl = document.getElementById('var-list');
    if (vl) {
      if (s.variants.length === 0) vl.innerHTML = '<p class="muted">Aucune variante.</p>';
      else {
        vl.innerHTML = `<table class="data"><thead><tr><th>Variante</th><th>Dist.</th><th>D+</th><th>Esc. / marches</th><th>Raide+</th><th>Temps</th><th>Recouv.</th><th></th></tr></thead><tbody>${s.variants
          .map((v, i) => {
            const steep = v.analysis.breakdown.byKind.filter((k) => k.kind === 'steep' || k.kind === 'very_steep').reduce((x, k) => x + k.length, 0);
            return `<tr data-alt="${i}"><td><b>${escapeHtml(v.label)}</b><br><span class="small muted">${escapeHtml(v.description)}</span></td><td>${km(v.analysis.length)}</td><td>${Math.round(v.analysis.gainLoss.gain)}</td><td>${v.analysis.breakdown.stairsEdges} / ${v.analysis.breakdown.totalSteps}</td><td>${km(steep)}</td><td>${formatDuration(v.analysis.time.totalS)}</td><td>${(100 * v.overlap).toFixed(0)} %</td><td><button data-use="var:${i}" class="small">Utiliser</button></td></tr>`;
          })
          .join('')}</tbody></table>`;
      }
      if (s.graph) ctx.mapCtl.setAltRoutes(s.graph, s.variants.map((v) => v.route), -1);
    }
    const sel = document.getElementById('hr-climb') as HTMLSelectElement | null;
    if (sel) {
      const climbs = s.analysis?.climbs ?? [];
      const opts = climbs.map((c, i) => `<option value="${i}">${i + 1}. ${escapeHtml(c.name ?? 'Montée')} (+${Math.round(c.gain)} m)</option>`).join('');
      if (sel.innerHTML !== opts) sel.innerHTML = opts || '<option value="-1">Aucune montée</option>';
    }
    const hr = document.getElementById('hr-result');
    if (hr) {
      const h = s.hillRepeat;
      hr.innerHTML = h
        ? `<p><b>${h.times} ×</b> montée de ${km(h.single.length)} / +${Math.round(h.single.gainLoss.gain)} m → total ${km(h.analysis.length)}, D+ ${Math.round(h.analysis.gainLoss.gain)} m, D− ${Math.round(h.analysis.gainLoss.loss)} m, ${h.analysis.breakdown.totalSteps} marches, ${formatDuration(h.analysis.time.totalS)} <button data-use="hr:0" class="small">Utiliser</button></p>`
        : '';
    }
  },
};

/* ---------------- GPX ---------------- */
const gpxTab: Tab = {
  id: 'gpx',
  label: 'GPX',
  mount(root, ctx) {
    root.innerHTML = `
      <h2>9. Import / export GPX</h2>
      <label>Importer un GPX <input type="file" id="gpx-file" accept=".gpx,application/gpx+xml"></label>
      <div class="row"><button id="btn-export">Exporter le tracé courant</button><button id="btn-gpx-clear">Effacer l’import</button></div>
      <div id="gpx-result"></div>`;
    q<HTMLInputElement>(root, '#gpx-file').addEventListener('change', async (e) => {
      const f = (e.target as HTMLInputElement).files?.[0];
      if (!f) return;
      await importGpxText(await f.text(), ctx);
    });
    q<HTMLButtonElement>(root, '#btn-export').addEventListener('click', () => {
      const g = state.graph;
      const a = state.analysis;
      if (!g || !state.route || !a) {
        state.error = 'Aucun tracé à exporter.';
        notify();
        return;
      }
      const pts = a.points.map((p, i) => ({ lng: p.lng, lat: p.lat, ele: a.eles[i]! }));
      const xml = serializeGpx({ name: `RandoTrail ${km(a.length)} +${Math.round(a.gainLoss.gain)} m`, points: pts });
      const blob = new Blob([xml], { type: 'application/gpx+xml' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'randotrail.gpx';
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    });
    q<HTMLButtonElement>(root, '#btn-gpx-clear').addEventListener('click', () => {
      state.gpx = null;
      ctx.mapCtl.setGpx([], null);
      notify();
    });
  },
  update(s) {
    const el = document.getElementById('gpx-result');
    if (!el) return;
    const g = s.gpx;
    el.innerHTML = g
      ? `<h3>${escapeHtml(g.name)}</h3>${statsHtml(g.analysis)}<p class="small">${g.points.length} points · ${g.matchedStairs} segment(s) appariés à des escaliers OSM · ${g.missingEle} point(s) sans altitude dans le fichier (complétés)</p>
        <table class="data"><tbody>${g.analysis.breakdown.byKind.filter((k) => k.length > 0).map((k) => `<tr><td><span class="swatch" style="background:${KIND_COLORS[k.kind]}"></span>${KIND_LABELS_FR[k.kind]}</td><td>${km(k.length)}</td><td>+${Math.round(k.gain)} m</td></tr>`).join('')}</tbody></table>`
      : '<p class="muted">Aucun GPX importé.</p>';
  },
};

export async function importGpxText(text: string, ctx: PanelContext): Promise<void> {
  const t = parseGpx(text);
  if (t.points.length < 2) {
    state.error = 'GPX sans points de trace.';
    notify();
    return;
  }
  state.busy = 'Analyse du GPX…';
  notify();
  await nextFrame();
  let missing = t.points.filter((p) => !Number.isFinite(p.ele)).length;
  if (missing > 0) {
    const eles = await providers.terrarium.elevations(t.points);
    t.points.forEach((p, i) => {
      if (!Number.isFinite(p.ele)) p.ele = eles[i]!;
    });
  } else {
    missing = 0;
  }
  const prof = profileFromPolyline(t.points, segmentLengths(t.points));
  const matched = state.graph ? matchStairs(state.graph, prof) : 0;
  const analysis = analyzeProfile(state.graph, prof, state.analysisOptions as AnalysisOptions);
  state.gpx = { name: t.name, points: t.points, analysis, matchedStairs: matched, missingEle: missing };
  ctx.mapCtl.setGpx(t.points, analysis);
  const lngs = t.points.map((p) => p.lng);
  const lats = t.points.map((p) => p.lat);
  ctx.mapCtl.map.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: 40, duration: 500 });
  state.busy = null;
  notify();
}

/* ---------------- Labo ---------------- */
const REFERENCE_POINTS: { name: string; lng: number; lat: number; publicAlt: number }[] = [
  { name: 'Esplanade de Fourvière', lat: 45.76235, lng: 4.8225, publicAlt: 287 },
  { name: 'Place Bellecour', lat: 45.75777, lng: 4.83215, publicAlt: 168 },
  { name: 'Place de la Croix-Rousse', lat: 45.77445, lng: 4.83165, publicAlt: 250 },
  { name: 'Place des Terreaux', lat: 45.76737, lng: 4.8336, publicAlt: 170 },
  { name: 'Quai Saint-Antoine', lat: 45.7623, lng: 4.8316, publicAlt: 166 },
  { name: 'Place Saint-Jean', lat: 45.7608, lng: 4.8272, publicAlt: 170 },
  { name: "Tête d'Or (lac)", lat: 45.7776, lng: 4.853, publicAlt: 170 },
  { name: 'Pont Bonaparte (tablier)', lat: 45.7604, lng: 4.8298, publicAlt: 172 },
];

const labTab: Tab = {
  id: 'lab',
  label: 'Labo',
  mount(root) {
    const tm = state.analysisOptions.time;
    root.innerHTML = `
      <h2>Labo (R1–R4)</h2>
      <h3>R3 · Sources d’altitude sur points de référence</h3>
      <div class="row"><button id="btn-ele-test">Tester Terrarium / IGN / Open-Meteo (réseau)</button></div>
      <div id="ele-test"></div>
      <h3>R4 · Temps mesurés</h3>
      <div id="timings"></div>
      <h3>8 · Modèle de temps</h3>
      <div class="grid2">
        <label>Course <input type="number" id="tm-run" value="${tm.runSpeedKmh}" step="0.5"> km/h</label>
        <label>Marche rapide <input type="number" id="tm-walk" value="${tm.walkSpeedKmh}" step="0.5"> km/h</label>
        <label>Marche si pente ≥ <input type="number" id="tm-walkabove" value="${tm.walkAbovePct}" step="1"> %</label>
        <label>Coût D+ <input type="number" id="tm-ascent" value="${tm.ascentSPerM}" step="0.5"> s/m</label>
        <label>Escalier montée <input type="number" id="tm-up" value="${tm.stairsUpVerticalMh}" step="50"> m/h vertical</label>
        <label>Escalier descente <input type="number" id="tm-down" value="${tm.stairsDownVerticalMh}" step="50"> m/h vertical</label>
      </div>
      <p class="hint">Rapport complet : <a href="https://github.com/thijoubert/RandoTrail/blob/main/REPORT.md" target="_blank" rel="noopener">REPORT.md</a></p>`;
    const bind = (id: string, fn: (v: number) => void): void => {
      q<HTMLInputElement>(root, id).addEventListener('change', (e) => {
        fn(Number((e.target as HTMLInputElement).value));
        void analyzeCurrentRoute();
      });
    };
    bind('#tm-run', (v) => (state.analysisOptions.time.runSpeedKmh = v));
    bind('#tm-walk', (v) => (state.analysisOptions.time.walkSpeedKmh = v));
    bind('#tm-walkabove', (v) => (state.analysisOptions.time.walkAbovePct = v));
    bind('#tm-ascent', (v) => (state.analysisOptions.time.ascentSPerM = v));
    bind('#tm-up', (v) => (state.analysisOptions.time.stairsUpVerticalMh = v));
    bind('#tm-down', (v) => (state.analysisOptions.time.stairsDownVerticalMh = v));
    q<HTMLButtonElement>(root, '#btn-ele-test').addEventListener('click', async () => {
      const out = q<HTMLElement>(root, '#ele-test');
      out.innerHTML = '<p class="busy">Requêtes en cours…</p>';
      const pts = REFERENCE_POINTS.map((p) => ({ lng: p.lng, lat: p.lat }));
      const results: Record<string, { eles: number[]; ms: number; error: string | null }> = {};
      for (const [id, prov] of [['terrarium', providers.terrarium], ['ign', providers.ign], ['open-meteo', providers.openMeteo]] as const) {
        const t0 = performance.now();
        const before = prov.stats.errors.length;
        const eles = await prov.elevations(pts);
        results[id] = { eles, ms: performance.now() - t0, error: prov.stats.errors.length > before ? prov.stats.errors[prov.stats.errors.length - 1]! : null };
      }
      const r = (id: string, i: number): string => {
        const v = results[id]!.eles[i]!;
        return Number.isFinite(v) ? v.toFixed(1) : '✗';
      };
      out.innerHTML = `<table class="data"><thead><tr><th>Point</th><th>Réf.</th><th>Terrarium</th><th>IGN</th><th>Open-Meteo</th></tr></thead><tbody>${REFERENCE_POINTS.map((p, i) => `<tr><td>${escapeHtml(p.name)}</td><td>${p.publicAlt}</td><td>${r('terrarium', i)}</td><td>${r('ign', i)}</td><td>${r('open-meteo', i)}</td></tr>`).join('')}</tbody></table>
        <p class="small">${(['terrarium', 'ign', 'open-meteo'] as const).map((id) => `${id} : ${ms(results[id]!.ms)}${results[id]!.error ? ` — erreur : ${escapeHtml(results[id]!.error!)}` : ' — OK (CORS accepté)'}`).join('<br>')}</p>`;
    });
  },
  update(s) {
    const el = document.getElementById('timings');
    if (!el) return;
    const last = s.timings.slice(-12).reverse();
    el.innerHTML = last.length ? `<table class="data"><tbody>${last.map((t) => `<tr><td>${escapeHtml(t.label)}</td><td>${ms(t.ms)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Aucune mesure.</p>';
  },
};

export const TABS: Tab[] = [zoneTab, traceTab, analysisTab, climbsTab, objectivesTab, generateTab, gpxTab, labTab];

/** Coordinates of the current route for highlighting helpers. */
export function currentRouteCoords(): LngLat[] {
  return state.graph && state.route ? routeCoords(state.graph, state.route) : [];
}
