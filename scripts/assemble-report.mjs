// Assembles REPORT.md from docs/REPORT.template.md, docs/report-tables.md and docs/e2e-results/*.json.
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';

const tpl = readFileSync('docs/REPORT.template.md', 'utf8');
const tables = existsSync('docs/report-tables.md') ? readFileSync('docs/report-tables.md', 'utf8') : '_(tables non générées)_';
const ms = (v) => (typeof v === 'number' ? (v >= 1000 ? `${(v / 1000).toFixed(2)} s` : `${Math.round(v)} ms`) : '—');
const lines = [];
lines.push('### Mesures navigateur (Playwright)');
const dir = 'docs/e2e-results';
const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')) : [];
if (files.length === 0) lines.push('_Aucun résultat navigateur commité (workflow `validate-real`)._');
for (const f of files) {
  const d = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'));
  if (f.startsWith('real-network')) {
    lines.push(`\n#### Réseau réel depuis WebKit (iPhone 13 simulé, GitHub Actions) — \`${f}\`, ${d.at ?? ''}`);
    lines.push(`- User-Agent : \`${d.userAgent ?? ''}\``);
    lines.push(`- Fond de carte au chargement : **${d.basemap?.current ?? '?'}** (IGN Plan v2 = succès sans clé).`);
    if (d.overpass) lines.push(`- Overpass depuis le navigateur : ${d.overpass.ok ? `**OK** en ${ms(d.overpass.wallMs)}` : `**échec** après ${ms(d.overpass.wallMs)} (${d.overpass.error ?? d.overpass.busy ?? 'timeout'}) → repli sur les données embarquées`}`);
    if (d.graph?.info) {
      const i = d.graph.info;
      lines.push(`- Graphe (${i.source === 'embedded' ? 'données embarquées' : 'Overpass'}) : ${i.nodes} nœuds, ${i.edges} arêtes, ${i.steps} arêtes escaliers ; chargement ${ms(i.downloadMs)} (${(i.bytes / 1e6).toFixed(1)} Mo), construction ${ms(i.buildMs)}, altitudes Terrarium ${ms(i.elevationMs)} ; anomalies : ${JSON.stringify(i.anomalies)}`);
    }
    if (d.r2) lines.push(`- R2 Bellecour → Fourvière (altitudes Terrarium) : ${Object.entries(d.r2).map(([k, v]) => `${k} = ${Math.round(v.length)} m, D+ ${Math.round(v.gain)} m, ${v.steps} marches, A* ${ms(v.routeMs)}`).join(' ; ')}`);
    if (d['r3-route']) lines.push(`- Altitudes du tracé par API (CORS réel) : ${Object.entries(d['r3-route']).map(([k, v]) => `${k} : ${v.error ? `**erreur** (${v.error})` : `OK, D+ ${Math.round(v.gain)} m / D− ${Math.round(v.loss)} m, ${v.missing} points manquants`}`).join(' ; ')}`);
    if (d['r3-reference']) lines.push(`- Points de référence (Labo) :\n\n\`\`\`\n${String(d['r3-reference']).trim()}\n\`\`\``);
    if (d['r4-generators']) lines.push(`- Générateurs (temps mur, interface comprise) : ${Object.entries(d['r4-generators']).map(([k, v]) => `${k} = ${k.endsWith('Count') ? v : ms(v)}`).join(', ')}`);
    if (d.responses) {
      lines.push('- Réponses HTTP par hôte (ok / erreurs, CORS) :');
      for (const [h, r] of Object.entries(d.responses)) lines.push(`  - ${h} : ${r.ok} ok, ${r.ko} erreurs${r.cors ? `, ACAO=${r.cors}` : ''}`);
    }
    if (d.consoleErrors) lines.push(`- Erreurs console : ${d.consoleErrors.length === 0 ? '**aucune**' : d.consoleErrors.length + ' — ' + d.consoleErrors.slice(0, 3).join(' | ')}`);
  } else if (f.startsWith('lyon-')) {
    lines.push(`\n#### Fixture Lyon réelle, hors ligne — \`${f}\` (projet ${d.project})`);
    const i = d.info ?? {};
    lines.push(`- Chargement complet ${ms(d.loadMs)} (téléchargement simulé ${ms(i.downloadMs)}, construction ${ms(i.buildMs)}, altitudes ${ms(i.elevationMs)}) ; ${i.nodes} nœuds, ${i.edges} arêtes, ${i.stairsWays} ways escaliers.`);
    if (d.r2) lines.push(`- R2 Bellecour → Fourvière : ${Object.entries(d.r2).map(([k, v]) => `${k} = ${v.length} m, D+ ${v.gain} m, ${v.steps} marches, A* ${ms(v.routeMs)}`).join(' ; ')}`);
    if (d.references) lines.push(`- Tracés de référence : ${Object.entries(d.references).map(([k, v]) => `${k} = ${v.length} m, D+ ${v.gain} m, ${v.steps} marches, ${v.climbs} montée(s)`).join(' ; ')}`);
    if (d.generators) lines.push(`- Générateurs (temps mur) : ${Object.entries(d.generators).map(([k, v]) => `${k} = ${k.endsWith('Count') ? v : ms(v)}`).join(', ')}`);
  }
}
lines.push('\n### Captures');
const shots = existsSync('docs/screenshots') ? readdirSync('docs/screenshots').filter((f) => f.endsWith('.png')).sort() : [];
if (shots.length) lines.push(shots.map((s) => `- [${s}](docs/screenshots/${s})`).join('\n'));
else lines.push('_Aucune capture commitée._');
lines.push(`
### Refaire les mesures

1. **Données réelles** : GitHub → Actions → \`fetch-data\` → Run workflow (ou toucher \`scripts/fetch-fixtures.mjs\`). Commits dans \`fixtures/\`.
2. **Chiffres du rapport** : \`npx vite-node scripts/report-data.mts\` puis \`node scripts/assemble-report.mjs\` (sorties : \`docs/report-tables.md\`, \`docs/report-data.json\`, \`expected/lyon-reference-routes.json\`, \`REPORT.md\`).
3. **Mesures navigateur réelles** : Actions → \`validate-real\` → Run workflow ; résultats commités dans \`docs/e2e-results/\` et \`docs/screenshots/\`.
4. **Localement** : \`npm run build && REAL_NETWORK=1 npx playwright test e2e/real-network.spec.ts\` (nécessite WebKit : \`npx playwright install webkit\`).
`);
const out = tpl.replace('@@TABLES@@', '## Données\n\n' + tables).replace('@@PROOFS@@', lines.join('\n'));
writeFileSync('REPORT.md', out);
console.log('REPORT.md assembled');
