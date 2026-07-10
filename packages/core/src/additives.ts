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
    id: 'salt',
    name: 'Salt',
    typicalLow: 0.5,
    typicalHigh: 3,
    defaultStage: 'trace',
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

/** Grams from % of total oil weight. Returns null when percent is invalid. */
export function gramsFromPercentOfOil(
  totalOilGrams: number,
  percentOfOil: number,
): number | null {
  if (!Number.isFinite(totalOilGrams) || totalOilGrams < 0) return null;
  if (!Number.isFinite(percentOfOil) || percentOfOil < 0) return null;
  return (totalOilGrams * percentOfOil) / 100;
}

export function parsePercentOfOil(value: string): number | null {
  if (value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return n;
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
