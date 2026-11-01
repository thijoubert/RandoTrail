# RandoTrail — labo d'urban trail (Lyon)

Prototype web **100 % gratuit et statique** (Vite + TypeScript strict, MapLibre GL JS, uPlot) pour valider quatre risques avant une app iOS native :

- **R1** escaliers OpenStreetMap à Lyon (`highway=steps`, `step_count`, `incline`, `name`, `handrail`)
- **R2** routage qui évite / tolère / recherche les escaliers et les pentes
- **R3** fiabilité des altitudes en ville (ponts, tunnels, escaliers)
- **R4** génération d'aller-retours, boucles et variantes dans le navigateur, sans quota d'API

Le verdict chiffré est dans **[REPORT.md](REPORT.md)**. Les choix sont dans [DECISIONS.md](DECISIONS.md), l'avancement dans [LOG.md](LOG.md).

## Ouvrir sur iPhone

URL GitHub Pages : **https://thijoubert.github.io/RandoTrail/** (voir « État du déploiement » ci-dessous).

1. Ouvrir l'URL dans Safari.
2. Bouton Partager → **Sur l'écran d'accueil** → Ajouter. L'app s'ouvre alors en plein écran (PWA, manifest + service worker minimal).
3. Onglet **Zone** → **Télécharger (Overpass)** (zone « Lyon centre » par défaut, ~2,5 Mo gzip, mis en cache dans IndexedDB) ou **Données embarquées (Lyon réel)** (copie Overpass réelle livrée avec le site, altitudes IGN RGE ALTI pré-calculées).

### Liste de contrôle iPhone (10 minutes)

- [ ] La carte IGN s'affiche (fond « Plan IGN v2 ») ; sinon le repli OpenTopoMap puis « graphe seul » se fait tout seul (onglet Zone → Fond de carte).
- [ ] Zone → Télécharger : le bandeau indique le nombre de nœuds/arêtes et d'escaliers ; les escaliers apparaissent en **rouge pointillé sur liseré blanc** (couleur + motif).
- [ ] Tracé : toucher deux fois la carte (Bellecour puis Fourvière) ; distance, D+, D−, altitudes min/max, temps estimé, marches, profil interactif (toucher le profil déplace le point jaune sur la carte).
- [ ] Préférences Escaliers « éviter » → le tracé change (0 marche) ; « rechercher » → plus de marches ; Pentes « limiter à 8 % » → tracé plus long et moins raide.
- [ ] Analyse : tableau par type (escalier, plat, douce, modérée, raide, très raide, descente) ; seuils réglables.
- [ ] Montées : liste triée ; toucher une montée centre la carte et surligne le profil.
- [ ] Objectifs : saisir 8000 m / 400 m → écarts et suggestions en direct.
- [ ] Générer : A/R même chemin, A/R retour différent, Boucle (6 km / 250 m) : temps annoncé sous les boutons ; « Utiliser » charge le parcours.
- [ ] Générer → Variantes : 3 à 5 lignes réellement différentes (recouvrement < 75 %) ; survol/toucher d'une ligne la surligne sur la carte.
- [ ] GPX : Exporter (fichier `randotrail.gpx` dans Fichiers) puis Importer le même fichier → classification identique.
- [ ] Labo : « Tester Terrarium / IGN / Open-Meteo » : les trois colonnes se remplissent (CORS OK depuis Safari).

## Lancer en local

```bash
npm install          # legacy-peer-deps est configuré dans .npmrc
npm run dev          # http://localhost:5173
npm run lint && npm run typecheck && npm test
npm run build && npm run e2e   # Playwright (Chromium iPhone en local, WebKit en CI)
```

Scripts de données (nécessitent Internet) :

```bash
node scripts/fetch-fixtures.mjs          # Overpass + IGN + Open-Meteo + sondes → fixtures/ (fait par le workflow fetch-data)
node scripts/fetch-terrarium.mjs 14      # tuiles terrain AWS → fixtures/terrarium/
npx vite-node scripts/report-data.mts    # chiffres du rapport → docs/, expected/
```

