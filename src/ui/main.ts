import './style.css';
import { createMap } from './map';
import { createProfileChart } from './chart';
import { TABS, type PanelContext } from './panels';
import { computeRoute } from './pipeline';
import { notify, state, subscribe } from './state';
import { escapeHtml } from './format';

const app = document.getElementById('app')!;
app.innerHTML = `
  <header class="top"><span class="title">RandoTrail · labo urban trail</span><span class="status" id="top-status">Aucun graphe</span></header>
  <div id="map"><div id="error"><span id="error-text"></span><button id="error-close" aria-label="Fermer">×</button></div><div id="busy"></div></div>
  <div class="sheet" id="sheet">
    <nav class="tabs" id="tabs"></nav>
    <div class="panel" id="panel"></div>
  </div>`;

const mapCtl = createMap(document.getElementById('map')!, state.zone.center, state.zone.zoom);
const tabsNav = document.getElementById('tabs')!;
const panel = document.getElementById('panel')!;
const sections = new Map<string, HTMLElement>();
for (const t of TABS) {
  const b = document.createElement('button');
  b.textContent = t.label;
  b.dataset['tab'] = t.id;
  b.addEventListener('click', () => {
    state.tab = t.id;
    notify();
  });
  tabsNav.append(b);
  const sec = document.createElement('section');
  sec.id = `tab-${t.id}`;
  panel.append(sec);
  sections.set(t.id, sec);
}
const grip = document.createElement('button');
grip.className = 'grip';
grip.textContent = '⇅';
grip.setAttribute('aria-label', 'Agrandir / réduire');
grip.addEventListener('click', () => {
  document.getElementById('sheet')!.classList.toggle('expanded');
  setTimeout(() => mapCtl.map.resize(), 350);
});
tabsNav.append(grip);

const chart = createProfileChart(document.createElement('div'));
const ctx: PanelContext = { mapCtl, chart };
for (const t of TABS) t.mount(sections.get(t.id)!, ctx);
// The profile chart lives in the Tracé tab.
const profileHost = document.getElementById('profile')!;
const chartEl = createProfileChart(profileHost);
ctx.chart = chartEl;
chart.destroy();
chartEl.onHover((i) => {
  const a = state.analysis;
  if (!a || i < 0 || i >= a.points.length) return;
  mapCtl.setHover(a.points[i]!);
});

mapCtl.onClick((p) => {
  if (state.mode !== 'trace' || !state.graph) return;
  state.waypoints.push(p);
  void computeRoute();
});
mapCtl.onRouteHover((p) => {
  const a = state.analysis;
  if (!a) return;
  if (!p) {
    mapCtl.setHover(null);
    return;
  }
  // Nearest profile point to the pointer: sync the chart cursor.
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < a.points.length; i++) {
    const q = a.points[i]!;
    const d = (q.lng - p.lng) ** 2 + (q.lat - p.lat) ** 2;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  chartEl.setCursor(best);
  mapCtl.setHover(a.points[best]!);
});

document.getElementById('error-close')!.addEventListener('click', () => {
  state.error = null;
  notify();
});

let lastGraph: unknown = null;
let lastAnalysis: unknown = null;
subscribe((s) => {
  for (const b of tabsNav.querySelectorAll<HTMLButtonElement>('button[data-tab]')) b.classList.toggle('active', b.dataset['tab'] === s.tab);
  for (const [id, sec] of sections) sec.classList.toggle('active', id === s.tab);
  document.getElementById('top-status')!.textContent = s.busy ?? (s.graphInfo ? `${s.graphInfo.zone.label.split(' (')[0]} · ${s.graphInfo.steps} escaliers` : 'Aucun graphe');
  const err = document.getElementById('error')!;
  err.classList.toggle('show', !!s.error);
  document.getElementById('error-text')!.innerHTML = escapeHtml(s.error ?? '');
  const busy = document.getElementById('busy')!;
  busy.classList.toggle('show', !!s.busy);
  busy.textContent = s.busy ?? '';
  if (s.graph !== lastGraph) {
    lastGraph = s.graph;
    mapCtl.setGraph(s.graph);
    if (s.graph) mapCtl.fitZone(s.graph.bbox);
  }
  mapCtl.setWaypoints(s.waypoints);
  if (s.analysis !== lastAnalysis) {
    lastAnalysis = s.analysis;
    mapCtl.setRoute(s.graph, s.route, s.analysis);
    chartEl.setAnalysis(s.analysis);
    if (s.selectedClimb < 0) mapCtl.setHighlight([]);
  }
  for (const t of TABS) t.update(s, ctx);
});
notify();

// PWA: minimal service worker (app shell cache).
if ('serviceWorker' in navigator && !location.hostname.includes('localhost')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined);
  });
}

// Expose for E2E tests and debugging.
declare global {
  interface Window {
    __randotrail: { state: typeof state; computeRoute: typeof computeRoute; mapCtl: typeof mapCtl };
  }
}
window.__randotrail = { state, computeRoute, mapCtl };
