/**
 * Computes the REPORT.md numbers (R1–R4) from the real fixtures. Run with: npx vite-node scripts/report-data.mts
 * Outputs docs/report-data.json, docs/report-tables.md and expected/lyon-reference-routes.json.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { PNG } from 'pngjs';
import { parseOverpass, buildGraph, stairsStats, parseNumber, type OverpassJson, type OsmWay } from '../src/core/osm';
import { assignElevations, correctAnomalies, decodeTilePixels, elevationsFromTiles, fillMissingElevations, graphVertices, stats, tileKey, vertexElevationsById, type ElevationTile } from '../src/core/elevation';
import { analyzeRoute, DEFAULT_ANALYSIS_OPTIONS, type AnalysisOptions } from '../src/core/analysis';
import { DEFAULT_PREFERENCES, type RoutingPreferences } from '../src/core/cost';
import { nearestNode, type Graph } from '../src/core/graph';
import { routeThrough } from '../src/core/router';
import { outAndBack, generateLoops } from '../src/core/generate';
import { generateVariants } from '../src/core/variants';
import { fastDistance, LYON_CENTRE, type LngLat } from '../src/core/geo';

const F = 'fixtures/';
const must = (f: string): string => {
  if (!existsSync(F + f)) throw new Error(`missing fixture ${f} (run the fetch-data workflow)`);
  return F + f;
};
const osmText = readFileSync(must('lyon-centre.overpass.json'), 'utf8');
const osm = JSON.parse(osmText) as OverpassJson;
const known = existsSync(F + 'lyon-known-stairs.overpass.json') ? (JSON.parse(readFileSync(F + 'lyon-known-stairs.overpass.json', 'utf8')) as OverpassJson) : { elements: [] };
const ignFile = existsSync(F + 'lyon-centre.ign-alti.json') ? (JSON.parse(readFileSync(F + 'lyon-centre.ign-alti.json', 'utf8')) as { nodes: Record<string, number>; count: number }) : null;
const refs = existsSync(F + 'lyon-reference-elevations.json') ? JSON.parse(readFileSync(F + 'lyon-reference-elevations.json', 'utf8')) : null;
const probes = existsSync(F + 'network-probes.json') ? JSON.parse(readFileSync(F + 'network-probes.json', 'utf8')) : null;
const meta = existsSync(F + 'meta.json') ? JSON.parse(readFileSync(F + 'meta.json', 'utf8')) : null;

const out: Record<string, unknown> = { generatedAt: new Date().toISOString(), meta };
const md: string[] = [];
const r = (v: number, d = 1): string => (Number.isFinite(v) ? v.toFixed(d) : '—');
const pc = (a: number, b: number): string => (b ? `${((100 * a) / b).toFixed(0)} %` : '—');

/* ---------------- Terrarium from fixture tiles ---------------- */
const tiles = new Map<string, ElevationTile>();
function loadTerrarium(): void {
  const z = 14;
  for (let x = 8405; x <= 8418; x++) {
    for (let y = 5838; y <= 5850; y++) {
      const f = `${F}terrarium/${z}/${x}/${y}.png`;
      if (!existsSync(f)) continue;
      const png = PNG.sync.read(readFileSync(f));
      tiles.set(tileKey({ z, x, y }), { coord: { z, x, y }, data: decodeTilePixels(png.data, 'terrarium') });
    }
  }
}
loadTerrarium();
const terrarium = (pts: LngLat[]): number[] => elevationsFromTiles(pts, tiles, 14);

/* ---------------- Graph ---------------- */
const t0 = performance.now();
const ways = parseOverpass(osm);
const tParse = performance.now() - t0;
const t1 = performance.now();
const graph = buildGraph(ways, { bbox: LYON_CENTRE });
const tBuild = performance.now() - t1;
const verts = graphVertices(graph);
const t2 = performance.now();
const terrEles = terrarium(verts);
const tTerr = performance.now() - t2;

function makeGraph(source: 'ign' | 'terrarium', correct: boolean): Graph {
  const g = buildGraph(ways, { bbox: LYON_CENTRE });
  if (source === 'ign' && ignFile) assignElevations(g, vertexElevationsById(g, ignFile.nodes));
  else assignElevations(g, terrarium(graphVertices(g)));
  fillMissingElevations(g);
  if (correct) correctAnomalies(g);
  return g;
}
const hasIgn = !!ignFile && ignFile.count > 1000;
const mainSource: 'ign' | 'terrarium' = hasIgn ? 'ign' : 'terrarium';
const G = makeGraph(mainSource, true);
const anomalies = correctAnomalies(makeGraph(mainSource, false));

