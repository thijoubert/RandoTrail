# REPORT.md — verdict du labo urban trail (R1 à R4), zone Lyon centre

Zone étudiée : rectangle 45,746–45,786 N / 4,796–4,850 E (1er, 4e, 5e arrondissements, Croix‑Rousse, Fourvière, quais ; ≈ 4,2 × 4,4 km, 18,6 km²).

**Provenance des chiffres.** Tout ce qui suit est calculé sur des **données réelles** récupérées par le workflow GitHub Actions `fetch-data` (Overpass `overpass-api.de`, API altimétrie IGN Géoplateforme RGE ALTI, Open‑Meteo, sondes HTTP) et commitées dans `fixtures/` (voir `fixtures/meta.json` pour l'horodatage). Les tuiles terrain Terrarium ont été téléchargées depuis AWS par la session de développement (seul service externe accessible depuis cette session). Les tableaux sont produits par `scripts/report-data.mts` (sortie brute : `docs/report-tables.md`, `docs/report-data.json`) ; les mesures « navigateur » viennent de Playwright (`docs/e2e-results/*.json`, captures `docs/screenshots/`). Ce qui n'a pas pu être validé en réel est marqué **[sur fixture]** ou **[non validé]**.

@@TABLES@@

## Synthèse et verdicts

### R1 — Les escaliers sont-ils assez renseignés dans OSM à Lyon ? **OUI (avec réserve sur l'estimation des marches)**

- **1 055 ways `highway=steps`** dans la zone (13,5 km cumulés). Couverture des attributs : `step_count` **74 %**, `incline` **94 %**, `handrail` 83 %, `surface` 81 %, `lit` 62 %, `name` **11 %**, `width` 8 %.
- Les 20 montées/escaliers connus sont **tous présents** dans OSM. Les « montées » qui sont en réalité des rues en pente (Gourguillon, Saint‑Barthélemy, Chemin Neuf, Choulans, Bonafous, Esses) sont des `highway=residential/pedestrian/primary` sans tronçon `steps` : c'est correct et le classement par pente les traite (montée raide / très raide). Les escaliers célèbres (Chazeaux 249 marches, Nicolas de Lange 562, Grande‑Côte, Garillan, Mermet, Pouteau, Hoche 219, Change 121…) ont `step_count`, `incline`, `handrail`, `surface`.
- Le nom est rarement sur la way `steps` elle‑même (11 %) : pour nommer une montée il faut agréger les noms des rues voisines (ce que fait la détection de montées : nom OSM le plus long le long de la montée).
- **Estimation des marches par D+ / 0,17 m : peu fiable.** Sur 738 escaliers avec `step_count`, l'erreur relative médiane est de 60 % avec le MNT IGN 1 m et 84 % avec Terrarium ; seuls 23 % (IGN) / 6 % (Terrarium) des escaliers sont estimés à ±25 %. La hauteur de marche implicite médiane (Δh IGN / `step_count`) n'est que **0,10 m** : le MNT lisse les escaliers et les extrémités des ways OSM ne coïncident pas toujours avec le bas/haut des marches. L'estimation reste utile comme **ordre de grandeur signalé** (marqué « * » dans l'app) pour les 26 % d'escaliers sans `step_count`, pas comme valeur de référence.
- Conséquence pour l'app native : s'appuyer sur `step_count` quand il existe (74 % des cas, et ~100 % des grands escaliers), afficher l'estimation comme telle, et prévoir une **contribution OSM** (ou un cache local corrigé) pour les escaliers sans compte.

### R2 — Peut-on forcer le routage à éviter / tolérer / rechercher escaliers et pentes ? **OUI**

