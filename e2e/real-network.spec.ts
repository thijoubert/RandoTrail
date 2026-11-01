/**
 * REAL NETWORK validation (runs only with REAL_NETWORK=1, i.e. in GitHub Actions which has internet).
 * No mocking: Overpass, IGN WMTS basemap, Terrarium tiles, IGN altimetry and Open-Meteo are called from
 * a real WebKit browser (CORS included). Results are written to e2e/results/real-network.json.
 */
import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { collectErrors, routeSummary, setWaypoints, shot, waitForGraph } from './helpers';

const BELLECOUR = { lng: 4.83215, lat: 45.75777 };
const FOURVIERE = { lng: 4.8225, lat: 45.76235 };

test.describe('real network (CI only)', () => {
  test.skip(!process.env['REAL_NETWORK'], 'REAL_NETWORK not set');

  test('Overpass + IGN basemap + Terrarium + IGN alti + Open-Meteo from WebKit', async ({ page }) => {
    test.setTimeout(900_000);
    const errors = collectErrors(page);
    const responses: Record<string, { ok: number; ko: number; bytes: number; cors: string | null }> = {};
    page.on('response', async (res) => {
      const u = new URL(res.url());
      const host = u.hostname;
      const r = (responses[host] ??= { ok: 0, ko: 0, bytes: 0, cors: null });
      if (res.ok()) r.ok++;
      else r.ko++;
      const cl = res.headers()['content-length'];
      if (cl) r.bytes += Number(cl);
      const cors = res.headers()['access-control-allow-origin'];
      if (cors) r.cors = cors;
    });
    const results: Record<string, unknown> = { at: new Date().toISOString(), userAgent: await page.evaluate(() => navigator.userAgent) };

    await page.goto('./');
    await page.waitForFunction(() => window.__randotrail?.mapCtl.map.loaded());
    await page.waitForTimeout(3000);
    await shot(page, 'real-01-basemap');
    results['basemap'] = { current: await page.evaluate(() => window.__randotrail.mapCtl.currentBasemap), responses: { ...responses } };

    // Full Lyon centre zone from Overpass (public mirrors can be slow from GitHub runners: wait up to 7 min),
    // Terrarium elevations from AWS. Falls back to the embedded real data so that the rest is still validated.
    const t0 = Date.now();
    await page.getByRole('button', { name: 'Télécharger (Overpass)' }).click();
    let overpassOk = true;
    try {
      await page.waitForFunction(() => !!window.__randotrail?.state.graph || !!window.__randotrail?.state.error, null, { timeout: 420_000 });
      overpassOk = await page.evaluate(() => !!window.__randotrail.state.graph);
    } catch {
      overpassOk = false;
    }
    const overpassMs = Date.now() - t0;
    results['overpass'] = { ok: overpassOk, wallMs: overpassMs, error: await page.evaluate(() => window.__randotrail.state.error), busy: await page.evaluate(() => window.__randotrail.state.busy) };
    await shot(page, 'real-02-graph');
    if (!overpassOk) {
      await page.reload();
      await page.waitForFunction(() => window.__randotrail?.mapCtl.map.loaded());
      await page.getByRole('button', { name: 'Données embarquées (Lyon réel)' }).click();
      await waitForGraph(page);
      await shot(page, 'real-02b-graph-embedded');
    }
    const graphInfo = await page.evaluate(() => {
      const i = window.__randotrail.state.graphInfo;
      return i ? { ...i, zone: i.zone.id, anomalies: i.anomalies ? { bridge: i.anomalies.bridgeEdges, tunnel: i.anomalies.tunnelEdges, jumps: i.anomalies.jumpEdges, corrected: i.anomalies.corrected.length } : null } : null;
    });
    results['graph'] = { wallMs: Date.now() - t0, info: graphInfo };
    expect(graphInfo, 'graph loaded (Overpass or embedded)').not.toBeNull();

    // Route Bellecour -> Fourvière with the three stairs preferences (R2) and timings (R4).
    await page.getByRole('button', { name: 'Tracé' }).click();
    const r2: Record<string, unknown> = {};
    for (const pref of ['tolerate', 'avoid', 'prefer'] as const) {
      await page.locator(`input[name=stairs][value=${pref}]`).check();
      await setWaypoints(page, [BELLECOUR, FOURVIERE]);
      const s = await routeSummary(page);
      const ms = await page.evaluate(() => window.__randotrail.state.routeMs);
      r2[pref] = { length: s.length, gain: s.gain, steps: s.steps, routeMs: ms, climbs: s.climbs };
      await shot(page, `real-03-bellecour-fourviere-${pref}`);
    }
    results['r2'] = r2;

    // Route-level elevation providers from the browser (CORS): IGN then Open-Meteo.
    const r3: Record<string, unknown> = {};
    for (const src of ['ign', 'open-meteo'] as const) {
      await page.locator('#route-ele').selectOption(src);
      await page.waitForFunction(() => !window.__randotrail.state.busy, null, { timeout: 120_000 });
      await page.waitForTimeout(500);
      const s = await page.evaluate(() => {
        const st = window.__randotrail.state;
        return { gain: st.analysis?.gainLoss.gain, loss: st.analysis?.gainLoss.loss, missing: st.analysis?.missingEle, error: st.error };
      });
      r3[src] = s;
    }
    await page.locator('#route-ele').selectOption('graph');
    results['r3-route'] = r3;

    // Labo: reference points for the three providers.
    await page.getByRole('button', { name: 'Labo' }).click();
    await page.getByRole('button', { name: /Tester Terrarium/ }).click();
    await expect(page.locator('#ele-test table.data')).toBeVisible({ timeout: 120_000 });
    results['r3-reference'] = await page.locator('#ele-test').innerText();
    await shot(page, 'real-04-elevation-sources');

    // Generators timing on the real graph (R4).
    await page.getByRole('button', { name: 'Générer' }).click();
    await page.locator('#gen-dist').fill('6000');
    await page.locator('#gen-gain').fill('250');
    const gen: Record<string, number> = {};
    for (const [name, label] of [['A/R même chemin', 'ar-same'], ['A/R retour différent', 'ar-diff'], ['Boucle', 'loop']] as const) {
      const t = Date.now();
      await page.getByRole('button', { name, exact: true }).click();
      await page.waitForFunction(() => !window.__randotrail.state.busy, null, { timeout: 180_000 });
      await expect(page.locator('#gen-status')).toContainText('résultat');
      gen[label] = Date.now() - t;
    }
    await shot(page, 'real-05-generated');
    const t = Date.now();
    await page.getByRole('button', { name: 'Générer 3 à 5 variantes' }).click();
    await page.waitForFunction(() => !window.__randotrail.state.busy, null, { timeout: 180_000 });
    gen['variants'] = Date.now() - t;
    gen['variantsCount'] = await page.locator('#var-list table.data tbody tr').count();
    results['r4-generators'] = gen;
    results['timings'] = await page.evaluate(() => window.__randotrail.state.timings);
    results['responses'] = responses;
    results['consoleErrors'] = errors;

    mkdirSync(resolve('e2e/results'), { recursive: true });
    writeFileSync(resolve('e2e/results/real-network.json'), JSON.stringify(results, null, 2));
  });
});