/* ---------------- R1 ---------------- */
md.push('## R1 — Escaliers dans OSM (zone Lyon centre)');
const ss = stairsStats(ways);
const stepsWays = ways.filter((w) => w.tags['highway'] === 'steps');
const inclineVals = new Map<string, number>();
const surfaceVals = new Map<string, number>();
for (const w of stepsWays) {
  const inc = w.tags['incline'];
  if (inc) inclineVals.set(inc, (inclineVals.get(inc) ?? 0) + 1);
  const su = w.tags['surface'];
  if (su) surfaceVals.set(su, (surfaceVals.get(su) ?? 0) + 1);
}
const stepCounts = stepsWays.map((w) => parseNumber(w.tags['step_count'])).filter((v): v is number => v !== undefined);
stepCounts.sort((a, b) => a - b);
const median = (a: number[]): number => (a.length ? a[Math.floor(a.length / 2)]! : NaN);
out['r1'] = {
  stats: ss,
  pct: { stepCount: (100 * ss.withStepCount) / ss.ways, incline: (100 * ss.withIncline) / ss.ways, name: (100 * ss.withName) / ss.ways, handrail: (100 * ss.withHandrail) / ss.ways, surface: (100 * ss.withSurface) / ss.ways, width: (100 * ss.withWidth) / ss.ways, lit: (100 * ss.withLit) / ss.ways },
  stepCountMedian: median(stepCounts),
  stepCountMax: stepCounts[stepCounts.length - 1],
  inclineValues: [...inclineVals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8),
  surfaceValues: [...surfaceVals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8),
};
md.push(`| Indicateur | Valeur |\n|---|---|\n| Ways \`highway=steps\` | **${ss.ways}** (${ss.totalLengthM.toFixed(0)} m cumulés) |\n| avec \`step_count\` | ${ss.withStepCount} (${pc(ss.withStepCount, ss.ways)}) — médiane ${median(stepCounts)} marches, max ${stepCounts[stepCounts.length - 1]} |\n| avec \`incline\` | ${ss.withIncline} (${pc(ss.withIncline, ss.ways)}) — valeurs : ${[...inclineVals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k} ×${v}`).join(', ')} |\n| avec \`name\` | ${ss.withName} (${pc(ss.withName, ss.ways)}) |\n| avec \`handrail*\` | ${ss.withHandrail} (${pc(ss.withHandrail, ss.ways)}) |\n| avec \`surface\` | ${ss.withSurface} (${pc(ss.withSurface, ss.ways)}) |\n| avec \`width\` | ${ss.withWidth} (${pc(ss.withWidth, ss.ways)}) |\n| avec \`lit\` | ${ss.withLit} (${pc(ss.withLit, ss.ways)}) |\n| Somme des \`step_count\` renseignés | ${ss.totalStepCount} marches |`);

