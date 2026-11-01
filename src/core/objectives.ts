/**
 * Distance / D+ / ratio objectives with tolerance, live gap and adjustment suggestions.
 */
import type { RouteAnalysis } from './analysis';

export interface Objectives {
  distanceM?: number;
  gainM?: number;
  /** D+ per km. */
  ratioMPerKm?: number;
  /** Tolerance as a fraction (0.1 = ±10 %). */
  tolerance: number;
}

export interface ObjectiveGap {
  key: 'distance' | 'gain' | 'ratio';
  label: string;
  unit: string;
  target: number;
  value: number;
  gap: number;
  gapPct: number;
  ok: boolean;
}

export interface ObjectiveReport {
  gaps: ObjectiveGap[];
  allOk: boolean;
  suggestions: string[];
}

export function evaluateObjectives(a: RouteAnalysis | null, o: Objectives): ObjectiveReport {
  const gaps: ObjectiveGap[] = [];
  const length = a?.length ?? 0;
  const gain = a?.gainLoss.gain ?? 0;
  const ratio = length > 0 ? gain / (length / 1000) : 0;
  const mk = (key: ObjectiveGap['key'], label: string, unit: string, target: number, value: number): ObjectiveGap => {
    const gap = value - target;
    const gapPct = target > 0 ? gap / target : 0;
    return { key, label, unit, target, value, gap, gapPct, ok: Math.abs(gapPct) <= o.tolerance };
  };
  if (o.distanceM && o.distanceM > 0) gaps.push(mk('distance', 'Distance', 'm', o.distanceM, length));
  if (o.gainM && o.gainM > 0) gaps.push(mk('gain', 'D+', 'm', o.gainM, gain));
  if (o.ratioMPerKm && o.ratioMPerKm > 0) gaps.push(mk('ratio', 'D+/km', 'm/km', o.ratioMPerKm, ratio));
  const suggestions: string[] = [];
  if (a && length > 0) {
    for (const g of gaps) {
      if (g.ok) continue;
      if (g.key === 'distance') {
        suggestions.push(g.gap < 0 ? `Prolongez le tracé de ${Math.round(-g.gap)} m (un aller-retour ou une boucle supplémentaire).` : `Raccourcissez le tracé de ${Math.round(g.gap)} m (variante « Plus court »).`);
      } else if (g.key === 'gain') {
        suggestions.push(g.gap < 0 ? `Il manque ${Math.round(-g.gap)} m de D+ : ajoutez une montée (ou répétez la montée principale ${Math.max(1, Math.ceil(-g.gap / Math.max(1, a.climbs[0]?.gain ?? 1)))} fois).` : `Trop de D+ (${Math.round(g.gap)} m) : variante « Pentes limitées » ou « Sans escaliers ».`);
      } else {
        suggestions.push(g.gap < 0 ? `Ratio trop faible : préférez les escaliers et les pentes (variante « Max escaliers »).` : `Ratio trop élevé : ajoutez du plat (quais) ou limitez les pentes.`);
      }
    }
  } else if (gaps.length > 0) {
    suggestions.push('Tracez un itinéraire ou générez une boucle pour comparer aux objectifs.');
  }
  return { gaps, allOk: gaps.length > 0 && gaps.every((g) => g.ok), suggestions };
}
