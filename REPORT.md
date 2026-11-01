# REPORT.md — verdict du labo urban trail (R1 à R4), zone Lyon centre

Zone étudiée : rectangle 45,746–45,786 N / 4,796–4,850 E (1er, 4e, 5e arrondissements, Croix‑Rousse, Fourvière, quais ; ≈ 4,2 × 4,4 km, 18,6 km²).

**Provenance des chiffres.** Tout ce qui suit est calculé sur des **données réelles** récupérées par le workflow GitHub Actions `fetch-data` (Overpass `overpass-api.de`, API altimétrie IGN Géoplateforme RGE ALTI, Open‑Meteo, sondes HTTP) et commitées dans `fixtures/` (voir `fixtures/meta.json` pour l'horodatage). Les tuiles terrain Terrarium ont été téléchargées depuis AWS par la session de développement (seul service externe accessible depuis cette session). Les tableaux sont produits par `scripts/report-data.mts` (sortie brute : `docs/report-tables.md`, `docs/report-data.json`) ; les mesures « navigateur » viennent de Playwright (`docs/e2e-results/*.json`, captures `docs/screenshots/`). Ce qui n'a pas pu être validé en réel est marqué **[sur fixture]** ou **[non validé]**.

## Données

## R1 — Escaliers dans OSM (zone Lyon centre)
| Indicateur | Valeur |
|---|---|
| Ways `highway=steps` | **1055** (13536 m cumulés) |
| avec `step_count` | 778 (74 %) — médiane 14 marches, max 562 |
| avec `incline` | 989 (94 %) — valeurs : up ×563, down ×425, 40% ×1 |
| avec `name` | 114 (11 %) |
| avec `handrail*` | 876 (83 %) |
| avec `surface` | 853 (81 %) |
| avec `width` | 83 (8 %) |
| avec `lit` | 649 (62 %) |
| Somme des `step_count` renseignés | 18588 marches |

### Escaliers et montées connus

| Nom | Dans OSM | Ways `steps` | Autres `highway` | step_count | incline | handrail | surface |
|---|---|---|---|---|---|---|---|
| Montée du Gourguillon | ✅ | — | pedestrian | — | — | — | — |
| Montée Saint-Barthélemy | ✅ | — | residential | — | — | — | — |
| Montée des Chazeaux | ✅ | 1 (109 m) | footway | 1/1 : 249 | up | yes | concrete |
| Montée de la Grande-Côte | ✅ | 2 (75 m) | residential, pedestrian, footway | 2/2 : 108, 24 | up | yes | paving_stones |
| Montée des Carmélites | ✅ | 1 (31 m) | residential, footway, pedestrian, service | 1/1 : 39 | down | yes | concrete |
| Montée Nicolas de Lange | ✅ | 1 (253 m) | living_street, residential, footway | 1/1 : 562 | up | yes | concrete |
| Montée des Épies | ✅ | 1 (75 m) | footway, residential | 0/1 | down | yes | concrete |
| Montée du Garillan | ✅ | 2 (123 m) | footway | 2/2 : 123, 99 | down | no, yes | concrete |
| Montée du Chemin Neuf | ✅ | — | residential | — | — | — | — |
| Montée Saint-Sébastien | ✅ | 1 (3 m) | residential, footway, unclassified, path | 1/1 : 9 | up | yes | concrete |
| Montée de la Sarra | ✅ | 2 (277 m) | residential, service, footway, path, cycleway, primary | 2/2 : 269, 150 | up | yes | concrete |
| Escaliers Mermet | ✅ | 2 (34 m) | service, footway | 2/2 : 38, 20 | up | yes | concrete |
| Montée des Esses | ✅ | — | secondary, primary, cycleway | — | — | — | — |
| Montée du Change | ✅ | 1 (47 m) | pedestrian | 1/1 : 121 | down | yes | concrete |
| Montée Rey | ✅ | 1 (9 m) | residential, pedestrian, living_street, tertiary | 1/1 : 19 | up | yes | concrete |
| Montée Hoche | ✅ | 1 (92 m) | — | 1/1 : 219 | up | yes | concrete |
| Montée de Choulans | ✅ | — | primary, tertiary_link | — | — | — | — |
| Montée Bonafous | ✅ | — | residential | — | — | — | — |
| Montée du Télégraphe | ✅ | 1 (5 m) | residential, footway | 1/1 : 16 | up | yes | concrete |
| Rue Pouteau | ✅ | 2 (74 m) | residential, footway | 2/2 : 76, 84 | up | yes | concrete |

### Fiabilité de l'estimation des marches (marches = |Δh| / hauteur de marche)

Sur les **738** escaliers ayant un `step_count` ≥ 3 (Δh = différence d'altitude entre les deux extrémités de la way) :

| Source d'altitude | Hauteur de marche | Erreur abs. moyenne | Erreur abs. médiane | Erreur relative médiane | ≤ 25 % d'erreur | ≤ 50 % d'erreur |
|---|---|---|---|---|---|---|
| IGN RGE ALTI 1 m | 0,17 m | 10.6 marches | 6 | 60 % | 23 % | 45 % |
| IGN RGE ALTI 1 m | 0.098 m (calibrée) | 16.1 marches | 7 | 70 % | 20 % | 39 % |
| Terrarium z14 (~30 m) | 0,17 m | 16.6 marches | 11 | 84 % | 6 % | 17 % |
| Terrarium z14 (~30 m) | 0.098 m (calibrée) | 14.6 marches | 9 | 78 % | 14 % | 29 % |

Hauteur de marche implicite médiane (Δh IGN / step_count) : **0.098 m** (au lieu des 0,17 m attendus : le MNT 1 m « lisse » les escaliers et les extrémités des ways ne coïncident pas toujours avec le bas et le haut des marches).

Escaliers longs (≥ 30 m, n = 68), hauteur calibrée : IGN erreur relative médiane 70 %, ≤ 25 % : 12 % ; Terrarium erreur relative médiane 37 %, ≤ 25 % : 37 %.

## R2 — Le routage réagit-il aux préférences ?
| Trajet | Préférence | Distance | D+ | Escaliers (arêtes) | Marches | Noms d'escaliers empruntés | Temps A* (Node) |
|---|---|---|---|---|---|---|---|
| Bellecour → Fourvière | avoid | 1948 m | 134 m | 1 | 19 | — | 27 ms |
| Bellecour → Fourvière | tolerate | 1462 m | 133 m | 10 | 821 (dont 64 est.) | Montée des Chazeaux, Montée Cardinal Louis-Marie Billé, Chemin du Rosaire | 9 ms |
| Bellecour → Fourvière | prefer | 1462 m | 133 m | 10 | 821 (dont 64 est.) | Montée des Chazeaux, Montée Cardinal Louis-Marie Billé, Chemin du Rosaire | 15 ms |
| Terreaux → Croix-Rousse | avoid | 1105 m | 81 m | 0 | 0 | — | 5 ms |
| Terreaux → Croix-Rousse | tolerate | 962 m | 82 m | 10 | 722 | Rue Sainte-Marie des Terreaux, Montée de la Grande Côte | 2 ms |
| Terreaux → Croix-Rousse | prefer | 962 m | 82 m | 10 | 722 | Rue Sainte-Marie des Terreaux, Montée de la Grande Côte | 4 ms |
| Saint-Paul → Fourvière | avoid | 1263 m | 121 m | 0 | 0 | — | 2 ms |
| Saint-Paul → Fourvière | tolerate | 743 m | 119 m | 3 | 1362 | Montée des Carmes Déchaussés, Montée Nicolas de Lange | 1 ms |
| Saint-Paul → Fourvière | prefer | 743 m | 119 m | 3 | 1362 | Montée des Carmes Déchaussés, Montée Nicolas de Lange | 1 ms |
| Quai Saint-Antoine → Croix-Rousse | avoid | 1676 m | 84 m | 0 | 0 | — | 4 ms |
| Quai Saint-Antoine → Croix-Rousse | tolerate | 1563 m | 84 m | 9 | 679 | Montée de la Grande Côte | 2 ms |
| Quai Saint-Antoine → Croix-Rousse | prefer | 1563 m | 84 m | 9 | 679 | Montée de la Grande Côte | 9 ms |
| Bellecour → Fourvière, escaliers évités | pentes : neutral | 1948 m | 134 m | — | — | raide+très raide : 510 m, pente max 23 % | — |
| Bellecour → Fourvière, escaliers évités | pentes : limit (8 %) | 2205 m | 134 m | — | — | raide+très raide : 460 m, pente max 16 % | — |
| Bellecour → Fourvière, escaliers évités | pentes : seek | 1948 m | 134 m | — | — | raide+très raide : 510 m, pente max 23 % | — |

## R3 — Fiabilité des altitudes
_Source des points de référence : fixtures/lyon-reference-elevations.json (IGN API + Open-Meteo API, GitHub Actions)._

### Points de référence

| Point | Valeur publique | IGN RGE ALTI | Open-Meteo (GLO-90) | Terrarium z14 | Écart Terrarium−IGN | Écart Open-Meteo−IGN |
|---|---|---|---|---|---|---|
| Esplanade de Fourvière (basilique) | 287 m | 291.7 | 293.0 | 298.2 | 6.5 | 1.3 |
| Place Bellecour (centre) | 168 m | 168.1 | 168.0 | 173.6 | 5.5 | -0.1 |
| Place de la Croix-Rousse | 250 m | 250.4 | 254.0 | 254.6 | 4.2 | 3.6 |
| Place des Terreaux | 170 m | 169.6 | 177.0 | 183.8 | 14.2 | 7.4 |
| Quai Saint-Antoine (Saône) | 166 m | 167.2 | 161.0 | 159.2 | -8.0 | -6.2 |
| Place Saint-Jean (Vieux Lyon) | 170 m | 168.7 | 176.0 | 179.0 | 10.3 | 7.3 |
| Parc de la Tête d'Or (lac) | 170 m | 167.5 | 180.0 | 180.4 | 12.9 | 12.5 |
| Montée de la Grande-Côte (haut) | 230 m | 207.4 | 210.0 | 227.5 | 20.1 | 2.6 |
| Montée de la Grande-Côte (bas) | 180 m | 170.2 | 189.0 | 186.4 | 16.2 | 18.8 |
| Pont Bonaparte (milieu, tablier) | 172 m | 162.1 | 161.0 | 160.0 | -2.1 | -1.1 |

### Écarts par rapport à IGN RGE ALTI sur 600 nœuds du graphe (échantillon régulier)

| Source | Biais moyen | Erreur abs. moyenne | RMSE | P90 | Max |
|---|---|---|---|---|---|
| Open-Meteo (GLO-90) | 6.13 m | 7.71 m | 10.27 m | 16.4 m | 50.5 m |
| Terrarium z14 | 5.75 m | 6.95 m | 8.51 m | 13.8 m | 28.2 m |

Sur **tous** les sommets du graphe (121829) : Terrarium − IGN : biais 5.65 m, erreur abs. moyenne 6.83 m, RMSE 8.23 m, P90 12.9 m, max 56.7 m.

### Ponts, tunnels, sauts aberrants (source IGN RGE ALTI)

277 arêtes `bridge`, 415 arêtes `tunnel` dans le graphe. Correction par interpolation linéaire entre les extrémités : 174 arêtes corrigées (81 ponts, 26 tunnels, 114 sauts > 60 % hors escaliers).

| Arête | Type | Nom | Écart max corrigé |
|---|---|---|---|
| 9701 | jump | — | 9.8 m |
| 38443 | bridge | — | 8.7 m |
| 43121 | jump | — | 8.0 m |
| 25786 | jump | Pont de la Guillotière | 7.8 m |
| 44746 | jump | Montée Coquillat | 7.7 m |
| 19331 | jump | — | 7.7 m |
| 45698 | bridge | — | 7.6 m |
| 26803 | jump | — | 7.4 m |

### D+ d'un même tracé (Bellecour → Fourvière → Saint-Jean → Bellecour) selon la source et le lissage

| Source | Lissage 0 m, seuil 1 m | Lissage 10 m, seuil 1 m | Lissage 25 m, seuil 3 m | Lissage 50 m, seuil 5 m | Distance |
|---|---|---|---|---|---|
| IGN brut | +151 / −151 m | +150 / −150 m | +134 / −132 m | +123 / −125 m | 2963 m |
| IGN corrigé ponts/tunnels | +144 / −144 m | +143 / −143 m | +130 / −129 m | +123 / −125 m | 2963 m |
| Terrarium brut | +178 / −178 m | +176 / −177 m | +165 / −166 m | +175 / −175 m | 2963 m |
| Terrarium corrigé | +175 / −175 m | +173 / −174 m | +166 / −166 m | +175 / −175 m | 2963 m |

### Sondes réseau (depuis GitHub Actions, 2026-11-01T16:49:28.515Z)

| Service | HTTP | Type | Octets | CORS (`Access-Control-Allow-Origin`) | Temps |
|---|---|---|---|---|---|
| ign-wmts-planignv2 | 200 | image/png | 17654 | * | 979 ms |
| ign-wmts-ortho | 200 | image/jpeg | 7779 | * | 548 ms |
| ign-wmts-capabilities | 200 | application/xml | 3080569 | * | 467 ms |
| opentopomap | 200 | image/png | 8014 | * | 421 ms |
| terrarium-aws | 200 | image/png | 60845 | — | 235 ms |
| ign-alti-get | 200 | application/json | 24 | * | 183 ms |
| open-meteo | 200 | application/json | 21 | — | 550 ms |
| opentopodata-srtm30m | 200 | application/json | 181 | — | 344 ms |
| overpass-status https://overpass-api.de | 502 | text/plain | 534 | * | 356 ms |
| overpass-status https://overpass.kumi.systems | 0 (This operation was aborted) | — | — | — | 30003 ms |
| overpass-status https://overpass.private.coffee | 0 (This operation was aborted) | — | — | — | 30000 ms |
| overpass-status https://maps.mail.ru/osm/tools/overpass | 200 | text/plain; charset=utf-8 | 168 | * | 9518 ms |

## R4 — Performance du routage navigateur (mesures Node.js ; mesures navigateur dans le rapport)
| Mesure | Valeur |
|---|---|
| JSON Overpass (zone 4,2 × 4,4 km) | 10.30 Mo brut, **1.69 Mo gzip** (22190 ways) |
| Graphe | 34097 nœuds, 46460 arêtes |
| Parse JSON → ways | 14 ms |
| Construction du graphe | 187 ms |
| Altitudes Terrarium (décodage + échantillonnage 121829 sommets) | 38 ms |
| A* Bellecour → Croix-Rousse | 4 ms |
| A/R même chemin (6 km, 250 m D+) | 130 ms |
| A/R retour différent | 255 ms |
| Boucles (5 résultats) | 303 ms |
| Variantes (3 résultats) | 43 ms |

## Cas de test de référence (export JSON pour la future app Swift)

| Cas | Distance | D+ | D− | Escaliers | Marches | Montées (nom, D+) |
|---|---|---|---|---|---|---|
| bellecour-fourviere-tolerate | 1462 m | 133 m | 9 m | 10 | 821 | Chemin du Rosaire (+135 m) |
| bellecour-fourviere-avoid | 1948 m | 134 m | 11 m | 1 | 19 | Montée du Gourguillon (+135 m) |
| bellecour-fourviere-prefer | 1462 m | 133 m | 9 m | 10 | 821 | Chemin du Rosaire (+135 m) |
| gourguillon | 1129 m | 109 m | 7 m | 0 | 0 | Montée du Gourguillon (+110 m) |
| saint-barthelemy | 1263 m | 121 m | 2 m | 0 | 0 | Montée Saint-Barthélémy (+121 m) |
| saint-paul-fourviere-stairs | 743 m | 119 m | 0 m | 3 | 1362 | Montée Nicolas de Lange (+119 m) |
| grande-cote | 962 m | 81 m | 0 m | 4 | 218 | Rue Pouteau (+82 m) |
| quais-pont-bonaparte | 673 m | 5 m | 9 m | 1 | 23 | aucune |
| tete-dor-plat | 1183 m | 5 m | 4 m | 0 | 0 | aucune |


## Synthèse et verdicts

### R1 — Les escaliers sont-ils assez renseignés dans OSM à Lyon ? **OUI (avec réserve sur l'estimation des marches)**

- **1 055 ways `highway=steps`** dans la zone (13,5 km cumulés). Couverture des attributs : `step_count` **74 %**, `incline` **94 %**, `handrail` 83 %, `surface` 81 %, `lit` 62 %, `name` **11 %**, `width` 8 %.
- Les 20 montées/escaliers connus sont **tous présents** dans OSM. Les « montées » qui sont en réalité des rues en pente (Gourguillon, Saint‑Barthélemy, Chemin Neuf, Choulans, Bonafous, Esses) sont des `highway=residential/pedestrian/primary` sans tronçon `steps` : c'est correct et le classement par pente les traite (montée raide / très raide). Les escaliers célèbres (Chazeaux 249 marches, Nicolas de Lange 562, Grande‑Côte, Garillan, Mermet, Pouteau, Hoche 219, Change 121…) ont `step_count`, `incline`, `handrail`, `surface`.
- Le nom est rarement sur la way `steps` elle‑même (11 %) : pour nommer une montée il faut agréger les noms des rues voisines (ce que fait la détection de montées : nom OSM le plus long le long de la montée).
- **Estimation des marches par D+ / 0,17 m : peu fiable.** Sur 738 escaliers avec `step_count`, l'erreur relative médiane est de 60 % avec le MNT IGN 1 m et 84 % avec Terrarium ; seuls 23 % (IGN) / 6 % (Terrarium) des escaliers sont estimés à ±25 %. La hauteur de marche implicite médiane (Δh IGN / `step_count`) n'est que **0,10 m** : le MNT lisse les escaliers et les extrémités des ways OSM ne coïncident pas toujours avec le bas/haut des marches. L'estimation reste utile comme **ordre de grandeur signalé** (marqué « * » dans l'app) pour les 26 % d'escaliers sans `step_count`, pas comme valeur de référence.
- Conséquence pour l'app native : s'appuyer sur `step_count` quand il existe (74 % des cas, et ~100 % des grands escaliers), afficher l'estimation comme telle, et prévoir une **contribution OSM** (ou un cache local corrigé) pour les escaliers sans compte.

### R2 — Peut-on forcer le routage à éviter / tolérer / rechercher escaliers et pentes ? **OUI**

- Bellecour → Fourvière : **éviter** = 1 948 m, 1 escalier de 19 marches (seul accès OSM au nœud d'arrivée sur l'esplanade, inévitable même avec un facteur ×20) ; **tolérer** = 1 462 m, 10 escaliers, 821 marches (Chazeaux, Cardinal Billé, Rosaire) ; **rechercher** = identique à tolérer ici, car le plus court chemin passe déjà par le maximum d'escaliers. Les tracés « éviter » et « tolérer » sont visiblement différents (captures `docs/screenshots/lyon-02-r2-*.png` hors ligne et `real-03-*.png` en réseau réel WebKit ; mêmes distances et marches dans les deux cas : 1 948 m / 19 marches contre 1 462 m / 829 marches avec les altitudes Terrarium).
- Terreaux → Croix‑Rousse : éviter 1 105 m / 0 marche contre tolérer 962 m / 722 marches (Grande Côte). Saint‑Paul → Fourvière : éviter 1 263 m / 0 marche (montée Saint‑Barthélemy) contre 743 m / 1 362 marches (Nicolas de Lange, Carmes Déchaussés).
- Pentes : « limiter à 8 % » allonge Bellecour → Fourvière (sans escaliers) de 1 948 à 2 205 m et ramène la pente max de 23 % à 16 % (raide+très raide : 510 → 460 m). « Rechercher les pentes » (facteur 0,5 sur les montées) ne change pas ce tracé : à Lyon, le chemin le plus court vers Fourvière est déjà le plus raide. La préférence « rechercher » (escaliers ou pentes) n'a d'effet que lorsque l'option raide est un détour ; c'est le comportement attendu d'un coût multiplicatif, mais pour une app « chasse aux escaliers » il faudra plutôt un **générateur orienté objectif** (maximiser les marches sous contrainte de distance), qui est ce que font déjà les boucles et variantes avec cible D+.
- La fonction de coût (longueur × facteur(type, pente, surface) + pénalités) est portable telle quelle en Swift (`src/core/cost.ts`, 120 lignes).

### R3 — Les altitudes en ville sont-elles assez fiables pour classer les montées ? **OUI avec IGN RGE ALTI ; Terrarium/SRTM seulement pour le profil grossier**

- **CORS / accès navigateur (validé en réel depuis WebKit iPhone, `docs/e2e-results/real-network.json`)** : l'API altimétrie IGN (`data.geopf.fr`, `Access-Control-Allow-Origin: *`), Open‑Meteo (`*`), les tuiles Terrarium AWS (`*`) et le WMTS Plan IGN v2 **sans clé** (`*`) répondent tous HTTP 200 depuis un vrai navigateur, **sans aucune erreur console**. Point d'attention découvert en réel : l'API IGN renvoie **HTTP 500 pour les lots POST de 100 à 2 000 points** ; seul **GET × 50 points** fonctionne (≈ 300–450 ms par lot, soit ~1,5 s pour un tracé de 300 points avec 4 requêtes en parallèle). L'app a été corrigée en conséquence.
- **Précision** : sur les 10 points de référence, IGN RGE ALTI est à **±2 m des valeurs publiques** (Bellecour 168,1 / 168 ; Croix‑Rousse 250,4 / 250 ; Terreaux 169,6 / 170), Open‑Meteo (GLO‑90) dévie de +7 à +19 m dans les rues étroites (Terreaux 177, Saint‑Jean 176, bas de la Grande‑Côte 189 contre 170 IGN) et Terrarium de +6 à +20 m. Sur 600 nœuds du graphe : Open‑Meteo − IGN = biais +6,1 m, erreur abs. moyenne 7,7 m, RMSE 10,3 m, max 50 m ; Terrarium − IGN = biais +5,8 m, 7,0 m, RMSE 8,5 m ; sur les 121 829 sommets : Terrarium biais **+5,7 m**, RMSE 8,2 m, max 57 m. Le biais positif est typique d'un MNT radar (SRTM/Copernicus) qui « voit » les toits en ville. Le tablier du pont Bonaparte est à 160–162 m pour les trois sources (= niveau de la Saône) contre ~172 m réels : **aucune source ne connaît les ponts**, d'où la correction par interpolation.
- **Effet sur le D+** : boucle Bellecour → Fourvière → Saint‑Jean → Bellecour (2,96 km) : **IGN 151 m** (144 m après correction ponts/tunnels), **Terrarium 178 m** (+18 %). Le lissage ±25 m / seuil 3 m ramène IGN à 134 m et Terrarium à 165 m : l'écart entre sources est plus grand que l'effet du lissage. Même constat depuis WebKit sur Bellecour → Fourvière : D+ 136 m (IGN API) contre 147 m (Terrarium) et 155 m (Open‑Meteo) ; D− 13 m (IGN) contre 23 m (Terrarium) et 35 m (Open‑Meteo), ces « descentes » n'existant pas sur le terrain. Pour classer les montées (seuils 6/12/20 %) sur des tronçons de 50–300 m, IGN 1 m est fiable ; Terrarium produit des pentes fausses de ±5 points sur les tronçons courts et des pics (max 57 m) près des falaises de Fourvière et des quais.
- **Ponts et tunnels** : 277 arêtes `bridge`, 415 `tunnel`. Avec IGN, 81 ponts et 26 tunnels avaient un creux/bosse > 0,5 m (jusqu'à 8,7 m sur un pont de la Saône) ; l'interpolation linéaire entre extrémités les corrige et l'app le signale (« arêtes corrigées »). 114 « sauts » > 60 % hors escaliers (murs de soutènement, quais bas/hauts, bords de falaise du MNT 1 m) sont également lissés et signalés.
- **Recommandation** : IGN RGE ALTI (API Géoplateforme, gratuite, sans clé, ~1 000 points par requête POST, CORS ok) pour les tracés et le classement ; MNT raster (Terrarium) uniquement pour un profil approximatif hors ligne ou pour le graphe complet en attendant un cache IGN par nœud (1,3 Mo pour 63 006 nœuds, comme `fixtures/lyon-centre.ign-alti.json`). Jamais d'escalier déduit du MNT.

### R4 — Génération rapide d'A/R, boucles et variantes sans quota ? **OUI : le routage navigateur suffit**

- Graphe Lyon centre : 22 190 ways → **34 097 nœuds, 46 460 arêtes** ; JSON Overpass 10,3 Mo brut / **1,7 Mo gzip**. **Depuis WebKit (réel)** : téléchargement Overpass **32,5 s** (overpass-api.de, 13,9 Mo non compressés, 1 partie), construction du graphe 181 ms, altitudes Terrarium (18 tuiles AWS) 1,24 s, soit **35 s au total** pour la zone complète au premier chargement ; ensuite cache IndexedDB. Lors d'une première tentative (16 h 10 UTC) les 4 miroirs ont renvoyé 500/502/504 pendant 7 min : Overpass est le point fragile, d'où le cache et la **copie réelle embarquée** dans le site (chargée en 0,5 s + 1,1 s d'altitudes dans WebKit).
- Node.js : parse 25 ms, construction 164 ms, altitudes Terrarium 78 ms, A* Bellecour → Croix‑Rousse **4 ms**, A/R même chemin 113 ms, A/R retour différent 201 ms, 5 boucles 257 ms, variantes 33 ms.
- **WebKit iPhone 13 simulé (GitHub Actions, graphe réel)** : routage A* **9–39 ms**, A/R même chemin 0,5 s, A/R retour différent 0,3–0,55 s, boucle (5 candidats) 0,4–0,9 s, 4 variantes 0,24–0,58 s (temps mur, rendu compris) ; chargement complet hors ligne 2,3 s. Chromium : valeurs du même ordre (0,6–0,8 s). Un iPhone récent est 2–3× plus lent qu'un runner x86 : tout générateur reste sous ~3 s, le routage sous 100 ms.
- **Verdict : le routage navigateur suffit, pas besoin de serveur.** Aucun quota : seules les API publiques Overpass (pour la zone, une fois) et IGN alti (par tracé, ~6 requêtes) sont sollicitées. Risque restant : la disponibilité d'Overpass (d'où le cache + la copie embarquée ; pour l'app native, prévoir un extrait OSM pré‑construit par zone, régénéré par un job périodique comme `fetch-data`).

### Conclusion — **GO pour l'app native**, avec ces ajustements

À garder : graphe piéton OSM compacté en mémoire, A*/Dijkstra maison avec coût paramétrable, classification à seuils, détection de montées sur profil lissé, générateurs A/R / boucles / variantes par pénalisation d'arêtes, import/export GPX, cas de test JSON (`expected/lyon-reference-routes.json`) rejouables en Swift.

Ce qui change :
1. Source d'altitude principale = **IGN RGE ALTI** (API par tracé + cache par nœud téléchargé avec la zone), Terrarium en repli hors ligne.
2. `step_count` = vérité terrain ; l'estimation par D+ n'est qu'un ordre de grandeur (ou calibrer sur 0,10 m par marche de MNT, ce qui reste à ±70 %).
3. « Rechercher les escaliers » doit devenir un **objectif de génération** (maximiser marches / D+ sous contrainte de distance), pas seulement un facteur de coût.
4. Données par zone pré‑construites (extrait Overpass + altitudes IGN par nœud, ~3 Mo gzip pour Lyon centre) distribuées avec l'app ou téléchargées une fois, pour ne pas dépendre d'Overpass en direct.

Risques restants : fraîcheur et exhaustivité d'OSM hors centre (couverture `step_count` probablement plus faible en périphérie) ; comportement GPS d'arrière‑plan non testé (PWA) ; disponibilité d'Overpass ; les miroirs publics bloquent parfois les runners CI (429), ce qui peut aussi arriver sur réseau mobile partagé.

## Preuves et procédure pour refaire les mesures

### Mesures navigateur (Playwright)

#### Fixture Lyon réelle, hors ligne — `lyon-iphone-chromium.json` (projet iphone-chromium)
- Chargement complet 2.27 s (téléchargement simulé 924 ms, construction 150 ms, altitudes 523 ms) ; 34097 nœuds, 46460 arêtes, 1055 ways escaliers.
- R2 Bellecour → Fourvière : avoid = 1948 m, D+ 145 m, 19 marches, A* 18 ms ; tolerate = 1462 m, D+ 147 m, 829 marches, A* 5 ms ; prefer = 1462 m, D+ 147 m, 829 marches, A* 15 ms
- Tracés de référence : gourguillon = 1028 m, D+ 128 m, 810 marches, 1 montée(s) ; saint-barthelemy = 743 m, D+ 113 m, 1362 marches, 1 montée(s) ; grande-cote = 962 m, D+ 68 m, 218 marches, 1 montée(s) ; quais-pont = 673 m, D+ 36 m, 23 marches, 2 montée(s)
- Générateurs (temps mur) : ar-same = 604 ms, ar-diff = 729 ms, loop = 836 ms, variants = 791 ms, variantsCount = 4

#### Fixture Lyon réelle, hors ligne — `lyon-iphone-webkit.json` (projet iphone-webkit)
- Chargement complet 2.27 s (téléchargement simulé 963 ms, construction 148 ms, altitudes 551 ms) ; 34097 nœuds, 46460 arêtes, 1055 ways escaliers.
- R2 Bellecour → Fourvière : avoid = 1948 m, D+ 145 m, 19 marches, A* 39 ms ; tolerate = 1462 m, D+ 147 m, 829 marches, A* 9 ms ; prefer = 1462 m, D+ 147 m, 829 marches, A* 9 ms
- Tracés de référence : gourguillon = 1028 m, D+ 128 m, 810 marches, 1 montée(s) ; saint-barthelemy = 743 m, D+ 113 m, 1362 marches, 1 montée(s) ; grande-cote = 962 m, D+ 68 m, 218 marches, 1 montée(s) ; quais-pont = 673 m, D+ 36 m, 23 marches, 2 montée(s)
- Générateurs (temps mur) : ar-same = 523 ms, ar-diff = 314 ms, loop = 385 ms, variants = 579 ms, variantsCount = 4

#### Réseau réel depuis WebKit (iPhone 13 simulé, GitHub Actions) — `real-network.json`, 2026-11-01T16:46:12.285Z
- User-Agent : `Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6 Mobile/15E148 Safari/604.1`
- Fond de carte au chargement : **ign** (IGN Plan v2 = succès sans clé).
- Overpass depuis le navigateur : **OK** en 34.72 s
- Graphe (Overpass) : 34097 nœuds, 46460 arêtes, 1141 arêtes escaliers ; chargement 32.53 s (13.9 Mo), construction 181 ms, altitudes Terrarium 1.24 s ; anomalies : {"bridge":267,"tunnel":381,"jumps":187,"corrected":130}
- R2 Bellecour → Fourvière (altitudes Terrarium) : tolerate = 1462 m, D+ 147 m, 829 marches, A* 23 ms ; avoid = 1948 m, D+ 145 m, 19 marches, A* 12 ms ; prefer = 1462 m, D+ 147 m, 829 marches, A* 22 ms
- Altitudes du tracé par API (CORS réel) : ign : OK, D+ 136 m / D− 13 m, 0 points manquants ; open-meteo : OK, D+ 155 m / D− 35 m, 0 points manquants
- Points de référence (Labo) :

```
Point	Réf.	Terrarium	IGN	Open-Meteo
Esplanade de Fourvière	287	298.2	291.7	293.0
Place Bellecour	168	173.6	168.1	168.0
Place de la Croix-Rousse	250	254.6	250.4	254.0
Place des Terreaux	170	183.8	169.6	177.0
Quai Saint-Antoine	166	159.2	167.2	161.0
Place Saint-Jean	170	179.0	168.7	176.0
Tête d'Or (lac)	170	180.4	167.5	180.0
Pont Bonaparte (tablier)	172	160.0	162.1	161.0

terrarium : 0 ms — OK (CORS accepté)
ign : 425 ms — OK (CORS accepté)
open-meteo : 68 ms — OK (CORS accepté)
```
- Générateurs (temps mur, interface comprise) : ar-same = 503 ms, ar-diff = 552 ms, loop = 873 ms, variants = 243 ms, variantsCount = 4
- Réponses HTTP par hôte (ok / erreurs, CORS) :
  - localhost : 4 ok, 0 erreurs, ACAO=http://localhost:4173
  -  : 1 ok, 0 erreurs
  - data.geopf.fr : 23 ok, 0 erreurs, ACAO=*
  - overpass-api.de : 1 ok, 0 erreurs, ACAO=*
  - s3.amazonaws.com : 18 ok, 0 erreurs, ACAO=*
  - api.open-meteo.com : 3 ok, 0 erreurs, ACAO=*
- Erreurs console : **aucune**

### Captures
- [lyon-01-stairs-fourviere.png](docs/screenshots/lyon-01-stairs-fourviere.png)
- [lyon-02-r2-avoid.png](docs/screenshots/lyon-02-r2-avoid.png)
- [lyon-02-r2-prefer.png](docs/screenshots/lyon-02-r2-prefer.png)
- [lyon-02-r2-tolerate.png](docs/screenshots/lyon-02-r2-tolerate.png)
- [lyon-03-gourguillon.png](docs/screenshots/lyon-03-gourguillon.png)
- [lyon-03-grande-cote.png](docs/screenshots/lyon-03-grande-cote.png)
- [lyon-03-quais-pont.png](docs/screenshots/lyon-03-quais-pont.png)
- [lyon-03-saint-barthelemy.png](docs/screenshots/lyon-03-saint-barthelemy.png)
- [lyon-04-gen-ar-diff.png](docs/screenshots/lyon-04-gen-ar-diff.png)
- [lyon-04-gen-ar-same.png](docs/screenshots/lyon-04-gen-ar-same.png)
- [lyon-04-gen-loop.png](docs/screenshots/lyon-04-gen-loop.png)
- [lyon-05-variants.png](docs/screenshots/lyon-05-variants.png)
- [real-01-basemap.png](docs/screenshots/real-01-basemap.png)
- [real-02-graph.png](docs/screenshots/real-02-graph.png)
- [real-02b-graph-embedded.png](docs/screenshots/real-02b-graph-embedded.png)
- [real-03-bellecour-fourviere-avoid.png](docs/screenshots/real-03-bellecour-fourviere-avoid.png)
- [real-03-bellecour-fourviere-prefer.png](docs/screenshots/real-03-bellecour-fourviere-prefer.png)
- [real-03-bellecour-fourviere-tolerate.png](docs/screenshots/real-03-bellecour-fourviere-tolerate.png)
- [real-04-elevation-sources.png](docs/screenshots/real-04-elevation-sources.png)
- [real-05-generated.png](docs/screenshots/real-05-generated.png)

### Refaire les mesures

1. **Données réelles** : GitHub → Actions → `fetch-data` → Run workflow (ou toucher `scripts/fetch-fixtures.mjs`). Commits dans `fixtures/`.
2. **Chiffres du rapport** : `npx vite-node scripts/report-data.mts` puis `node scripts/assemble-report.mjs` (sorties : `docs/report-tables.md`, `docs/report-data.json`, `expected/lyon-reference-routes.json`, `REPORT.md`).
3. **Mesures navigateur réelles** : Actions → `validate-real` → Run workflow ; résultats commités dans `docs/e2e-results/` et `docs/screenshots/`.
4. **Localement** : `npm run build && REAL_NETWORK=1 npx playwright test e2e/real-network.spec.ts` (nécessite WebKit : `npx playwright install webkit`).