// Known stairs lookup.
const norm = (s: string): string => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const KNOWN = ['Montée du Gourguillon', 'Montée Saint-Barthélemy', 'Montée des Chazeaux', 'Montée de la Grande-Côte', 'Montée des Carmélites', 'Montée Nicolas de Lange', 'Montée des Épies', 'Montée du Garillan', 'Montée du Chemin Neuf', 'Montée Saint-Sébastien', 'Montée de la Sarra', 'Escaliers Mermet', 'Montée des Esses', 'Montée du Change', 'Montée Rey', 'Montée Hoche', 'Montée de Choulans', 'Montée Bonafous', 'Montée du Télégraphe', 'Rue Pouteau'];
const allWays: OsmWay[] = [...ways, ...parseOverpass(known)];
const seenIds = new Set<number>();
const uniqueWays = allWays.filter((w) => (seenIds.has(w.id) ? false : (seenIds.add(w.id), true)));
const knownRows: Record<string, unknown>[] = [];
md.push('\n### Escaliers et montées connus\n\n| Nom | Dans OSM | Ways `steps` | Autres `highway` | step_count | incline | handrail | surface |\n|---|---|---|---|---|---|---|---|');
for (const name of KNOWN) {
  const key = norm(name).replace(/^(montee|escaliers?|rue) (du |de la |des |de |d )?/, '');
  const matches = uniqueWays.filter((w) => w.tags['name'] && norm(w.tags['name']!).includes(key));
  const steps = matches.filter((w) => w.tags['highway'] === 'steps');
  const others = [...new Set(matches.filter((w) => w.tags['highway'] !== 'steps').map((w) => w.tags['highway']))];
  const sc = steps.map((w) => w.tags['step_count']).filter(Boolean);
  const inc = [...new Set(steps.map((w) => w.tags['incline']).filter(Boolean))];
  const hr = [...new Set(steps.map((w) => w.tags['handrail']).filter(Boolean))];
  const su = [...new Set(steps.map((w) => w.tags['surface']).filter(Boolean))];
  const stepLen = steps.reduce((a, w) => a + w.coords.reduce((acc, c, i) => acc + (i ? fastDistance(w.coords[i - 1]!, c) : 0), 0), 0);
  knownRows.push({ name, found: matches.length > 0, stepsWays: steps.length, stepsLengthM: Math.round(stepLen), otherHighways: others, stepCount: sc, incline: inc, handrail: hr, surface: su });
  md.push(`| ${name} | ${matches.length ? '✅' : '❌ absent'} | ${steps.length ? `${steps.length} (${stepLen.toFixed(0)} m)` : '—'} | ${others.join(', ') || '—'} | ${sc.length ? `${sc.length}/${steps.length} : ${sc.join(', ')}` : steps.length ? '0/' + steps.length : '—'} | ${inc.join(', ') || '—'} | ${hr.join(', ') || '—'} | ${su.join(', ') || '—'} |`);
}
out['r1Known'] = knownRows;

