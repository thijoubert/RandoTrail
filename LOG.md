# LOG.md — journal d'avancement

## 2026-11-01

- Dépôt vide. Environnement : Node 22, npm 10, Playwright 1.63 (Chromium seul), proxy sortant.
- Sondes réseau : npm OK, GitHub API OK (lecture), `s3.amazonaws.com` (Terrarium) OK. Bloqués : overpass-api.de et miroirs, data.geopf.fr, api.open-meteo.com, tuiles OSM/OpenTopoMap/Carto, cdn jsdelivr/unpkg. API GitHub Pages et Actions : refusées par le proxy.
- Décision : fixtures réelles via workflow GitHub Actions (commit dans `fixtures/`), validation CORS en CI.
- 15:30 Squelette Vite/TS, workflows CI + fetch-data poussés. Premier run : Overpass OK sur maps.mail.ru (22 190 ways, 9 Mo, 18 s) mais échec global (2e requête 429/406/504).
- 15:45 Cœur métier (graphe, coût, A*, altitudes, profil, classification, montées, temps) : 41 tests verts. Fix `out body geom`.
- 16:00 Générateurs (A/R, boucles, variantes, hill repeats), objectifs, GPX : 52 tests verts. IGN API : HTTP 500 sur lots de 2000 → stratégie adaptative.
- 16:20 UI complète (carte, 8 onglets, profil uPlot, PWA). E2E Chromium iPhone : escaliers et tracé invisibles → bug `isStyleLoaded()` corrigé, 11 captures validées à l'œil.
- 16:35 CI : YAML invalide (deux-points dans un nom d'étape) corrigé ; job E2E WebKit + artefacts captures ajouté ; job deploy conditionné à l'activation de Pages.
