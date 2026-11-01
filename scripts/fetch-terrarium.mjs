// Download Terrarium terrain tiles (AWS Open Data, Mapzen/Nextzen) covering the Lyon centre zone.
// These are committed as fixtures so that E2E tests and the embedded demo work offline.
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { LYON_CENTRE, fetchWithTimeout } from './lib.mjs';

const Z = Number(process.argv[2] ?? 14);
const b = LYON_CENTRE;
const pad = 0.004;
function tileX(lng, z) { return Math.floor(((lng + 180) / 360) * 2 ** z); }
function tileY(lat, z) {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
}
const x0 = tileX(b.west - pad, Z), x1 = tileX(b.east + pad, Z);
const y0 = tileY(b.north + pad, Z), y1 = tileY(b.south - pad, Z);
let n = 0, bytes = 0;
const t0 = Date.now();
for (let x = x0; x <= x1; x++) {
  for (let y = y0; y <= y1; y++) {
    const dir = `fixtures/terrarium/${Z}/${x}`;
    const file = `${dir}/${y}.png`;
    if (existsSync(file)) { n++; continue; }
    const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${Z}/${x}/${y}.png`;
    const res = await fetchWithTimeout(url, {}, 30000);
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, buf);
    n++; bytes += buf.length;
  }
}
console.log(`z${Z}: ${n} tiles (${x0}-${x1} x ${y0}-${y1}), ${(bytes / 1e6).toFixed(2)} MB downloaded in ${Date.now() - t0} ms`);
