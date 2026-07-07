import type { SoapPropertyName } from './properties.js';

/** Optional inner band for a balanced general-purpose CP bar — formulation hint, not a pass/fail rule. */
export const FORMULATION_PREFERENCE_GUIDE: Partial<
  Record<SoapPropertyName, { low: number; high: number }>
> = {
  hardness: { low: 45, high: 55 },
  cleansing: { low: 10, high: 14 },
  condition: { low: 50, high: 60 },
  bubbly: { low: 20, high: 35 },
  creamy: { low: 30, high: 50 },
};

export const IODINE_GUIDE = { low: 41, high: 70 } as const;
export const INS_GUIDE = { low: 136, high: 165, ideal: 160 } as const;

/** Fatty-acid % bands for general-purpose bath bars (community formulation practice). */
export const FORMULATION_FATTY_ACID_GUIDE = {
  lauricMyristic: { low: 20, high: 30, label: 'Lauric + myristic' },
  palmiticStearic: { low: 20, high: 30, label: 'Palmitic + stearic' },
  oleic: { low: 32, high: 41, label: 'Oleic' },
  linoleic: { low: 7, high: 14, label: 'Linoleic' },
  linolenic: { low: 0, high: 1, label: 'Linolenic' },
  ricinoleic: { low: 4, high: 7, label: 'Ricinoleic' },
} as const;