- Bellecour → Fourvière : **éviter** = 1 948 m, 1 escalier de 19 marches (seul accès OSM au nœud d'arrivée sur l'esplanade, inévitable même avec un facteur ×20) ; **tolérer** = 1 462 m, 10 escaliers, 821 marches (Chazeaux, Cardinal Billé, Rosaire) ; **rechercher** = identique à tolérer ici, car le plus court chemin passe déjà par le maximum d'escaliers. Les tracés « éviter » et « tolérer » sont visiblement différents (captures `docs/screenshots/lyon-02-r2-*.png`, `real-03-*.png`).
- Terreaux → Croix‑Rousse : éviter 1 105 m / 0 marche contre tolérer 962 m / 722 marches (Grande Côte). Saint‑Paul → Fourvière : éviter 1 263 m / 0 marche (montée Saint‑Barthélemy) contre 743 m / 1 362 marches (Nicolas de Lange, Carmes Déchaussés).
- Pentes : « limiter à 8 % » allonge Bellecour → Fourvière (sans escaliers) de 1 948 à 2 205 m et ramène la pente max de 23 % à 16 % (raide+très raide : 510 → 460 m). « Rechercher les pentes » (facteur 0,5 sur les montées) ne change pas ce tracé : à Lyon, le chemin le plus court vers Fourvière est déjà le plus raide. La préférence « rechercher » (escaliers ou pentes) n'a d'effet que lorsque l'option raide est un détour ; c'est le comportement attendu d'un coût multiplicatif, mais pour une app « chasse aux escaliers » il faudra plutôt un **générateur orienté objectif** (maximiser les marches sous contrainte de distance), qui est ce que font déjà les boucles et variantes avec cible D+.
- La fonction de coût (longueur × facteur(type, pente, surface) + pénalités) est portable telle quelle en Swift (`src/core/cost.ts`, 120 lignes).

### R3 — Les altitudes en ville sont-elles assez fiables pour classer les montées ? **OUI avec IGN RGE ALTI ; Terrarium/SRTM seulement pour le profil grossier**

