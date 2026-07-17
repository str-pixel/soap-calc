export type AdditiveStage = 'lye' | 'oils' | 'trace' | 'top' | 'after_cook';

export type AdditiveCatalogEntry = {
  id: string;
  name: string;
  typicalLow: number;
  typicalHigh: number;
  defaultStage: AdditiveStage;
};

export const ADDITIVE_CATALOG: readonly AdditiveCatalogEntry[] = [
  {
    id: 'sugar-sorbitol',
    name: 'Sugar / sorbitol',
    typicalLow: 1,
    typicalHigh: 5,
    defaultStage: 'trace',
  },
  {
    id: 'chelator',
    name: 'Chelator (citrate, gluconate)',
    typicalLow: 1,
    typicalHigh: 1,
    defaultStage: 'lye',
  },
  {
    id: 'cetyl-alcohol',
    name: 'Cetyl alcohol',
    typicalLow: 1,
    typicalHigh: 3,
    defaultStage: 'trace',
  },
  {
    id: 'charcoal',
    name: 'Charcoal',
    typicalLow: 0.1,
    typicalHigh: 2,
    defaultStage: 'oils',
  },
  {
    id: 'oatmeal',
    name: 'Oatmeal',
    typicalLow: 0.1,
    typicalHigh: 4,
    defaultStage: 'trace',
  },
  {
    id: 'honey',
    name: 'Honey',
    typicalLow: 1,
    typicalHigh: 1,
    defaultStage: 'trace',
  },
  {
    id: 'fragrance',
    name: 'Fragrance / essential oil',
    typicalLow: 2,
    typicalHigh: 6,
    defaultStage: 'trace',
  },
  {
    id: 'jojoba',
    name: 'Jojoba oil',
    typicalLow: 5,
    typicalHigh: 10,
    defaultStage: 'trace',
  },
  {
    id: 'clay',
    name: 'Clay (bentonite, kaolin)',
    typicalLow: 0.5,
    typicalHigh: 2,
    defaultStage: 'oils',
  },
  {
    // Table salt (NaCl) as a hardener, dissolved in the lye water. Kept low: past ~1%
    // of oil weight it starts to thicken/seize the batch rather than just harden it.
    // (id stays 'salt' so recipes saved before the rename/split still resolve.)
    id: 'salt',
    name: 'Table salt (NaCl)',
    typicalLow: 0.05,
    typicalHigh: 1,
    defaultStage: 'lye',
  },
  {
    // Sodium lactate — humectant + hardener, water-soluble, added to the lye water.
    // Higher dose range than table salt; it hardens the bar without the seize risk.
    id: 'sodium-lactate',
    name: 'Sodium lactate',
    typicalLow: 1,
    typicalHigh: 3,
    defaultStage: 'lye',
  },
] as const;

export const LATHER_SUPPORT_PACK = [
  { catalogId: 'sugar-sorbitol', percentOfOil: 1, stage: 'trace' as const },
  { catalogId: 'chelator', percentOfOil: 1, stage: 'lye' as const },
  { catalogId: 'cetyl-alcohol', percentOfOil: 1, stage: 'trace' as const },
] as const;

export function catalogEntryById(id: string): AdditiveCatalogEntry | undefined {
  return ADDITIVE_CATALOG.find((entry) => entry.id === id);
}

/** Grams from % of total oil weight. Returns null when percent is invalid.
 * Thin alias over gramsFromDose (percent unit) — single source of truth for the math.
 * Kept as a readable name for split-liquid / post-cook-superfat, which are always % of oil. */
export function gramsFromPercentOfOil(
  totalOilGrams: number,
  percentOfOil: number,
): number | null {
  return gramsFromDose(totalOilGrams, percentOfOil, 'percent');
}

/** Parse a %-of-oil string (0–100). Thin alias over parseDoseAmount (percent unit). */
export function parsePercentOfOil(value: string): number | null {
  return parseDoseAmount(value, 'percent');
}

export type DoseUnit = 'percent' | 'ppt';
export type DoseBasis = 'oil' | 'batch' | 'solution';

/** Validate a dose amount for its unit. Percent caps at 100, ppt at 1000 (both = 100% of basis).
 * Returns the numeric amount, or null when empty/negative/non-finite/over the ceiling. */
export function parseDoseAmount(value: string, unit: DoseUnit): number | null {
  if (value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  const ceiling = unit === 'ppt' ? 1000 : 100;
  if (n > ceiling) return null;
  return n;
}

/** Grams from a dose amount against a basis weight. percent = amount/100, ppt = amount/1000. */
export function gramsFromDose(
  basisWeightGrams: number,
  amount: number,
  unit: DoseUnit,
): number | null {
  if (!Number.isFinite(basisWeightGrams) || basisWeightGrams < 0) return null;
  if (!Number.isFinite(amount) || amount < 0) return null;
  const divisor = unit === 'ppt' ? 1000 : 100;
  return (basisWeightGrams * amount) / divisor;
}

export const ADDITIVE_STAGE_LABELS: Record<AdditiveStage, string> = {
  lye: 'In lye water',
  oils: 'With oils',
  trace: 'At trace',
  top: 'On top',
  after_cook: 'After cook',
};

export const MAX_RECIPE_ADDITIVES = 50;
export const MAX_ADDITIVE_NAME_LENGTH = 120;
