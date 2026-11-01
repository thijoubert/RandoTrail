# DECISIONS.md — choix d'architecture et hypothèses

Document tenu au fil du travail. Chaque entrée : décision, alternatives écartées, raison.

## 0. Challenge de l'architecture proposée (avant de coder)

L'architecture demandée (Overpass → graphe en mémoire → routage navigateur, altitude par API derrière une interface, fond IGN) est retenue. Points challengés et ajustements :

1. **Taille du graphe Lyon centre.** La zone demandée (1er, 4e, 5e, Croix‑Rousse, Fourvière, quais ≈ 4,5 × 4,5 km) représente ~25 000 chemins et ~150 000 nœuds. Sans précaution, le JSON Overpass dépasse 30 Mo. Ajustement : requête `out tags geom` filtrée sur les `highway` piétons uniquement, nœuds dédoublonnés et graphe compacté (arrêtes = chaînes de nœuds entre carrefours, mais géométrie conservée). Objectif : < 12 Mo brut, < 2 Mo gzip, chargement < 3 s sur iPhone. R4 mesure cela.
2. **Altitude de 150 000 nœuds par API point à point est impossible** (quota, temps). Ajustement : source par défaut = **tuiles terrain Terrarium (AWS, z14 ≈ 10 m/px, SRTM/NED fusionnés)** chargées en bloc (~30 tuiles pour la zone, ~2 Mo) et décodées côté navigateur. IGN RGE ALTI (API altimétrie Géoplateforme, 1 m) est utilisée **uniquement pour le tracé courant** (quelques centaines de points, 1 requête POST), comme source « précise ». Open‑Meteo (90 m) sert de comparaison. Les trois sont derrière `ElevationProvider`. R3 chiffre l'écart sur des points de référence.
3. **Escaliers : jamais déduits du MNT**, uniquement `highway=steps`. Le MNT 10 m ne peut pas distinguer un escalier de 20 marches d'une pente ; cela confirme que l'escalier doit venir d'OSM (R1 devient donc critique).
4. **Pas de bibliothèque de graphe** : A* et Dijkstra écrits à la main (~150 lignes), portables en Swift. Index spatial = grille de cellules (pas de R‑tree).
5. **Fond de carte IGN sans clé** : depuis 2024 les couches « essentielles » de la Géoplateforme (Plan IGN v2, ortho) sont ouvertes sans clé sur `data.geopf.fr/wmts`. À vérifier en CI (test réseau réel). Replis : OpenTopoMap (faible trafic acceptable), puis fond vide avec le graphe seul.
6. **Réseau de la session de développement bloqué** (Overpass, IGN, Open‑Meteo, tuiles de fond refusés par le proxy ; npm, GitHub API et tuiles Terrarium AWS autorisés). Conséquence : les données réelles sont récupérées par un workflow GitHub Actions (`fetch-data.yml`) qui committe les fixtures dans `fixtures/` ; le rapport est calculé localement sur ces fixtures réelles ; les appels réseau « depuis un navigateur » (CORS) sont validés par Playwright **en CI** et publiés en artefacts. Ce qui est validé sur fixture vs en réel est tracé dans REPORT.md.
7. **GitHub Pages sur dépôt privé** nécessite un plan payant ; l'API Pages est bloquée par le proxy de la session. Plan : `actions/configure-pages` avec `enablement: true` dans le workflow ; si refus (dépôt privé sur plan gratuit), basculer le dépôt en public (accepté par l'énoncé) via l'API si le proxy l'autorise, sinon action utilisateur.
8. **WebKit indisponible localement** (téléchargement bloqué) : E2E locaux sur Chromium avec viewport iPhone ; E2E CI sur WebKit (iPhone 13, 390×844, géolocalisation simulée). Les captures lues sont celles de CI quand WebKit diffère.
9. **Coût de routage directionnel** : la pente dépend du sens de parcours ; le graphe stocke chaque arête une fois et le coût est calculé à la volée avec le signe de la pente. Heuristique A* = distance à vol d'oiseau × facteur minimal possible (admissible).
10. **Portabilité Swift** : modules `src/core/*` sans DOM, sans `Map` exotiques, types explicites, pas de closures capturant l'état global ; les cas de test sont exportés en JSON dans `fixtures/` + `expected/`.