// Step count estimation reliability (OSM step_count vs |Δh| / 0.17 with IGN and Terrarium).
const est: { name: string; real: number; dhIgn: number; dhTerr: number; estIgn: number; estTerr: number; length: number }[] = [];
for (const w of stepsWays) {
  const sc = parseNumber(w.tags['step_count']);
  if (sc === undefined || sc < 3) continue;
  const a = w.coords[0]!;
  const b = w.coords[w.coords.length - 1]!;
  const ia = ignFile?.nodes[String(w.nodeIds[0])];
  const ib = ignFile?.nodes[String(w.nodeIds[w.nodeIds.length - 1])];
  const [ta, tb] = terrarium([a, b]);
  const len = w.coords.reduce((acc, c, i) => acc + (i ? fastDistance(w.coords[i - 1]!, c) : 0), 0);
  const dhIgn = ia !== undefined && ib !== undefined ? Math.abs(ib - ia) : NaN;
  const dhTerr = Math.abs(tb! - ta!);
  est.push({ name: w.tags['name'] ?? `way ${w.id}`, real: sc, dhIgn, dhTerr, estIgn: Math.round(dhIgn / 0.17), estTerr: Math.round(dhTerr / 0.17), length: len });
}
const relErr = (arr: number[]): { mae: number; medAbs: number; medRel: number; within25: number; within50: number } => {
  const errs = est.map((e, i) => arr[i]! - e.real).filter((x) => Number.isFinite(x));
  const abs = errs.map(Math.abs).sort((a, b) => a - b);
  const rel = est.map((e, i) => Math.abs(arr[i]! - e.real) / e.real).filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  return { mae: abs.reduce((a, b) => a + b, 0) / abs.length, medAbs: median(abs), medRel: median(rel), within25: rel.filter((x) => x <= 0.25).length / rel.length, within50: rel.filter((x) => x <= 0.5).length / rel.length };
};
const estIgn = hasIgn ? relErr(est.map((e) => e.estIgn)) : null;
const estTerr = relErr(est.map((e) => e.estTerr));
const impliedRise = est.map((e) => e.dhIgn / e.real).filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
const calib = median(impliedRise);
const estIgnCal = hasIgn ? relErr(est.map((e) => Math.round(e.dhIgn / calib))) : null;
const estTerrCal = relErr(est.map((e) => Math.round(e.dhTerr / calib)));
// Long stairs only (>= 30 m): DEM resolution matters less.
const longIdx = est.map((e, i) => (e.length >= 30 ? i : -1)).filter((i) => i >= 0);
const relErrSub = (arr: number[], idx: number[]): { medRel: number; within25: number; within50: number; n: number } => {
  const rel = idx.map((i) => Math.abs(arr[i]! - est[i]!.real) / est[i]!.real).filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  return { n: rel.length, medRel: median(rel), within25: rel.filter((x) => x <= 0.25).length / rel.length, within50: rel.filter((x) => x <= 0.5).length / rel.length };
};
const longIgn = hasIgn ? relErrSub(est.map((e) => Math.round(e.dhIgn / calib)), longIdx) : null;
const longTerr = relErrSub(est.map((e) => Math.round(e.dhTerr / calib)), longIdx);
out['r1Estimation'] = { n: est.length, ign: estIgn, terrarium: estTerr, impliedStepRiseMedianIgn: calib, calibrated: { ign: estIgnCal, terrarium: estTerrCal }, longStairs: { n: longIdx.length, ign: longIgn, terrarium: longTerr }, sample: est.slice(0, 200) };
md.push(`\n### Fiabilité de l'estimation des marches (marches = |Δh| / hauteur de marche)\n\nSur les **${est.length}** escaliers ayant un \`step_count\` ≥ 3 (Δh = différence d'altitude entre les deux extrémités de la way) :\n\n| Source d'altitude | Hauteur de marche | Erreur abs. moyenne | Erreur abs. médiane | Erreur relative médiane | ≤ 25 % d'erreur | ≤ 50 % d'erreur |\n|---|---|---|---|---|---|---|\n${estIgn ? `| IGN RGE ALTI 1 m | 0,17 m | ${r(estIgn.mae)} marches | ${r(estIgn.medAbs, 0)} | ${r(100 * estIgn.medRel, 0)} % | ${r(100 * estIgn.within25, 0)} % | ${r(100 * estIgn.within50, 0)} % |\n| IGN RGE ALTI 1 m | ${r(calib, 3)} m (calibrée) | ${r(estIgnCal!.mae)} marches | ${r(estIgnCal!.medAbs, 0)} | ${r(100 * estIgnCal!.medRel, 0)} % | ${r(100 * estIgnCal!.within25, 0)} % | ${r(100 * estIgnCal!.within50, 0)} % |\n` : ''}| Terrarium z14 (~30 m) | 0,17 m | ${r(estTerr.mae)} marches | ${r(estTerr.medAbs, 0)} | ${r(100 * estTerr.medRel, 0)} % | ${r(100 * estTerr.within25, 0)} % | ${r(100 * estTerr.within50, 0)} % |\n| Terrarium z14 (~30 m) | ${r(calib, 3)} m (calibrée) | ${r(estTerrCal.mae)} marches | ${r(estTerrCal.medAbs, 0)} | ${r(100 * estTerrCal.medRel, 0)} % | ${r(100 * estTerrCal.within25, 0)} % | ${r(100 * estTerrCal.within50, 0)} % |\n\nHauteur de marche implicite médiane (Δh IGN / step_count) : **${r(calib, 3)} m** (au lieu des 0,17 m attendus : le MNT 1 m « lisse » les escaliers et les extrémités des ways ne coïncident pas toujours avec le bas et le haut des marches).\n\nEscaliers longs (≥ 30 m, n = ${longIdx.length}), hauteur calibrée : IGN erreur relative médiane ${longIgn ? r(100 * longIgn.medRel, 0) : '—'} %, ≤ 25 % : ${longIgn ? r(100 * longIgn.within25, 0) : '—'} % ; Terrarium erreur relative médiane ${r(100 * longTerr.medRel, 0)} %, ≤ 25 % : ${r(100 * longTerr.within25, 0)} %.`);

