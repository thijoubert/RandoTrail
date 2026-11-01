/**
 * Deterministic synthetic town for unit tests: a 5x5 street grid (100 m spacing) on a hill,
 * plus a stairs shortcut, a bridge over a "river" dip and a tunnel.
 *
 * Elevation model: hill centred on the north-west corner, ele = 170 + 60 * exp(-(d/350)^2), plus a river
 * trench (ele - 25) along column x=3 that the bridge crosses.
 */
import type { OverpassJson, OverpassElement } from '../../src/core/osm';
import { graphFromOverpass } from '../../src/core/osm';
import type { Graph } from '../../src/core/graph';
import { assignElevations, graphVertices, correctAnomalies } from '../../src/core/elevation';
import type { LngLat } from '../../src/core/geo';

export const ORIGIN = { lng: 4.8, lat: 45.76 };
const DLNG = 100 / (111320 * Math.cos((45.76 * Math.PI) / 180)); // ~100 m in degrees of longitude
const DLAT = 100 / 111320;

export function gridPoint(x: number, y: number): LngLat {
  return { lng: ORIGIN.lng + x * DLNG, lat: ORIGIN.lat + y * DLAT };
}

export function nodeId(x: number, y: number): number {
  return 1000 + y * 100 + x;
}

/** Hill elevation function (metres). */
export function hillEle(p: LngLat, opts: { trench?: boolean } = { trench: true }): number {
  const dx = ((p.lng - ORIGIN.lng) / DLNG) * 100; // metres east
  const dy = ((p.lat - ORIGIN.lat) / DLAT) * 100; // metres north
  const d = Math.hypot(dx, dy - 400);
  let ele = 170 + 60 * Math.exp(-((d / 350) ** 2));
  if (opts.trench && Math.abs(dx - 300) < 20 && dy > 50 && dy < 350) ele -= 25;
  return ele;
}

export function syntheticOverpass(): OverpassJson {
  const elements: OverpassElement[] = [];
  let wayId = 1;
  const way = (ids: number[], coords: LngLat[], tags: Record<string, string>): void => {
    elements.push({ type: 'way', id: wayId++, nodes: ids, geometry: coords.map((c) => ({ lat: c.lat, lon: c.lng })), tags });
  };
  // Horizontal streets y = 0..4 (west-east), vertical streets x = 0..4 (south-north).
  for (let y = 0; y <= 4; y++) {
    const ids: number[] = [];
    const coords: LngLat[] = [];
    for (let x = 0; x <= 4; x++) {
      ids.push(nodeId(x, y));
      coords.push(gridPoint(x, y));
    }
    // Street y=2 crosses the trench on a bridge between x=2 and x=4 (its own way).
    if (y === 2) {
      way(ids.slice(0, 3), coords.slice(0, 3), { highway: 'residential', name: 'Rue du Milieu' });
      // bridge with an intermediate vertex in the trench
      const mid = { lng: ORIGIN.lng + 3 * DLNG, lat: ORIGIN.lat + 2 * DLAT };
      way([nodeId(2, 2), 9002, nodeId(4, 2)], [coords[2]!, mid, coords[4]!], { highway: 'residential', name: 'Pont du Milieu', bridge: 'yes', layer: '1' });
    } else if (y === 0) {
      way(ids, coords, { highway: 'primary', name: 'Boulevard du Sud' });
    } else {
      way(ids, coords, { highway: 'residential', name: `Rue ${y}` });
    }
  }
  for (let x = 0; x <= 4; x++) {
    const ids: number[] = [];
    const coords: LngLat[] = [];
    for (let y = 0; y <= 4; y++) {
      ids.push(nodeId(x, y));
      coords.push(gridPoint(x, y));
    }
    if (x === 3) {
      // The trench street is a footway in a tunnel between y=1 and y=3.
      way(ids.slice(0, 2), coords.slice(0, 2), { highway: 'residential', name: 'Rue de la Tranchée' });
      way([nodeId(3, 1), 9003, nodeId(3, 3)], [coords[1]!, { lng: coords[2]!.lng, lat: coords[2]!.lat }, coords[3]!], { highway: 'footway', tunnel: 'yes', name: 'Tunnel de la Tranchée' });
      way(ids.slice(3), coords.slice(3), { highway: 'residential', name: 'Rue de la Tranchée' });
    } else {
      way(ids, coords, { highway: 'residential', name: `Avenue ${x}` });
    }
  }
  // Stairs shortcut: from (1,1) straight to (0,3) — much shorter than following the streets.
  way([nodeId(1, 1), 9001, nodeId(0, 3)], [gridPoint(1, 1), gridPoint(0.5, 2), gridPoint(0, 3)], {
    highway: 'steps',
    name: 'Escalier de la Colline',
    step_count: '120',
    incline: 'up',
    handrail: 'yes',
    surface: 'concrete',
  });
  // A winding street with an intermediate vertex (3 points) for anomaly tests.
  way([nodeId(4, 1), 9006, nodeId(4, 2)], [gridPoint(4, 1), gridPoint(4.3, 1.5), gridPoint(4, 2)], { highway: 'residential', name: 'Chemin du Détour' });
  // A second stairs without step_count, between (2,3) and (2,4) parallel to Avenue 2 (slightly offset).
  way([nodeId(2, 3), 9004, 9005], [gridPoint(2, 3), gridPoint(2.2, 3.5), gridPoint(2.2, 4)], { highway: 'steps', name: 'Escalier Sans Compte' });
  way([9005, nodeId(2, 4)], [gridPoint(2.2, 4), gridPoint(2, 4)], { highway: 'footway' });
  return { elements };
}

export function syntheticGraph(opts: { elevations?: boolean; correct?: boolean } = { elevations: true, correct: true }): Graph {
  const g = graphFromOverpass(syntheticOverpass(), { maxEdgeLength: 1000 });
  if (opts.elevations !== false) {
    const eles = graphVertices(g).map((p) => hillEle(p));
    assignElevations(g, eles);
    if (opts.correct !== false) correctAnomalies(g);
  }
  return g;
}
