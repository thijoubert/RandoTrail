# LOG.md — journal d'avancement

## 2026-11-01

- Dépôt vide. Environnement : Node 22, npm 10, Playwright 1.63 (Chromium seul), proxy sortant.
- Sondes réseau : npm OK, GitHub API OK (lecture), `s3.amazonaws.com` (Terrarium) OK. Bloqués : overpass-api.de et miroirs, data.geopf.fr, api.open-meteo.com, tuiles OSM/OpenTopoMap/Carto, cdn jsdelivr/unpkg. API GitHub Pages et Actions : refusées par le proxy.
- Décision : fixtures réelles via workflow GitHub Actions (commit dans `fixtures/`), validation CORS en CI.
