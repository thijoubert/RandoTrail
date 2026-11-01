import { expect, test } from '@playwright/test';
import { clickMapAt, collectErrors, mockNetwork, routeSummary, setWaypoints, shot, waitForGraph } from './helpers';

// Synthetic town coordinates (see tests/helpers/synthetic.ts): grid 100 m from (4.8, 45.76).
const DLNG = 100 / (111320 * Math.cos((45.76 * Math.PI) / 180));
const DLAT = 100 / 111320;
const gp = (x: number, y: number): { lng: number; lat: number } => ({ lng: 4.8 + x * DLNG, lat: 45.76 + y * DLAT });

test.describe('smoke (synthetic fixture, offline)', () => {
  test('loads a zone, shows stairs, routes with preferences, analyses, generates and exports', async ({ page }) => {
    const errors = collectErrors(page);
    await mockNetwork(page, { overpassFixture: 'fixtures/synthetic.overpass.json' });
    await page.goto('./');
    await expect(page.locator('header.top .title')).toContainText('RandoTrail');
    await page.waitForFunction(() => window.__randotrail?.mapCtl.map.loaded());
    await shot(page, '01-home');

    // 1. Zone: download (mocked Overpass) with Terrarium elevations (fixture tiles).
    // Centre the map on the synthetic town before loading so the screenshots show it.
    await page.evaluate(() => window.__randotrail.mapCtl.map.jumpTo({ center: [4.8026, 45.7618], zoom: 15.5 }));
    await page.getByRole('button', { name: 'Télécharger (Overpass)' }).click();
    await waitForGraph(page);
    await expect(page.locator('#zone-status')).toContainText('Escaliers OSM');
    await expect(page.locator('#zone-status')).toContainText('2');
    await page.evaluate(() => window.__randotrail.mapCtl.map.jumpTo({ center: [4.8026, 45.7618], zoom: 15.5 }));
    await page.waitForTimeout(600);
    await shot(page, '02-graph-stairs');

    // 2. Trace: two taps on the map.
    await page.getByRole('button', { name: 'Tracé' }).click();
    await clickMapAt(page, gp(1, 1));
    await clickMapAt(page, gp(0, 3));
    await page.waitForFunction(() => !!window.__randotrail.state.analysis);
    const tolerate = await routeSummary(page);
    expect(tolerate.length).toBeGreaterThan(100);
    expect(tolerate.steps).toBe(120);
    await expect(page.locator('#trace-stats')).toContainText('distance');
    await expect(page.locator('#profile canvas')).toBeVisible();
    await shot(page, '03-route-tolerate');

    // Preferences really change the route.
    await page.locator('input[name=stairs][value=avoid]').check();
    await page.waitForFunction((prev) => window.__randotrail.state.analysis!.length !== prev, tolerate.length);
    const avoid = await routeSummary(page);
    expect(avoid.steps).toBe(0);
    expect(avoid.length).toBeGreaterThan(tolerate.length);
    await shot(page, '04-route-avoid');
    await page.locator('input[name=stairs][value=prefer]').check();
    await page.waitForFunction((prev) => window.__randotrail.state.analysis!.length !== prev, avoid.length);
    const prefer = await routeSummary(page);
    expect(prefer.steps).toBe(120);
    await shot(page, '05-route-prefer');

    // 3. Analysis table.
    await page.getByRole('button', { name: 'Analyse' }).click();
    await expect(page.locator('#analysis-table table.data')).toBeVisible();
    await expect(page.locator('#analysis-table')).toContainText(/Escalier \((montée|descente)\)/);
    await shot(page, '06-analysis');

    // 4. Climbs: a route to the top of the hill.
    await setWaypoints(page, [gp(4, 0), gp(0, 4)]);
    await page.getByRole('button', { name: 'Montées' }).click();
    const climbs = page.locator('#climb-list li.climb');
    await expect(climbs.first()).toBeVisible();
    await climbs.first().click();
    await expect(climbs.first()).toHaveClass(/selected/);
    await shot(page, '07-climbs');

    // 5. Objectives.
    await page.getByRole('button', { name: 'Objectifs' }).click();
    await page.locator('#obj-dist').fill('2000');
    await page.locator('#obj-gain').fill('100');
    await expect(page.locator('#obj-report table.data')).toBeVisible();
    await expect(page.locator('#obj-report')).toContainText('Prolongez');
    await shot(page, '08-objectives');

    // 6-7. Generators.
    await page.getByRole('button', { name: 'Générer' }).click();
    await page.locator('#gen-dist').fill('800');
    await page.getByRole('button', { name: 'A/R même chemin' }).click();
    await expect(page.locator('#gen-list table.data')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Boucle' }).click();
    await expect(page.locator('#gen-status')).toContainText('Boucle', { timeout: 60_000 });
    await shot(page, '09-generate');
    await page.getByRole('button', { name: 'Générer 3 à 5 variantes' }).click();
    await expect(page.locator('#var-list table.data')).toBeVisible({ timeout: 60_000 });
    const nVariants = await page.locator('#var-list table.data tbody tr').count();
    expect(nVariants).toBeGreaterThanOrEqual(2); // small synthetic grid; >= 3 is asserted on the real Lyon fixture
    await shot(page, '10-variants');
    await page.locator('#hr-n').fill('3');
    await page.getByRole('button', { name: 'Calculer' }).click();
    await expect(page.locator('#hr-result')).toContainText('3 ×');

    // 9. GPX export + import.
    await page.getByRole('button', { name: 'GPX' }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exporter le tracé courant' }).click();
    const dl = await download;
    expect(dl.suggestedFilename()).toBe('randotrail.gpx');
    const gpx = `<?xml version="1.0"?><gpx version="1.1" creator="t" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>Test import</name><trkseg>
      ${[gp(1, 1), gp(0.75, 1.5), gp(0.5, 2), gp(0.25, 2.5), gp(0, 3), gp(0, 4)].map((p) => `<trkpt lat="${p.lat}" lon="${p.lng}"></trkpt>`).join('')}
      </trkseg></trk></gpx>`;
    await page.locator('#gpx-file').setInputFiles({ name: 'test.gpx', mimeType: 'application/gpx+xml', buffer: Buffer.from(gpx) });
    await expect(page.locator('#gpx-result')).toContainText('Test import');
    await expect(page.locator('#gpx-result')).toContainText('appariés à des escaliers OSM');
    await shot(page, '11-gpx');

    expect(errors, errors.join('\n')).toEqual([]);
  });
});
