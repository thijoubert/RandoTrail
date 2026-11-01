import type { BBox } from '../core/geo';

export interface ZonePreset {
  id: string;
  label: string;
  bbox: BBox;
  /** Map centre and zoom when selected. */
  center: [number, number];
  zoom: number;
}

export const ZONES: ZonePreset[] = [
  { id: 'lyon-centre', label: 'Lyon centre (1er, 4e, 5e, Croix-Rousse, Fourvière, quais)', bbox: { south: 45.746, west: 4.796, north: 45.786, east: 4.85 }, center: [4.825, 45.766], zoom: 13.6 },
  { id: 'fourviere', label: 'Fourvière / Vieux Lyon (petit)', bbox: { south: 45.755, west: 4.812, north: 45.772, east: 4.836 }, center: [4.824, 45.7635], zoom: 14.6 },
  { id: 'croix-rousse', label: 'Croix-Rousse / pentes', bbox: { south: 45.765, west: 4.822, north: 45.782, east: 4.845 }, center: [4.833, 45.7735], zoom: 14.6 },
  { id: 'tete-dor', label: "Parc de la Tête d'Or (plat)", bbox: { south: 45.77, west: 4.846, north: 45.788, east: 4.87 }, center: [4.858, 45.779], zoom: 14.4 },
];

/** Embedded real data of the repository (fetched by GitHub Actions). */
export const EMBEDDED_ZONE_ID = 'lyon-centre';