- **CORS / accès navigateur (validé en réel)** : l'API altimétrie IGN (`data.geopf.fr`), Open‑Meteo, les tuiles Terrarium AWS et le WMTS IGN sans clé répondent tous **HTTP 200 depuis GitHub Actions**, avec `Access-Control-Allow-Origin: *` pour IGN alti, IGN WMTS et OpenTopoMap ; Open‑Meteo et AWS S3 n'exposent pas l'en‑tête en réponse à une requête serveur simple mais sont utilisés quotidiennement depuis des navigateurs (Open‑Meteo documente CORS ; les tuiles Terrarium sont lues par MapLibre pour le terrain 3D). Le test WebKit réel (`docs/e2e-results/real-network.json`) le confirme ou l'infirme point par point ; voir la section « Preuves ».
- **Précision** (121 713 sommets du graphe) : Terrarium z14 − IGN RGE ALTI = biais **+5,7 m**, erreur absolue moyenne 6,8 m, RMSE 8,2 m, P90 12,9 m, max 57 m. Le biais positif est typique d'un MNT radar (SRTM) qui « voit » les toits en ville. Open‑Meteo (GLO‑90) : voir tableau des points de référence et de l'échantillon.
- **Effet sur le D+** : boucle Bellecour → Fourvière → Saint‑Jean → Bellecour (2,96 km) : **IGN 151 m** (144 m après correction ponts/tunnels), **Terrarium 178 m** (+18 %). Le lissage ±25 m / seuil 3 m ramène IGN à 134 m et Terrarium à 165 m : l'écart entre sources est plus grand que l'effet du lissage. Pour classer les montées (seuils 6/12/20 %) sur des tronçons de 50–300 m, IGN 1 m est fiable ; Terrarium produit des pentes fausses de ±5 points sur les tronçons courts et des pics (max 57 m) près des falaises de Fourvière et des quais.
- **Ponts et tunnels** : 277 arêtes `bridge`, 415 `tunnel`. Avec IGN, 81 ponts et 26 tunnels avaient un creux/bosse > 0,5 m (jusqu'à 8,7 m sur un pont de la Saône) ; l'interpolation linéaire entre extrémités les corrige et l'app le signale (« arêtes corrigées »). 114 « sauts » > 60 % hors escaliers (murs de soutènement, quais bas/hauts, bords de falaise du MNT 1 m) sont également lissés et signalés.
- **Recommandation** : IGN RGE ALTI (API Géoplateforme, gratuite, sans clé, ~1 000 points par requête POST, CORS ok) pour les tracés et le classement ; MNT raster (Terrarium) uniquement pour un profil approximatif hors ligne ou pour le graphe complet en attendant un cache IGN par nœud (1,3 Mo pour 63 006 nœuds, comme `fixtures/lyon-centre.ign-alti.json`). Jamais d'escalier déduit du MNT.

### R4 — Génération rapide d'A/R, boucles et variantes sans quota ? **OUI : le routage navigateur suffit**

- Graphe Lyon centre : 22 190 ways → **34 097 nœuds, 46 460 arêtes** ; JSON Overpass 10,3 Mo brut / **1,7 Mo gzip**. Overpass a répondu en 18–40 s depuis GitHub (serveurs publics partagés, 429 fréquents sur les miroirs) ; le JSON est mis en cache IndexedDB, et une copie réelle est embarquée dans le site.
- Node.js : parse 25 ms, construction 164 ms, altitudes Terrarium 78 ms, A* Bellecour → Croix‑Rousse **4 ms**, A/R même chemin 113 ms, A/R retour différent 201 ms, 5 boucles 257 ms, variantes 33 ms.
- Navigateur Chromium viewport iPhone (local, Overpass simulé) : chargement complet **2,2 s** (dont construction 177 ms, altitudes 550 ms), routage 4–18 ms, A/R 0,6–0,7 s, boucle 0,8 s, variantes 0,7 s (temps mur, interface comprise). WebKit réel : voir « Preuves ». Un iPhone récent est 2–3× plus lent qu'un runner : on reste sous 3 s pour tout générateur.
- **Verdict : pas besoin de serveur.** Aucun quota : seules les API publiques Overpass (pour la zone, une fois) et IGN alti (par tracé) sont sollicitées. Risque restant : la disponibilité d'Overpass (d'où le cache + la copie embarquée ; pour l'app native, prévoir un extrait OSM pré‑construit par zone, régénéré par un job périodique comme `fetch-data`).

### Conclusion — **GO pour l'app native**, avec ces ajustements

À garder : graphe piéton OSM compacté en mémoire, A*/Dijkstra maison avec coût paramétrable, classification à seuils, détection de montées sur profil lissé, générateurs A/R / boucles / variantes par pénalisation d'arêtes, import/export GPX, cas de test JSON (`expected/lyon-reference-routes.json`) rejouables en Swift.

Ce qui change :
1. Source d'altitude principale = **IGN RGE ALTI** (API par tracé + cache par nœud téléchargé avec la zone), Terrarium en repli hors ligne.
2. `step_count` = vérité terrain ; l'estimation par D+ n'est qu'un ordre de grandeur (ou calibrer sur 0,10 m par marche de MNT, ce qui reste à ±70 %).
3. « Rechercher les escaliers » doit devenir un **objectif de génération** (maximiser marches / D+ sous contrainte de distance), pas seulement un facteur de coût.
4. Données par zone pré‑construites (extrait Overpass + altitudes IGN par nœud, ~3 Mo gzip pour Lyon centre) distribuées avec l'app ou téléchargées une fois, pour ne pas dépendre d'Overpass en direct.

Risques restants : fraîcheur et exhaustivité d'OSM hors centre (couverture `step_count` probablement plus faible en périphérie) ; comportement GPS d'arrière‑plan non testé (PWA) ; disponibilité d'Overpass ; les miroirs publics bloquent parfois les runners CI (429), ce qui peut aussi arriver sur réseau mobile partagé.

## Preuves et procédure pour refaire les mesures

@@PROOFS@@
