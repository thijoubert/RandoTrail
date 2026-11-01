/**
 * Offline E2E on the REAL Lyon centre fixture (Overpass data committed by the fetch-data workflow).
 * Validates the reference scenarios (Gourguillon, Saint-Barthélemy, Grande Côte, Tête d'Or, bridge),
 * the R2 experiment (avoid / tolerate / prefer stairs) with screenshots, and records timings for R4.
 */
import { expect, test } from '@playwright/test';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { collectErrors, mockNetwork, routeSummary, setWaypoints, shot, waitForGraph } from './helpers';

const FIXTURE = 'fixtures/lyon-centre.overpass.json';
const P = {
  bellecour: { lng: 4.83215, lat: 45.75777 },
  fourviere: { lng: 4.8225, lat: 45.76235 },
  saintJean: { lng: 4.8272, lat: 45.7608 },
  gourguillonBas: { lng: 4.8268, lat: 45.7589 },
  stBarthelemyBas: { lng: 4.8277, lat: 45.7658 },
  terreaux: { lng: 4.8336, lat: 45.76737 },
  croixRousse: { lng: 4.83165, lat: 45.77445 },
  grandeCoteBas: { lng: 4.8337, lat: 45.768 },
  quaiSaone: { lng: 4.8316, lat: 45.7623 },
  quaiOuest: { lng: 4.8275, lat: 45.7585 },
};

test.describe('Lyon centre (real fixture, offline)', () => {
  test.skip(!existsSync(resolve(FIXTURE)), 'Lyon fixture not fetched yet');

  test('reference routes, R2 stairs preferences, generators timing', async ({ page }, testInfo) => {
    test.setTimeout(300_000);
    const errors = collectErrors(page);
    await mockNetwork(page, { overpassFixture: FIXTURE });
    await page.goto('./');
    await page.waitForFunction(() => window.__randotrail?.mapCtl.map.loaded());
    const t0 = Date.now();
    await page.getByRole('button', { name: 'Télécharger (Overpass)' }).click();
    await waitForGraph(page);
    const loadMs = Date.now() - t0;
    const info = await page.evaluate(() => {
      const i = window.__randotrail.state.graphInfo!;
      return { nodes: i.nodes, edges: i.edges, steps: i.steps, stairsWays: i.stairs.ways, downloadMs: i.downloadMs, buildMs: i.buildMs, elevationMs: i.elevationMs, bytes: i.bytes };
    });
    expect(info.stairsWays).toBeGreaterThan(100);
    await page.evaluate(() => window.__randotrail.mapCtl.map.jumpTo({ center: [4.8245, 45.7615], zoom: 15.2 }));
    await page.waitForTimeout(800);
    await shot(page, 'lyon-01-stairs-fourviere');

    const results: Record<string, unknown> = { project: testInfo.project.name, loadMs, info };
    await page.getByRole('button', { name: 'Tracé' }).click();

    // R2: Bellecour -> Fourvière, avoid / tolerate / prefer.
    const r2: Record<string, unknown> = {};
    for (const pref of ['avoid', 'tolerate', 'prefer'] as const) {
      await page.locator(`input[name=stairs][value=${pref}]`).check();
      await setWaypoints(page, [P.bellecour, P.fourviere]);
      const s = await routeSummary(page);
      const ms = await page.evaluate(() => window.__randotrail.state.routeMs);
      r2[pref] = { length: Math.round(s.length), gain: Math.round(s.gain), steps: s.steps, routeMs: Math.round(ms), edges: s.edges.length };
      await page.evaluate(() => window.__randotrail.mapCtl.map.jumpTo({ center: [4.8275, 45.7605], zoom: 15.1 }));
      await page.waitForTimeout(500);
      await shot(page, `lyon-02-r2-${pref}`);
    }
    results['r2'] = r2;
    const avoid = r2['avoid'] as { steps: number; length: number };
    const prefer = r2['prefer'] as { steps: number };
    const tolerate = r2['tolerate'] as { steps: number; length: number };
    // One 8 m / 19-step stairs is unavoidable (only OSM access to the Fourvière end node): < 5 % of the tolerated steps.
    expect(avoid.steps).toBeLessThan(tolerate.steps / 5);
    expect(prefer.steps).toBeGreaterThanOrEqual(tolerate.steps);
    expect(avoid.length).toBeGreaterThan(tolerate.length * 1.1);

    // Reference routes (stairs tolerated).
    await page.locator('input[name=stairs][value=tolerate]').check();
    const refs: Record<string, unknown> = {};
    const cases: [string, { lng: number; lat: number }[]][] = [
      ['gourguillon', [P.gourguillonBas, P.fourviere]],
      ['saint-barthelemy', [P.stBarthelemyBas, P.fourviere]],
      ['grande-cote', [P.grandeCoteBas, P.croixRousse]],
      ['quais-pont', [P.quaiSaone, P.quaiOuest]],
    ];
    for (const [name, pts] of cases) {
      await setWaypoints(page, pts);
      const s = await routeSummary(page);
      refs[name] = { length: Math.round(s.length), gain: Math.round(s.gain), steps: s.steps, climbs: s.climbs };
      await page.getByRole('button', { name: 'Montées' }).click();
      await page.waitForTimeout(300);
      await shot(page, `lyon-03-${name}`);
      await page.getByRole('button', { name: 'Tracé' }).click();
    }
    results['references'] = refs;
    expect((refs['gourguillon'] as { gain: number }).gain).toBeGreaterThan(60);
    expect((refs['grande-cote'] as { climbs: number }).climbs).toBeGreaterThanOrEqual(1);

    // Generators on the real graph: timing for R4.
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
      await shot(page, `lyon-04-gen-${label}`);
    }
    await setWaypoints(page, [P.bellecour, P.fourviere]);
    const t = Date.now();
    await page.getByRole('button', { name: 'Générer 3 à 5 variantes' }).click();
    await page.waitForFunction(() => !window.__randotrail.state.busy, null, { timeout: 180_000 });
    gen['variants'] = Date.now() - t;
    const nVariants = await page.locator('#var-list table.data tbody tr').count();
    gen['variantsCount'] = nVariants;
    expect(nVariants).toBeGreaterThanOrEqual(3);
    await shot(page, 'lyon-05-variants');
    results['generators'] = gen;
    results['timings'] = await page.evaluate(() => window.__randotrail.state.timings);

    mkdirSync(resolve('e2e/results'), { recursive: true });
    writeFileSync(resolve(`e2e/results/lyon-${testInfo.project.name}.json`), JSON.stringify(results, null, 2));
    expect(errors, errors.join('\n')).toEqual([]);
  });
});
