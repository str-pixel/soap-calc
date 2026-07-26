/** Advisory flags for alternative split liquids: what in the liquid interacts with the
 * lye reaction or the finished bar. 'acid' liquids consume lye and carry the neutralization
 * factors to compensate automatically. */
export type AlternativeLiquidFlag = 'sugars' | 'alcohol' | 'acid';

export type AlternativeLiquidPreset = {
  key: string;
  label: string;
  /** Fraction of the liquid that is actually water (USDA-derived, by difference where the
   * record lists only macros). Only this fraction dissolves lye — the rest is fat, sugar,
   * protein, and solids. Matters when the liquid goes into the lye solution. */
  waterFraction: number;
  flags: AlternativeLiquidFlag[];
  /** Short advisory shown alongside the preset. */
  note?: string;
  /** For acid liquids: grams of PURE alkali consumed per gram of liquid. The calc grosses
   * these up by the recipe's lye purity, like every other lye figure. */
  lyeNeutralization?: { naohPerGram: number; kohPerGram: number };
};

const SUGAR_NOTE = 'Sugars can accelerate trace and darken the bar; keep the lye cool.';

/** Commercial vinegar is a 5% acetic-acid solution; moles of acid per gram of vinegar. */
const ACETIC_MOL_PER_GRAM_VINEGAR = 0.05 / 60.052;

/** Common alternative liquids for split-liquid recipes. Water fractions are typical
 * composition values, not brand-specific; treat them as planning numbers. */
const ALCOHOL_NOTE = 'Simmer off the alcohol before use, then treat like a sugary liquid.';

export const ALTERNATIVE_LIQUID_GUIDE: readonly AlternativeLiquidPreset[] = [
  { key: 'aloe-juice', label: 'Aloe juice', waterFraction: 0.99, flags: [] },
  { key: 'coffee-tea', label: 'Coffee or tea (brewed)', waterFraction: 0.99, flags: [] },
  {
    key: 'coconut-water',
    label: 'Coconut water',
    waterFraction: 0.95,
    flags: ['sugars'],
    note: SUGAR_NOTE,
  },
  {
    key: 'fruit-juice',
    label: 'Fruit juice',
    waterFraction: 0.88,
    flags: ['sugars'],
    note: SUGAR_NOTE,
  },
  {
    key: 'milk',
    label: 'Milk (dairy or plant)',
    waterFraction: 0.87,
    flags: ['sugars'],
    note: SUGAR_NOTE,
  },
  {
    key: 'buttermilk',
    label: 'Buttermilk',
    waterFraction: 0.9,
    flags: ['sugars'],
    note: SUGAR_NOTE,
  },
  {
    key: 'yogurt',
    label: 'Yogurt (plain)',
    waterFraction: 0.88,
    flags: ['sugars'],
    note: SUGAR_NOTE,
  },
  {
    key: 'yogurt-greek',
    label: 'Greek yogurt',
    waterFraction: 0.81,
    flags: ['sugars'],
    note: SUGAR_NOTE,
  },
  {
    key: 'heavy-cream',
    label: 'Heavy cream',
    waterFraction: 0.58,
    flags: ['sugars'],
    note: 'Mostly fat — barely over half is water. ' + SUGAR_NOTE,
  },
  {
    key: 'coconut-milk-canned',
    label: 'Coconut milk (canned)',
    waterFraction: 0.68,
    flags: ['sugars'],
    note: 'Mostly fat — only about two thirds is water. ' + SUGAR_NOTE,
  },
  {
    key: 'puree',
    label: 'Fruit or vegetable puree',
    waterFraction: 0.85,
    flags: ['sugars'],
    note: SUGAR_NOTE,
  },
  {
    key: 'beer',
    label: 'Beer',
    waterFraction: 0.92,
    flags: ['sugars', 'alcohol'],
    note: ALCOHOL_NOTE,
  },
  {
    key: 'wine',
    label: 'Wine',
    waterFraction: 0.87,
    flags: ['sugars', 'alcohol'],
    note: ALCOHOL_NOTE,
  },
  {
    key: 'vinegar',
    label: 'Vinegar (5%)',
    waterFraction: 0.95,
    flags: ['acid'],
    note:
      'Acetic acid consumes lye (forming sodium acetate, a bar hardener) — the extra lye is added to the recipe automatically.',
    lyeNeutralization: {
      naohPerGram: ACETIC_MOL_PER_GRAM_VINEGAR * 39.997,
      kohPerGram: ACETIC_MOL_PER_GRAM_VINEGAR * 56.105,
    },
  },
];

export function alternativeLiquidPreset(key: string): AlternativeLiquidPreset | null {
  return ALTERNATIVE_LIQUID_GUIDE.find((preset) => preset.key === key) ?? null;
}

export type ExtraLyeForAcid = { naohGrams: number; kohGrams: number };

/** As-weighed extra lye needed to offset an acid liquid, split across the recipe's alkalis
 * (dual lye allocates the acid by the KOH blend share) and grossed up by each purity —
 * matching how the lye calc reports every other lye figure. Zero for non-acid liquids. */
export function extraLyeForAcidLiquid(
  preset: AlternativeLiquidPreset,
  liquidGrams: number,
  recipe: {
    lyeType: 'naoh' | 'koh' | 'dual';
    kohBlendPercent: number;
    naohPurityPercent: number;
    kohPurityPercent: number;
  },
): ExtraLyeForAcid {
  const factors = preset.lyeNeutralization;
  if (!factors || !Number.isFinite(liquidGrams) || liquidGrams <= 0) {
    return { naohGrams: 0, kohGrams: 0 };
  }
  const naohPurity = recipe.naohPurityPercent > 0 ? recipe.naohPurityPercent / 100 : 1;
  const kohPurity = recipe.kohPurityPercent > 0 ? recipe.kohPurityPercent / 100 : 1;
  const kohShare =
    recipe.lyeType === 'koh'
      ? 1
      : recipe.lyeType === 'dual'
        ? Math.min(100, Math.max(0, recipe.kohBlendPercent)) / 100
        : 0;
  const naohGrams = (liquidGrams * (1 - kohShare) * factors.naohPerGram) / naohPurity;
  const kohGrams = (liquidGrams * kohShare * factors.kohPerGram) / kohPurity;
  return { naohGrams, kohGrams };
}