/* ---------------- R2 ---------------- */
md.push('\n## R2 — Le routage réagit-il aux préférences ?');
const BELLECOUR = { lng: 4.83215, lat: 45.75777 };
const FOURVIERE = { lng: 4.8225, lat: 45.76235 };
const CROIX_ROUSSE = { lng: 4.83165, lat: 45.77445 };
const TERREAUX = { lng: 4.8336, lat: 45.76737 };
const prefs = (p: Partial<RoutingPreferences>): RoutingPreferences => ({ ...DEFAULT_PREFERENCES, ...p });
const SAINT_PAUL = { lng: 4.8277, lat: 45.7658 };
const r2Cases: [string, LngLat[]][] = [
  ['Bellecour → Fourvière', [BELLECOUR, FOURVIERE]],
  ['Terreaux → Croix-Rousse', [TERREAUX, CROIX_ROUSSE]],
  ['Saint-Paul → Fourvière', [SAINT_PAUL, FOURVIERE]],
  ['Quai Saint-Antoine → Croix-Rousse', [{ lng: 4.8316, lat: 45.7623 }, CROIX_ROUSSE]],
];
const r2: Record<string, unknown>[] = [];
md.push('| Trajet | Préférence | Distance | D+ | Escaliers (arêtes) | Marches | Noms d\'escaliers empruntés | Temps A* (Node) |\n|---|---|---|---|---|---|---|---|');
for (const [label, pts] of r2Cases) {
  for (const stairs of ['avoid', 'tolerate', 'prefer'] as const) {
    const tt = performance.now();
    const route = routeThrough(G, pts, prefs({ stairs }));
    const ms = performance.now() - tt;
    if (!route) {
      md.push(`| ${label} | ${stairs} | — | — | — | — | aucun itinéraire | — |`);
      continue;
    }
    const a = analyzeRoute(G, route);
    const names = [...new Set(a.segments.filter((s) => s.steps !== undefined && s.name).map((s) => s.name!))];
    r2.push({ label, stairs, length: a.length, gain: a.gainLoss.gain, loss: a.gainLoss.loss, stairsEdges: a.breakdown.stairsEdges, steps: a.breakdown.totalSteps, estimatedSteps: a.breakdown.estimatedSteps, names, ms, edges: route.edges.length });
    md.push(`| ${label} | ${stairs} | ${r(a.length, 0)} m | ${r(a.gainLoss.gain, 0)} m | ${a.breakdown.stairsEdges} | ${a.breakdown.totalSteps}${a.breakdown.estimatedSteps ? ` (dont ${a.breakdown.estimatedSteps} est.)` : ''} | ${names.slice(0, 4).join(', ') || '—'} | ${r(ms, 0)} ms |`);
  }
}
// Slope preference effect.
for (const slopes of ['neutral', 'limit', 'seek'] as const) {
  const route = routeThrough(G, [BELLECOUR, FOURVIERE], prefs({ stairs: 'avoid', slopes, maxGradePct: 8 }));
  if (!route) continue;
  const a = analyzeRoute(G, route);
  const steep = a.breakdown.byKind.filter((k) => k.kind === 'steep' || k.kind === 'very_steep').reduce((x, k) => x + k.length, 0);
  r2.push({ label: 'Bellecour → Fourvière (sans escaliers)', slopes, length: a.length, gain: a.gainLoss.gain, steepLength: steep, maxGrade: Math.max(...a.climbs.map((c) => c.maxGradePct), 0) });
  md.push(`| Bellecour → Fourvière, escaliers évités | pentes : ${slopes}${slopes === 'limit' ? ' (8 %)' : ''} | ${r(a.length, 0)} m | ${r(a.gainLoss.gain, 0)} m | — | — | raide+très raide : ${r(steep, 0)} m, pente max ${r(Math.max(...a.climbs.map((c) => c.maxGradePct), 0), 0)} % | — |`);
}
out['r2'] = r2;