## Architecture

```
src/core/      logique métier pure (sans DOM) : geo, osm→graph, cost, router (A*/Dijkstra), elevation,
               profile, classify, climbs, time, analysis, generate (A/R, boucles), variants, objectives, gpx
src/data/      navigateur : overpass (miroirs, découpage, cache IndexedDB), elevationProviders (Terrarium,
               IGN, Open-Meteo, fichier par nœud), cache
src/ui/        carte MapLibre, panneau à onglets, profil uPlot, état, pipeline
tests/         Vitest (ville synthétique déterministe + fixture Lyon réelle)
e2e/           Playwright (offline sur fixtures, et « réseau réel » en CI) + captures
fixtures/      données réelles commitées par GitHub Actions (Overpass, IGN RGE ALTI par nœud, Open-Meteo,
               sondes réseau, tuiles Terrarium) ; expected/ : cas de test de référence (JSON) pour l'app Swift
scripts/       récupération des données et calcul du rapport
```

La logique `src/core` est écrite pour être portée en Swift : fonctions pures, types explicites, tableaux et index, pas de dépendance.

## Limites connues

- **GPS d'arrière-plan** : non testable dans une PWA ; sera traité dans l'app native. Le bouton de géolocalisation MapLibre ne fait que centrer la carte.
- **Escaliers = OSM uniquement** : un escalier absent d'OSM est invisible pour le routage (R1 mesure la couverture). Les marches sont estimées (`|Δh| / 0,17 m`, marquées *) quand `step_count` manque.
- **Altitudes** : le graphe entier utilise les tuiles Terrarium (~30 m natif, interpolées) ou le fichier IGN pré-calculé (mode embarqué) ; l'API IGN RGE ALTI (1 m) n'est appliquée qu'au tracé courant (onglet Tracé → « Altitudes du profil »). Ponts/tunnels sont corrigés par interpolation entre leurs extrémités ; la correction est signalée.
- **Overpass** : service public partagé ; en cas de 429/504, l'app passe au miroir suivant et découpe la zone. Les données réelles embarquées servent de repli.
- **Fonds de carte** : Plan IGN v2 sans clé (conditions Géoplateforme : usage « essentiel » ouvert, attribution affichée) ; repli OpenTopoMap (faible trafic), puis aucun fond.
- **Pas de glisser-déposer des points** : annuler / effacer / inverser uniquement (prototype).
- **Calculs sur le thread principal** : les générateurs affichent un état « … » pendant le calcul ; les temps mesurés sont dans REPORT.md.

## Captures (WebKit iPhone 13, CI)

Commitées par le workflow `validate-real` dans [`docs/screenshots/`](docs/screenshots/) : fond IGN réel (`real-01-basemap.png`), escaliers de Fourvière (`lyon-01-stairs-fourviere.png`), R2 éviter / tolérer / rechercher (`lyon-02-r2-*.png`), montées de référence (`lyon-03-*.png`), générateurs et variantes (`lyon-04-*.png`, `lyon-05-variants.png`), sources d'altitude (`real-04-elevation-sources.png`).

## État du déploiement et CI

- `ci.yml` : lint, typecheck, tests unitaires (67), build, E2E Playwright (WebKit iPhone 13 + Chromium) sur fixtures hors ligne, puis déploiement GitHub Pages **si Pages est activé** (job `pages-enabled` : il tente de créer le site via l'API, sinon avertissement). Artefact `e2e-screenshots-and-results`.
- `fetch-data.yml` : récupère les données réelles (Overpass, IGN, Open-Meteo, sondes) et les committe dans `fixtures/`.
- `validate-real.yml` : E2E WebKit en réseau réel + E2E sur la fixture Lyon, résultats commités dans `docs/e2e-results/` et `docs/screenshots/`.

Si l'URL Pages ne répond pas : Settings → Pages → Build and deployment → Source : **GitHub Actions**, puis relancer le workflow `ci` (Actions → ci → Run workflow). Le job `deploy` publie `dist/` (≈ 18 Mo avec les données embarquées, servies gzip).
