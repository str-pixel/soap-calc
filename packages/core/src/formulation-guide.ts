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
  lauricMyristic: { low: 20, high: 30, label: 'Lauric + myristic (+C8–C10)' },
  palmiticStearic: { low: 20, high: 30, label: 'Palmitic + stearic' },
  oleic: { low: 32, high: 41, label: 'Oleic' },
  linoleic: { low: 7, high: 14, label: 'Linoleic' },
  linolenic: { low: 0, high: 1, label: 'Linolenic' },
  ricinoleic: { low: 4, high: 7, label: 'Ricinoleic' },
  // Catch-all bars for acids without a primary bar — long-chain saturates (behenic C22:0,
  // arachidic C20:0) and the other unsaturates (palmitoleic C16:1 plus the C20–C22 MUFAs/PUFAs
  // eicosenoic/erucic/docosenoic/docosadienoic). ~0% in ordinary bath oils, so "typical 0–2%" is
  // honest; specialty oils (macadamia/sea-buckthorn palmitoleic, meadowfoam, high-erucic broccoli)
  // read as out-of-band (correctly flagged unusual) instead of silently inflating a primary bar.
  otherSaturated: { low: 0, high: 2, label: 'Other saturated' },
  otherUnsaturated: { low: 0, high: 2, label: 'Other unsaturated' },
} as const;

/**
 * Single source of truth for the fatty-acid panel's bars: each group maps a
 * {@link FORMULATION_FATTY_ACID_GUIDE} band to the acids summed into that bar. The acid lists
 * exactly partition every acid the Saturated/Unsaturated ratio counts (enforced both ways by the
 * display-groups test), so the bars always reconcile with the shown totals — no acid renders as
 * hidden weight, and none double-counts. Primary bars stay pure (oleic is oleic only, palmitic+
 * stearic is those two only) so their bands and labels stay accurate; every other tracked acid
 * lands in the honest otherSaturated/otherUnsaturated catch-alls.
 */
export const FATTY_ACID_DISPLAY_GROUPS = [
  { key: 'lauricMyristic', acids: ['lauric', 'myristic', 'caprylic', 'capric'] },
  { key: 'palmiticStearic', acids: ['palmitic', 'stearic'] },
  { key: 'oleic', acids: ['oleic'] },
  { key: 'linoleic', acids: ['linoleic'] },
  { key: 'linolenic', acids: ['linolenic'] },
  { key: 'ricinoleic', acids: ['ricinoleic'] },
  { key: 'otherSaturated', acids: ['behenic', 'arachidic'] },
  {
    key: 'otherUnsaturated',
    acids: ['palmitoleic', 'eicosenoic', 'docosenoic', 'docosadienoic', 'erucic'],
  },
] as const satisfies ReadonlyArray<{
  key: keyof typeof FORMULATION_FATTY_ACID_GUIDE;
  acids: readonly string[];
}>;