/* ---------------- R3 ---------------- */
md.push('\n## R3 — Fiabilité des altitudes');
if (refs) {
  md.push('### Points de référence\n\n| Point | Valeur publique | IGN RGE ALTI | Open-Meteo (GLO-90) | Terrarium z14 | Écart Terrarium−IGN | Écart Open-Meteo−IGN |\n|---|---|---|---|---|---|---|');
  const rows: Record<string, unknown>[] = [];
  for (const p of refs.references) {
    const [t] = terrarium([{ lng: p.lng, lat: p.lat }]);
    rows.push({ ...p, terrarium: t });
    md.push(`| ${p.name} | ${p.publicAlt} m | ${r(p.ign)} | ${r(p.openMeteo)} | ${r(t!)} | ${r(t! - p.ign)} | ${r(p.openMeteo - p.ign)} |`);
  }
  out['r3References'] = rows;
  const sampleMeteo = refs.sample.filter((s: { ign: number | null; openMeteo: number | null }) => s.ign !== null && s.openMeteo !== null);
  const dMeteo = stats(sampleMeteo.map((s: { ign: number; openMeteo: number }) => s.openMeteo - s.ign));
  const sampleTerr = terrarium(refs.sample.map((s: { lng: number; lat: number }) => ({ lng: s.lng, lat: s.lat })));
  const dTerrSample = stats(refs.sample.map((s: { ign: number | null }, i: number) => (s.ign !== null ? sampleTerr[i]! - s.ign : NaN)));
  out['r3Sample'] = { openMeteoVsIgn: dMeteo, terrariumVsIgn: dTerrSample };
  md.push(`\n### Écarts par rapport à IGN RGE ALTI sur ${sampleMeteo.length} nœuds du graphe (échantillon régulier)\n\n| Source | Biais moyen | Erreur abs. moyenne | RMSE | P90 | Max |\n|---|---|---|---|---|---|\n| Open-Meteo (GLO-90) | ${r(dMeteo.mean, 2)} m | ${r(dMeteo.mae, 2)} m | ${r(dMeteo.rmse, 2)} m | ${r(dMeteo.p90, 1)} m | ${r(dMeteo.max, 1)} m |\n| Terrarium z14 | ${r(dTerrSample.mean, 2)} m | ${r(dTerrSample.mae, 2)} m | ${r(dTerrSample.rmse, 2)} m | ${r(dTerrSample.p90, 1)} m | ${r(dTerrSample.max, 1)} m |`);
}
if (hasIgn) {
  const ignVerts = vertexElevationsById(graph, ignFile!.nodes);
  const dAll = stats(terrEles.map((t, i) => (Number.isFinite(ignVerts[i]!) ? t - ignVerts[i]! : NaN)));
  out['r3TerrariumVsIgnAll'] = dAll;
  md.push(`\nSur **tous** les sommets du graphe (${dAll.n}) : Terrarium − IGN : biais ${r(dAll.mean, 2)} m, erreur abs. moyenne ${r(dAll.mae, 2)} m, RMSE ${r(dAll.rmse, 2)} m, P90 ${r(dAll.p90, 1)} m, max ${r(dAll.max, 1)} m.`);
}
// Bridges / tunnels.
const bridges = G.edges.filter((e) => e.tags.bridge).length;
const tunnels = G.edges.filter((e) => e.tags.tunnel).length;
const bigDetails = anomalies.details.filter((d) => d.maxDeltaM >= 2).sort((a, b) => b.maxDeltaM - a.maxDeltaM);
out['r3Anomalies'] = { bridges, tunnels, report: { bridgeEdges: anomalies.bridgeEdges, tunnelEdges: anomalies.tunnelEdges, jumpEdges: anomalies.jumpEdges, corrected: anomalies.corrected.length }, top: bigDetails.slice(0, 10).map((d) => ({ ...d, name: G.edges[d.edgeId]!.tags.name ?? '' })) };
md.push(`\n### Ponts, tunnels, sauts aberrants (source ${mainSource === 'ign' ? 'IGN RGE ALTI' : 'Terrarium'})\n\n${bridges} arêtes \`bridge\`, ${tunnels} arêtes \`tunnel\` dans le graphe. Correction par interpolation linéaire entre les extrémités : ${anomalies.corrected.length} arêtes corrigées (${anomalies.details.filter((d) => d.kind === 'bridge' && d.maxDeltaM > 0.5).length} ponts, ${anomalies.details.filter((d) => d.kind === 'tunnel' && d.maxDeltaM > 0.5).length} tunnels, ${anomalies.jumpEdges} sauts > 60 % hors escaliers).\n\n| Arête | Type | Nom | Écart max corrigé |\n|---|---|---|---|\n${bigDetails.slice(0, 8).map((d) => `| ${d.edgeId} | ${d.kind} | ${G.edges[d.edgeId]!.tags.name ?? '—'} | ${r(d.maxDeltaM)} m |`).join('\n')}`);
// Same route, different sources / smoothing.
const loopPts = [BELLECOUR, FOURVIERE, { lng: 4.8272, lat: 45.7608 }, BELLECOUR];
const sources: [string, Graph][] = [];
if (hasIgn) {
  sources.push(['IGN brut', makeGraph('ign', false)], ['IGN corrigé ponts/tunnels', makeGraph('ign', true)]);
}
sources.push(['Terrarium brut', makeGraph('terrarium', false)], ['Terrarium corrigé', makeGraph('terrarium', true)]);
md.push('\n### D+ d\'un même tracé (Bellecour → Fourvière → Saint-Jean → Bellecour) selon la source et le lissage\n\n| Source | Lissage 0 m, seuil 1 m | Lissage 10 m, seuil 1 m | Lissage 25 m, seuil 3 m | Lissage 50 m, seuil 5 m | Distance |\n|---|---|---|---|---|---|');
const r3Gains: Record<string, unknown>[] = [];
for (const [label, g] of sources) {
  const route = routeThrough(g, loopPts, prefs({ stairs: 'tolerate' }));
  if (!route) continue;
  const cells: string[] = [];
  const row: Record<string, unknown> = { label };
  for (const [sm, th] of [[0, 1], [10, 1], [25, 3], [50, 5]] as const) {
    const opts: AnalysisOptions = { ...DEFAULT_ANALYSIS_OPTIONS, profile: { smoothWindowM: sm, gainThresholdM: th } };
    const a = analyzeRoute(g, route, opts);
    cells.push(`+${r(a.gainLoss.gain, 0)} / −${r(a.gainLoss.loss, 0)} m`);
    row[`s${sm}_t${th}`] = { gain: a.gainLoss.gain, loss: a.gainLoss.loss };
  }
  const a0 = analyzeRoute(g, route);
  row['length'] = a0.length;
  r3Gains.push(row);
  md.push(`| ${label} | ${cells.join(' | ')} | ${r(a0.length, 0)} m |`);
}
out['r3Gains'] = r3Gains;
if (probes) {
  out['probes'] = probes.probes;
  md.push(`\n### Sondes réseau (depuis GitHub Actions, ${probes.fetchedAt})\n\n| Service | HTTP | Type | Octets | CORS (\`Access-Control-Allow-Origin\`) | Temps |\n|---|---|---|---|---|---|\n${probes.probes.map((p: { name: string; status: number; contentType: string | null; bytes: number; cors: string | null; ms: number; error?: string }) => `| ${p.name} | ${p.status}${p.error ? ` (${p.error})` : ''} | ${p.contentType ?? '—'} | ${p.bytes ?? '—'} | ${p.cors ?? '—'} | ${p.ms} ms |`).join('\n')}`);
}

