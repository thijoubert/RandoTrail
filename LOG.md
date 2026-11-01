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
- 16:07 Données réelles commitées par `fetch-data` : Overpass 22 190 ways (10,3 Mo), IGN RGE ALTI pour 63 006 nœuds (GET × 50 après 500 en POST), sondes réseau (IGN WMTS sans clé 200 + CORS `*`).
- 16:10 `report-data` : R1 1 055 escaliers, 74 % step_count, 94 % incline ; estimation des marches par D+ peu fiable (médiane 60 % d'erreur). R2 : avoid/tolerate très différents, prefer = tolerate sur les 4 trajets testés. R3 : Terrarium +5,7 m de biais vs IGN. R4 : A* 4 ms, générateurs < 300 ms en Node.
- 16:15 E2E Lyon (fixture réelle) vert en local (Chromium) : captures lues, escaliers/tracés/montées/boucles/variantes corrects. Bug trouvé : tuiles Terrarium hors fixtures → anneau de tuiles élargi + tuile « niveau 0 » dans les mocks.
- 16:20 `validate-real` (WebKit, réseau réel) : fond IGN OK, Terrarium OK, Open-Meteo OK (CORS), IGN alti POST → 500 (corrigé en GET × 50), Overpass depuis le runner KO (502/504), repli embarqué OK, générateurs 0,24–0,49 s. CI complète (E2E WebKit + Chromium sur fixture Lyon) verte.
- 16:25 `fetch-data` n° 2 : Open-Meteo 429 et conflit de rebase → scripts corrigés (réutilisation du fichier IGN, backoff 429, commit par reset --soft).
