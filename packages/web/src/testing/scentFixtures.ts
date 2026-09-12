import { applyScentColorCompliance, computeScentColorGrams, type ComputedScentColor } from '../lib/computeScentColor';
import type { ProcessId } from '../lib/process';
import { normalizeScentColor } from '../lib/scentColor';

export type ScentFixtureContext = {
  process: ProcessId;
  totalOilGrams: number;
  solutionGrams?: number;
  deliveredSuperfatPercent?: number | null;
  /** The finished-product mass the compliance pass divides by; null = unknown. */
  productGrams: number | null;
  productBasis?: 'label' | 'solution' | 'batch';
  /** Grams of product per gram put in (a pot-wide preservative); 1 when absent. */
  productPerGramOfContents?: number;
};

/** A saved-shape section, run through the same two passes the view model runs — so a test
 * exercises the real pipeline instead of restating it. */
export function computedScent(saved: unknown, ctx: ScentFixtureContext): ComputedScentColor {
  const grams = computeScentColorGrams(normalizeScentColor(saved), {
    process: ctx.process,
    totalOilGrams: ctx.totalOilGrams,
    solutionGrams: ctx.solutionGrams ?? 0,
    deliveredSuperfatPercent: ctx.deliveredSuperfatPercent ?? 5,
  });
  return applyScentColorCompliance(grams, {
    kind: ctx.productBasis ?? (ctx.process === 'ls' ? 'solution' : 'label'),
    grams: ctx.productGrams,
    perGramOfContents: ctx.productPerGramOfContents ?? 1,
  });
}

/** The canonical vanilla row: 3% fragrance oil, 12% vanillin (deep browning, 1:1 stabilizer).
 * The `allergens` list is the pre-v7 shape, kept so the fixture proves the loader drops it. */
export const VANILLA_FRAGRANCE = {
  name: 'Vanilla dream', percent: '3', vanillinPercent: '12',
  allergens: [{ name: 'Linalool', percentOfFragrance: '12' }],
};
