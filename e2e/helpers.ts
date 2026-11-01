import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page, Route } from '@playwright/test';

export const SCREENSHOT_DIR = resolve('e2e/screenshots');
mkdirSync(SCREENSHOT_DIR, { recursive: true });

/** 1x1 light-grey PNG used as an offline basemap tile. */
const PNG_1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4AWN49+HTfwAJcAPQTLgThAAAAABJRU5ErkJggg==', 'base64');

export interface MockOptions {
  /** Overpass fixture file (relative to repo root). */
  overpassFixture: string;
  /** Serve terrarium tiles from fixtures/terrarium (real tiles) when available. */
  terrarium?: boolean;
  /** Record requests to external hosts. */
  log?: string[];
}

/**
 * Offline network for deterministic E2E: Overpass -> fixture, basemap tiles -> blank PNG,
 * terrarium tiles -> committed fixtures, IGN / Open-Meteo -> 503 (route-level providers are optional).
 */
export async function mockNetwork(page: Page, opts: MockOptions): Promise<void> {
  const overpass = readFileSync(resolve(opts.overpassFixture));
  const log = opts.log ?? [];
  await page.route(/\/api\/interpreter/, async (route: Route) => {
    log.push('overpass');
    await route.fulfill({ status: 200, contentType: 'application/json', body: overpass });
  });
  await page.route(/data\.geopf\.fr\/wmts/, async (route) => {
    log.push('ign-wmts');
    await route.fulfill({ status: 200, contentType: 'image/png', body: PNG_1x1 });
  });
  await page.route(/tile\.opentopomap\.org/, async (route) => {
    log.push('opentopomap');
    await route.fulfill({ status: 200, contentType: 'image/png', body: PNG_1x1 });
  });
  await page.route(/elevation-tiles-prod\/terrarium\/(\d+)\/(\d+)\/(\d+)\.png/, async (route) => {
    const m = /terrarium\/(\d+)\/(\d+)\/(\d+)\.png/.exec(route.request().url())!;
    const file = resolve(`fixtures/terrarium/${m[1]}/${m[2]}/${m[3]}.png`);
    log.push('terrarium');
    if (opts.terrarium !== false && existsSync(file)) await route.fulfill({ status: 200, contentType: 'image/png', body: readFileSync(file) });
    else await route.fulfill({ status: 404, body: '' });
  });
  await page.route(/data\.geopf\.fr\/altimetrie/, async (route) => {
    log.push('ign-alti');
    await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"offline test"}' });
  });
  await page.route(/api\.open-meteo\.com/, async (route) => {
    log.push('open-meteo');
    await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"offline test"}' });
  });
}

/** Collect console errors and page errors. */
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}

export async function waitForGraph(page: Page): Promise<void> {
  await page.waitForFunction(() => !!window.__randotrail?.state.graph, null, { timeout: 90_000 });
}

export async function setWaypoints(page: Page, points: { lng: number; lat: number }[]): Promise<void> {
  await page.evaluate(async (pts) => {
    window.__randotrail.state.waypoints = pts;
    await window.__randotrail.computeRoute();
  }, points);
  await page.waitForFunction(() => !!window.__randotrail.state.analysis, null, { timeout: 30_000 });
}

/** Click on the map at the pixel position of a geographic point (realistic interaction). */
export async function clickMapAt(page: Page, p: { lng: number; lat: number }): Promise<void> {
  const box = await page.locator('#map').boundingBox();
  const px = await page.evaluate((pt) => {
    const r = window.__randotrail.mapCtl.map.project([pt.lng, pt.lat]);
    return { x: r.x, y: r.y };
  }, p);
  await page.mouse.click(box!.x + px.x, box!.y + px.y);
}

export async function routeSummary(page: Page): Promise<{ length: number; gain: number; steps: number; edges: number[]; climbs: number }> {
  return page.evaluate(() => {
    const s = window.__randotrail.state;
    return { length: s.analysis!.length, gain: s.analysis!.gainLoss.gain, steps: s.analysis!.breakdown.totalSteps, edges: s.route!.edges, climbs: s.analysis!.climbs.length };
  });
}

export async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: resolve(SCREENSHOT_DIR, `${name}.png`), fullPage: false });
}