## Journal des décisions

- D1 (fond de carte) : IGN Plan IGN v2 WMTS sans clé, repli OpenTopoMap, repli vide. Écarté : tuiles OSM publiques (politique d'usage), MapTiler (clé).
- D2 (altitude) : Terrarium AWS par défaut pour le graphe entier ; IGN RGE ALTI pour le tracé (précision) ; Open‑Meteo comparaison. Écarté : SRTM brut (pas de CORS simple), altitudes de l'API IGN pour tout le graphe (150 000 points).
- D3 (graphe) : arêtes = segments entre nœuds consécutifs OSM mais **compactées** entre carrefours ; longueur, D+/D- et pente calculés par sous‑segment. Écarté : graphe nœud‑à‑nœud brut (3× plus d'arêtes, A* plus lent sur mobile).
- D4 (profil) : uPlot (45 ko) plutôt que Chart.js (200 ko).
- D5 (cache) : IndexedDB pour le JSON Overpass et les tuiles Terrarium décodées (Float32Array). Clé = bbox arrondie + version de requête.
- D6 (estimation de marches) : `step_count` OSM si présent ; sinon `round(|Δh| / 0.17)` marqué « estimé ». Le 0,17 m est réglable.
- D7 (anomalies d'altitude) : pour les arêtes `bridge=*` ou `tunnel=*`, altitude des nœuds intérieurs interpolée linéairement entre les extrémités ; pour toute arête non‑escalier avec pente > 60 %, lissage (corrigé, signalé). Les escaliers ne sont jamais corrigés.
- D8 (branche) : travail directement sur `main` (dépôt vide, pas de collaborateur), un commit par étape.
- D9 (Overpass) : `out body geom` et non `out tags geom` — le mode `tags` omet la liste des nœuds (ids) nécessaire à la connectivité du graphe (découvert sur la première exécution CI : TypeError sur `nodes`). Les mirroirs : overpass-api.de répond 406 sans `User-Agent` explicite, kumi/private.coffee 429 depuis les runners GitHub ; stratégie = UA explicite + 3 tours avec attente.
- D10 (IGN altimétrie) : les lots de 2000 points en POST renvoient HTTP 500 « An unexpected error occurred » ; stratégie adaptative (POST 500/200/100 puis GET 50/20) et résultat partiel conservé plutôt qu'un échec du workflow.
- D11 (MapLibre) : `map.isStyleLoaded()` est faux pendant qu'une source GeoJSON se charge ; il faut tester l'existence de la source (`getSource`) avant `setData`, sinon la 2e source mise à jour dans le même tick (escaliers, tracé) attend un événement `load` qui ne revient jamais. Bug trouvé par lecture des captures E2E (escaliers absents).
- D12 (GitHub Pages) : `actions/configure-pages` avec `enablement: true` échoue avec le `GITHUB_TOKEN` (« Resource not accessible by integration ») et l'API Pages est refusée par le proxy de la session ; la bascule du dépôt en public par l'API a été refusée par le mode auto. Le job `deploy` est conditionné à un contrôle `gh api repos/.../pages` : il est sauté avec un avertissement tant que Pages n'est pas activé par le propriétaire (action utilisateur documentée dans README).
- D13 (variantes) : dédoublonnage par recouvrement d'arêtes (> 75 % dans les deux sens = identique). Sur la petite grille synthétique seulement 2 variantes distinctes existent ; la contrainte « ≥ 3 » est vérifiée sur la zone Lyon réelle.
- D14 (altitudes du tracé) : les fournisseurs « précis » (IGN API, Open-Meteo) ne sont appelés que pour les points du tracé courant (quelques centaines), avec cache par coordonnée ; le graphe entier garde Terrarium (ou le fichier IGN pré-calculé en mode embarqué).
