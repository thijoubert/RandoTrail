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
| Bellecour → Fourvière | avoid | 1948 m | 134 m | 1 | 19 | — | 23 ms |
| Bellecour → Fourvière | tolerate | 1462 m | 133 m | 10 | 821 (dont 64 est.) | Montée des Chazeaux, Montée Cardinal Louis-Marie Billé, Chemin du Rosaire | 6 ms |
| Bellecour → Fourvière | prefer | 1462 m | 133 m | 10 | 821 (dont 64 est.) | Montée des Chazeaux, Montée Cardinal Louis-Marie Billé, Chemin du Rosaire | 12 ms |
| Terreaux → Croix-Rousse | avoid | 1105 m | 81 m | 0 | 0 | — | 5 ms |
| Terreaux → Croix-Rousse | tolerate | 962 m | 82 m | 10 | 722 | Rue Sainte-Marie des Terreaux, Montée de la Grande Côte | 2 ms |
| Terreaux → Croix-Rousse | prefer | 962 m | 82 m | 10 | 722 | Rue Sainte-Marie des Terreaux, Montée de la Grande Côte | 5 ms |
| Saint-Paul → Fourvière | avoid | 1263 m | 121 m | 0 | 0 | — | 2 ms |
| Saint-Paul → Fourvière | tolerate | 743 m | 119 m | 3 | 1362 | Montée des Carmes Déchaussés, Montée Nicolas de Lange | 0 ms |
| Saint-Paul → Fourvière | prefer | 743 m | 119 m | 3 | 1362 | Montée des Carmes Déchaussés, Montée Nicolas de Lange | 1 ms |
| Quai Saint-Antoine → Croix-Rousse | avoid | 1676 m | 84 m | 0 | 0 | — | 3 ms |
| Quai Saint-Antoine → Croix-Rousse | tolerate | 1563 m | 84 m | 9 | 679 | Montée de la Grande Côte | 3 ms |
| Quai Saint-Antoine → Croix-Rousse | prefer | 1563 m | 84 m | 9 | 679 | Montée de la Grande Côte | 7 ms |
| Bellecour → Fourvière, escaliers évités | pentes : neutral | 1948 m | 134 m | — | — | raide+très raide : 510 m, pente max 23 % | — |
| Bellecour → Fourvière, escaliers évités | pentes : limit (8 %) | 2205 m | 134 m | — | — | raide+très raide : 460 m, pente max 16 % | — |
| Bellecour → Fourvière, escaliers évités | pentes : seek | 1948 m | 134 m | — | — | raide+très raide : 510 m, pente max 23 % | — |

## R3 — Fiabilité des altitudes

Sur **tous** les sommets du graphe (121713) : Terrarium − IGN : biais 5.66 m, erreur abs. moyenne 6.83 m, RMSE 8.23 m, P90 12.9 m, max 56.7 m.

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

### Sondes réseau (depuis GitHub Actions, 2026-11-01T16:06:54.511Z)

| Service | HTTP | Type | Octets | CORS (`Access-Control-Allow-Origin`) | Temps |
|---|---|---|---|---|---|
| ign-wmts-planignv2 | 200 | image/png | 17654 | * | 943 ms |
| ign-wmts-ortho | 200 | image/jpeg | 7779 | * | 418 ms |
| ign-wmts-capabilities | 200 | application/xml | 3080569 | * | 430 ms |
| opentopomap | 200 | image/png | 8014 | * | 449 ms |
| terrarium-aws | 200 | image/png | 60845 | — | 244 ms |
| ign-alti-get | 200 | application/json | 24 | * | 203 ms |
| open-meteo | 200 | application/json | 21 | — | 188 ms |
| opentopodata-srtm30m | 200 | application/json | 181 | — | 496 ms |
| overpass-status https://overpass-api.de | 0 (This operation was aborted) | — | — | — | 30002 ms |
| overpass-status https://overpass.kumi.systems | 0 (This operation was aborted) | — | — | — | 30001 ms |
| overpass-status https://overpass.private.coffee | 0 (This operation was aborted) | — | — | — | 30000 ms |
| overpass-status https://maps.mail.ru/osm/tools/overpass | 200 | text/plain; charset=utf-8 | 168 | * | 13977 ms |

## R4 — Performance du routage navigateur (mesures Node.js ; mesures navigateur dans le rapport)
| Mesure | Valeur |
|---|---|
| JSON Overpass (zone 4,2 × 4,4 km) | 10.30 Mo brut, **1.69 Mo gzip** (22190 ways) |
| Graphe | 34097 nœuds, 46460 arêtes |
| Parse JSON → ways | 25 ms |
| Construction du graphe | 164 ms |
| Altitudes Terrarium (décodage + échantillonnage 121829 sommets) | 78 ms |
| A* Bellecour → Croix-Rousse | 4 ms |
| A/R même chemin (6 km, 250 m D+) | 113 ms |
| A/R retour différent | 201 ms |
| Boucles (5 résultats) | 257 ms |
| Variantes (3 résultats) | 33 ms |

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
