// Fetch REAL data for the Lyon centre zone (runs in GitHub Actions, which has internet access).
// Outputs are committed into fixtures/ so that tests, the report and the embedded demo use real data.
// fixtures-version: 7 (OSM timestamp guard)
import {
  LYON_CENTRE, REFERENCE_POINTS, KNOWN_STAIRS, overpass, overpassQuery, ignElevations, openMeteoElevations, probe, writeJson, writeJsonPretty,
} from './lib.mjs';

import { readJson } from './lib.mjs';
const meta = readJson('fixtures/meta.json') ?? { bbox: LYON_CENTRE, steps: {} };
meta.fetchedAt = new Date().toISOString();
meta.steps = meta.steps ?? {};
const only = process.argv[2]; // optional: 'overpass' | 'elevation' | 'probes'

if (!only || only === 'overpass') {
  const { json, mirror, ms } = await overpass(overpassQuery(LYON_CENTRE));
  // Guard: some public mirrors (e.g. maps.mail.ru) serve a stale database. Never replace the fixture with
  // older OSM data than the one already committed (tests and expected/ are tied to it).
  const prev = readJson('fixtures/lyon-centre.overpass.json');
  const prevTs = prev?.osm3s?.timestamp_osm_base ?? '';
  const newTs = json.osm3s?.timestamp_osm_base ?? '';
  if (prev && newTs < prevTs) {
    console.warn(`Overpass data from ${mirror} is older (${newTs}) than the committed fixture (${prevTs}): keeping the existing fixture`);
    meta.steps.overpass = { mirror, ms, elements: json.elements.length, osmTimestamp: newTs, rejected: 'older than committed fixture', keptTimestamp: prevTs };
  } else {
    writeJson('fixtures/lyon-centre.overpass.json', json);
    meta.steps.overpass = { mirror, ms, elements: json.elements.length, osmTimestamp: newTs };
  }

  // Known stairs lookup by name (any highway type), wider bbox (whole Lyon).
  const re = KNOWN_STAIRS.map((n) => n.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')).join('|');
  const q = `[out:json][timeout:120][bbox:45.72,4.78,45.80,4.90];way["name"~"^(${re})",i];out tags geom qt;`;
  await new Promise((r) => setTimeout(r, 10000));
  try {
    const known = await overpass(q, { timeoutMs: 120000, rounds: 2 });
    writeJson('fixtures/lyon-known-stairs.overpass.json', known.json);
    meta.steps.knownStairs = { mirror: known.mirror, ms: known.ms, elements: known.json.elements.length };
  } catch (e) {
    console.warn('known stairs query failed (non fatal):', e.message);
    meta.steps.knownStairs = { error: e.message };
  }
}

if (!only || only === 'elevation') {
  const { readFileSync } = await import('node:fs');
  const osm = JSON.parse(readFileSync('fixtures/lyon-centre.overpass.json', 'utf8'));
  // All distinct OSM nodes (way vertices) in the zone.
  const nodes = new Map();
  for (const el of osm.elements) {
    if (el.type !== 'way' || !el.geometry) continue;
    el.nodes.forEach((nid, i) => {
      if (!nodes.has(nid)) nodes.set(nid, { lng: el.geometry[i].lon, lat: el.geometry[i].lat });
    });
  }
  const ids = [...nodes.keys()];
  const pts = ids.map((id) => nodes.get(id));
  const existing = readJson('fixtures/lyon-centre.ign-alti.json');
  let ignMap;
  if (existing && existing.nodes && ids.filter((id) => existing.nodes[id] === undefined).length < ids.length * 0.02) {
    console.log(`IGN RGE ALTI already present for ${existing.count} nodes (skipping bulk download)`);
    ignMap = existing.nodes;
    meta.steps.ign = { reused: true, count: existing.count };
  } else {
    console.log(`IGN RGE ALTI for ${ids.length} nodes`);
    const ign = await ignElevations(pts);
    ignMap = {};
    ids.forEach((id, i) => { if (ign.values[i] !== null) ignMap[id] = Math.round(ign.values[i] * 100) / 100; });
    writeJson('fixtures/lyon-centre.ign-alti.json', { resource: 'ign_rge_alti_wld', fetchedAt: new Date().toISOString(), count: Object.keys(ignMap).length, nodes: ignMap });
    meta.steps.ign = { points: ids.length, requests: ign.log.length, totalMs: ign.log.reduce((a, b) => a + b.ms, 0), cors: ign.log[0]?.cors ?? null, strategy: ign.log.find((l) => l.method) ?? null };
  }

  // Reference points: IGN + Open-Meteo.
  const refIgn = await ignElevations(REFERENCE_POINTS);
  const refMeteo = await openMeteoElevations(REFERENCE_POINTS);
  // Sample of 1500 graph nodes for Open-Meteo vs IGN comparison (deterministic stride).
  const stride = Math.max(1, Math.floor(ids.length / 600));
  const sampleIds = ids.filter((_, i) => i % stride === 0).slice(0, 600);
  const samplePts = sampleIds.map((id) => nodes.get(id));
  const meteo = await openMeteoElevations(samplePts);
  const sample = sampleIds.map((id, i) => ({ id, lng: samplePts[i].lng, lat: samplePts[i].lat, ign: ignMap[id] ?? null, openMeteo: meteo.values[i] }));
  writeJsonPretty('fixtures/lyon-reference-elevations.json', {
    fetchedAt: new Date().toISOString(),
    references: REFERENCE_POINTS.map((p, i) => ({ ...p, ign: refIgn.values[i], openMeteo: refMeteo.values[i] })),
    sampleCount: sample.length,
    sample,
    log: { ign: refIgn.log, openMeteo: refMeteo.log, openMeteoSample: meteo.log },
  });
  meta.steps.openMeteo = { points: sample.length + REFERENCE_POINTS.length, cors: meteo.log[0]?.cors ?? null };
}

if (!only || only === 'probes') {
  const probes = [];
  probes.push(await probe('ign-wmts-planignv2', 'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM&FORMAT=image/png&TILEMATRIX=15&TILEROW=11531&TILECOL=16827'));
  probes.push(await probe('ign-wmts-ortho', 'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&TILEMATRIXSET=PM&FORMAT=image/jpeg&TILEMATRIX=15&TILEROW=11531&TILECOL=16827'));
  probes.push(await probe('ign-wmts-capabilities', 'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetCapabilities&VERSION=1.0.0'));
  probes.push(await probe('opentopomap', 'https://a.tile.opentopomap.org/15/16827/11531.png', { headers: { 'User-Agent': 'randotrail-lab/0.1 (github.com/thijoubert/RandoTrail)' } }));
  probes.push(await probe('terrarium-aws', 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/14/8413/5765.png'));
  probes.push(await probe('ign-alti-get', 'https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json?lon=4.8226&lat=45.7624&resource=ign_rge_alti_wld&zonly=true'));
  probes.push(await probe('open-meteo', 'https://api.open-meteo.com/v1/elevation?latitude=45.7624&longitude=4.8226'));
  probes.push(await probe('opentopodata-srtm30m', 'https://api.opentopodata.org/v1/srtm30m?locations=45.7624,4.8226'));
  for (const m of ['https://overpass-api.de', 'https://overpass.kumi.systems', 'https://overpass.private.coffee', 'https://maps.mail.ru/osm/tools/overpass']) {
    probes.push(await probe('overpass-status ' + m, m + '/api/status'));
  }
  writeJsonPretty('fixtures/network-probes.json', { fetchedAt: new Date().toISOString(), probes });
  meta.steps.probes = probes.length;
}

writeJsonPretty('fixtures/meta.json', meta);