/* ---------------- R4 ---------------- */
md.push('\n## R4 — Performance du routage navigateur (mesures Node.js ; mesures navigateur dans le rapport)');
const gz = gzipSync(osmText).length;
const start = nearestNode(G, BELLECOUR);
const timing = (fn: () => unknown): number => {
  const t = performance.now();
  fn();
  return performance.now() - t;
};
const tAR = timing(() => outAndBack(G, start, { distanceM: 6000, gainM: 250 }, prefs({}), false));
const tAR2 = timing(() => outAndBack(G, start, { distanceM: 6000, gainM: 250 }, prefs({}), true));
let loops = 0;
const tLoop = timing(() => (loops = generateLoops(G, start, { distanceM: 6000, gainM: 250 }, prefs({})).length));
const base = routeThrough(G, [BELLECOUR, FOURVIERE], prefs({}))!;
let nVar = 0;
const tVar = timing(() => (nVar = generateVariants(G, base, prefs({})).length));
const tAstar = timing(() => routeThrough(G, [BELLECOUR, CROIX_ROUSSE], prefs({})));
out['r4'] = { fixtureBytes: osmText.length, fixtureGzipBytes: gz, elements: osm.elements.length, ways: ways.length, nodes: G.nodes.length, edges: G.edges.length, parseMs: tParse, buildMs: tBuild, terrariumAssignMs: tTerr, astarBellecourCroixRousseMs: tAstar, outAndBackSameMs: tAR, outAndBackDiffMs: tAR2, loopsMs: tLoop, loops, variantsMs: tVar, variants: nVar };
md.push(`| Mesure | Valeur |\n|---|---|\n| JSON Overpass (zone 4,2 × 4,4 km) | ${(osmText.length / 1e6).toFixed(2)} Mo brut, **${(gz / 1e6).toFixed(2)} Mo gzip** (${osm.elements.length} ways) |\n| Graphe | ${G.nodes.length} nœuds, ${G.edges.length} arêtes |\n| Parse JSON → ways | ${r(tParse, 0)} ms |\n| Construction du graphe | ${r(tBuild, 0)} ms |\n| Altitudes Terrarium (décodage + échantillonnage ${verts.length} sommets) | ${r(tTerr, 0)} ms |\n| A* Bellecour → Croix-Rousse | ${r(tAstar, 0)} ms |\n| A/R même chemin (6 km, 250 m D+) | ${r(tAR, 0)} ms |\n| A/R retour différent | ${r(tAR2, 0)} ms |\n| Boucles (${loops} résultats) | ${r(tLoop, 0)} ms |\n| Variantes (${nVar} résultats) | ${r(tVar, 0)} ms |`);

