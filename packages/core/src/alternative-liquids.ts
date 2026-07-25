/** Advisory flags for alternative split liquids: what in the liquid interacts with the
 * lye reaction or the finished bar (process risk, not lye math — acids are the exception
 * and are intentionally not in this guide until lye compensation ships with them). */
export type AlternativeLiquidFlag = 'sugars' | 'alcohol';

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
};

const SUGAR_NOTE = 'Sugars can accelerate trace and darken the bar; keep the lye cool.';

/** Common alternative liquids for split-liquid recipes. Water fractions are typical
 * composition values, not brand-specific; treat them as planning numbers. */
export const ALTERNATIVE_LIQUID_GUIDE: readonly AlternativeLiquidPreset[] = [
  { key: 'aloe-juice', label: 'Aloe juice', waterFraction: 0.99, flags: [] },
  { key: 'coffee-tea', label: 'Coffee or tea (brewed)', waterFraction: 0.99, flags: [] },
  {
    key: 'milk',
    label: 'Milk (dairy or plant)',
    waterFraction: 0.87,
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
    key: 'beer-wine',
    label: 'Beer or wine',
    waterFraction: 0.9,
    flags: ['sugars', 'alcohol'],
    note: 'Simmer off the alcohol before use, then treat like a sugary liquid.',
  },
];

export function alternativeLiquidPreset(key: string): AlternativeLiquidPreset | null {
  return ALTERNATIVE_LIQUID_GUIDE.find((preset) => preset.key === key) ?? null;
}