/* ---------------- expected / test cases ---------------- */
const cases = [
  { id: 'bellecour-fourviere-tolerate', waypoints: [BELLECOUR, FOURVIERE], prefs: prefs({ stairs: 'tolerate' }) },
  { id: 'bellecour-fourviere-avoid', waypoints: [BELLECOUR, FOURVIERE], prefs: prefs({ stairs: 'avoid' }) },
  { id: 'bellecour-fourviere-prefer', waypoints: [BELLECOUR, FOURVIERE], prefs: prefs({ stairs: 'prefer' }) },
  { id: 'gourguillon', waypoints: [{ lng: 4.8268, lat: 45.7589 }, { lng: 4.8232, lat: 45.7602 }], prefs: prefs({ stairs: 'avoid' }) },
  { id: 'saint-barthelemy', waypoints: [SAINT_PAUL, FOURVIERE], prefs: prefs({ stairs: 'avoid' }) },
  { id: 'saint-paul-fourviere-stairs', waypoints: [SAINT_PAUL, FOURVIERE], prefs: prefs({ stairs: 'prefer' }) },
  { id: 'grande-cote', waypoints: [{ lng: 4.8337, lat: 45.768 }, CROIX_ROUSSE], prefs: prefs({ stairs: 'tolerate' }) },
  { id: 'quais-pont-bonaparte', waypoints: [{ lng: 4.8316, lat: 45.7623 }, { lng: 4.8275, lat: 45.7585 }], prefs: prefs({ stairs: 'tolerate' }) },
  { id: 'tete-dor-plat', waypoints: [{ lng: 4.846, lat: 45.775 }, { lng: 4.849, lat: 45.7835 }], prefs: prefs({ stairs: 'tolerate' }) },
];
const expected: Record<string, unknown>[] = [];
md.push('\n## Cas de test de référence (export JSON pour la future app Swift)\n\n| Cas | Distance | D+ | D− | Escaliers | Marches | Montées (nom, D+) |\n|---|---|---|---|---|---|---|');
for (const c of cases) {
  const route = routeThrough(G, c.waypoints, c.prefs);
  if (!route) {
    md.push(`| ${c.id} | hors graphe | | | | | |`);
    continue;
  }
  const a = analyzeRoute(G, route);
  const climbs = a.climbs.map((cl) => ({ name: cl.name ?? null, gain: Math.round(cl.gain), length: Math.round(cl.length), avgGradePct: Math.round(cl.avgGradePct * 10) / 10, steps: cl.steps }));
  expected.push({ id: c.id, input: { waypoints: c.waypoints, prefs: c.prefs, elevationSource: mainSource, analysis: DEFAULT_ANALYSIS_OPTIONS }, expected: { length: Math.round(a.length), gain: Math.round(a.gainLoss.gain), loss: Math.round(a.gainLoss.loss), minEle: Math.round(a.gainLoss.minEle), maxEle: Math.round(a.gainLoss.maxEle), stairsEdges: a.breakdown.stairsEdges, steps: a.breakdown.totalSteps, estimatedSteps: a.breakdown.estimatedSteps, climbs, timeS: Math.round(a.time.totalS), osmWayIds: [...new Set(route.edges.map((e) => G.edges[e]!.osmWayId))] } });
  md.push(`| ${c.id} | ${r(a.length, 0)} m | ${r(a.gainLoss.gain, 0)} m | ${r(a.gainLoss.loss, 0)} m | ${a.breakdown.stairsEdges} | ${a.breakdown.totalSteps} | ${climbs.slice(0, 3).map((cl) => `${cl.name ?? 'sans nom'} (+${cl.gain} m)`).join(', ') || 'aucune'} |`);
}
mkdirSync('expected', { recursive: true });
writeFileSync('expected/lyon-reference-routes.json', JSON.stringify({ generatedAt: new Date().toISOString(), fixture: 'fixtures/lyon-centre.overpass.json', elevation: mainSource === 'ign' ? 'fixtures/lyon-centre.ign-alti.json' : 'fixtures/terrarium (z14)', tolerance: { relative: 0.02, absoluteM: 3 }, cases: expected }, null, 2) + '\n');
mkdirSync('docs', { recursive: true });
writeFileSync('docs/report-data.json', JSON.stringify(out, null, 2) + '\n');
writeFileSync('docs/report-tables.md', md.join('\n') + '\n');
console.log('report data written: docs/report-data.json, docs/report-tables.md, expected/lyon-reference-routes.json');
