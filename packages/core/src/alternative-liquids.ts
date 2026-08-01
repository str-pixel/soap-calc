import type { AdditiveProcess } from './additives.js';
import {
  ACETIC_ACID_MOLAR_MASS,
  KOH_MOLAR_MASS,
  NAOH_MOLAR_MASS,
} from './molar-masses.js';

/** Advisory flags for alternative split liquids: what in the liquid interacts with the
 * lye reaction or the finished bar. 'acid' liquids consume lye and carry the neutralization
 * factors to compensate automatically. */
export type AlternativeLiquidFlag = 'sugars' | 'alcohol' | 'acid' | 'solvent';

export type AlternativeLiquidPreset = {
  key: string;
  label: string;
  /** Fraction of the liquid that is actually water (USDA-derived, by difference where the
   * record lists only macros). Only this fraction dissolves lye — the rest is fat, sugar,
   * protein, and solids. Matters when the liquid goes into the lye solution. */
  waterFraction: number;
  /** Fraction of the liquid that is saponifiable FAT (USDA-derived; absent = negligible).
   * No lye is calculated against it, so it lands in the finished soap as extra superfat.
   * A bar shrugs that off; liquid soap clouds and separates past ~3% superfat, which is
   * why this only drives an LS advisory. */
  fatFraction?: number;
  flags: AlternativeLiquidFlag[];
  /** Short advisory shown alongside the preset. */
  note?: string;
  /** Processes this liquid is offered for; absent = all. Mirrors AdditiveCatalogEntry. */
  processes?: readonly AdditiveProcess[];
  /** Per-process extra advisory, APPENDED to `note` (never replacing it) — the base note
   * is chemistry that holds everywhere; this is what the process changes. Read through
   * {@link alternativeLiquidNoteFor}, never directly. */
  processNotes?: Partial<Record<AdditiveProcess, string>>;
  /** For acid liquids: grams of PURE alkali consumed per gram of liquid. The calc grosses
   * these up by the recipe's lye purity, like every other lye figure. */
  lyeNeutralization?: { naohPerGram: number; kohPerGram: number };
};

const SUGAR_NOTE = 'Sugars can accelerate trace and darken the bar; keep the lye cool.';

/** LS-only. A liquid soap is 60–75% water by weight and sits at room temperature for
 * months, so anything that feeds microbes must go in BEFORE saponification, where the hot
 * alkali sterilises it — never into the dilution water, which is the last thing added and
 * is never cooked. The split-liquid stages (lye / oils / trace) are all pre-cook, so the
 * app has no dilution stage to offer; this note is what tells the user why. */
const LS_NOT_DILUTION_NOTE =
  'Liquid soap: never dilute with it — dilute with plain distilled water, then preserve and filter any sediment.';

/** LS-only. No lye is calculated against a liquid's own fat, so it survives as superfat.
 * A bar tolerates that; liquid soap clouds and separates past ~3%. */
const LS_FAT_NOTE =
  'Its fat gets no lye, so it lands as extra superfat — liquid soap clouds and separates past ~3%.';

/** Commercial vinegar is a 5% acetic-acid solution; moles of acid per gram of vinegar. */
const ACETIC_MOL_PER_GRAM_VINEGAR = 0.05 / ACETIC_ACID_MOLAR_MASS;

/** Common alternative liquids for split-liquid recipes. Water fractions are typical
 * composition values, not brand-specific; treat them as planning numbers. */
const ALCOHOL_NOTE = 'Simmer off the alcohol before use, then treat like a sugary liquid.';

export const ALTERNATIVE_LIQUID_GUIDE: readonly AlternativeLiquidPreset[] = [
  {
    key: 'aloe-juice',
    label: 'Aloe juice',
    waterFraction: 0.99,
    flags: [],
    processNotes: { ls: LS_NOT_DILUTION_NOTE },
  },
  {
    key: 'coffee-tea',
    label: 'Coffee or tea (brewed)',
    waterFraction: 0.99,
    flags: [],
    processNotes: { ls: LS_NOT_DILUTION_NOTE },
  },
  {
    key: 'glycerin',
    label: 'Glycerin',
    // Zero water — but a 'solvent' liquid still dissolves the lye when hot (the whole
    // premise of glycerin-method liquid soap), so the 1:1 dissolution floor counts its
    // FULL grams (see the web lyeWaterStatus wiring) while every water-fraction consumer
    // correctly sees 0. Not flagged 'sugars': the method deliberately heats it.
    waterFraction: 0,
    flags: ['solvent'],
    processNotes: {
      ls: 'The standard liquid-soap lye-phase solvent: swap half to two thirds of the lye water for it (all of it only if you pre-heat the glycerin, or the alkali will not dissolve). It also cuts the dilution water the paste needs — dilute in increments.',
    },
  },
  {
    key: 'coconut-water',
    label: 'Coconut water',
    waterFraction: 0.95,
    flags: ['sugars'],
    note: SUGAR_NOTE,
    processNotes: { ls: LS_NOT_DILUTION_NOTE },
  },
  {
    key: 'fruit-juice',
    label: 'Fruit juice',
    waterFraction: 0.88,
    flags: ['sugars'],
    note: SUGAR_NOTE,
    processNotes: { ls: LS_NOT_DILUTION_NOTE },
  },
  {
    key: 'milk',
    label: 'Milk (dairy or plant)',
    waterFraction: 0.87,
    fatFraction: 0.03,
    flags: ['sugars'],
    note: SUGAR_NOTE,
    processNotes: { ls: `${LS_FAT_NOTE} ${LS_NOT_DILUTION_NOTE}` },
  },
  {
    key: 'buttermilk',
    label: 'Buttermilk',
    waterFraction: 0.9,
    fatFraction: 0.01,
    flags: ['sugars'],
    note: SUGAR_NOTE,
    processNotes: { ls: LS_NOT_DILUTION_NOTE },
  },
  {
    key: 'yogurt',
    label: 'Yogurt (plain)',
    waterFraction: 0.88,
    fatFraction: 0.03,
    flags: ['sugars'],
    note: SUGAR_NOTE,
    processNotes: { ls: `${LS_FAT_NOTE} ${LS_NOT_DILUTION_NOTE}` },
  },
  {
    key: 'yogurt-greek',
    label: 'Greek yogurt',
    waterFraction: 0.81,
    fatFraction: 0.05,
    flags: ['sugars'],
    note: SUGAR_NOTE,
    processNotes: { ls: `${LS_FAT_NOTE} ${LS_NOT_DILUTION_NOTE}` },
  },
  {
    key: 'heavy-cream',
    label: 'Heavy cream',
    waterFraction: 0.58,
    fatFraction: 0.37,
    flags: ['sugars'],
    note: 'Mostly fat — barely over half is water. ' + SUGAR_NOTE,
    processNotes: { ls: `${LS_FAT_NOTE} ${LS_NOT_DILUTION_NOTE}` },
  },
  {
    key: 'coconut-milk-canned',
    label: 'Coconut milk (canned)',
    waterFraction: 0.68,
    fatFraction: 0.21,
    flags: ['sugars'],
    note: 'Mostly fat — only about two thirds is water. ' + SUGAR_NOTE,
    processNotes: { ls: `${LS_FAT_NOTE} ${LS_NOT_DILUTION_NOTE}` },
  },
  {
    key: 'puree',
    label: 'Fruit or vegetable puree',
    waterFraction: 0.85,
    flags: ['sugars'],
    note: SUGAR_NOTE,
    processNotes: { ls: LS_NOT_DILUTION_NOTE },
  },
  {
    key: 'beer',
    label: 'Beer',
    waterFraction: 0.92,
    flags: ['sugars', 'alcohol'],
    note: ALCOHOL_NOTE,
    processNotes: { ls: LS_NOT_DILUTION_NOTE },
  },
  {
    key: 'wine',
    label: 'Wine',
    waterFraction: 0.87,
    flags: ['sugars', 'alcohol'],
    note: ALCOHOL_NOTE,
    processNotes: { ls: LS_NOT_DILUTION_NOTE },
  },
  {
    key: 'vinegar',
    label: 'Vinegar (5%)',
    waterFraction: 0.95,
    flags: ['acid'],
    // Bar processes only. The point of vinegar in soap is the acetate salt, a BAR hardener;
    // a liquid soap has no bar to harden, so all it does there is eat alkali. Liquid soap's
    // own acid workflow (citric, after dilution) neutralises a lye excess and is deliberately
    // uncompensated — the opposite of the compensation this preset triggers.
    processes: ['cp', 'hp'],
    note:
      'Acetic acid consumes lye (forming an acetate salt, a bar hardener) — the extra lye is added to the recipe automatically.',
    lyeNeutralization: {
      naohPerGram: ACETIC_MOL_PER_GRAM_VINEGAR * NAOH_MOLAR_MASS,
      kohPerGram: ACETIC_MOL_PER_GRAM_VINEGAR * KOH_MOLAR_MASS,
    },
  },
];

export function alternativeLiquidPreset(key: string): AlternativeLiquidPreset | null {
  return ALTERNATIVE_LIQUID_GUIDE.find((preset) => preset.key === key) ?? null;
}

/** The liquids offered under `process`. Resolve the picker list through this, never off
 * ALTERNATIVE_LIQUID_GUIDE directly — a preset withheld from a process (vinegar in LS)
 * must not be selectable there. Lookup by key stays unfiltered on purpose, so a recipe
 * saved under one process still resolves its liquid after a process switch. */
/** Whether this liquid is offered under `process`. The SINGLE source of truth for
 * offered-ness: the picker list, the compensation guard, and the stray-row warning all
 * read it, so a liquid can never be offered in one place and treated as stray in another. */
export function isAlternativeLiquidOfferedFor(
  preset: AlternativeLiquidPreset,
  process: AdditiveProcess,
): boolean {
  return preset.processes === undefined || preset.processes.includes(process);
}

export function alternativeLiquidsForProcess(
  process: AdditiveProcess,
): readonly AlternativeLiquidPreset[] {
  return ALTERNATIVE_LIQUID_GUIDE.filter((preset) =>
    isAlternativeLiquidOfferedFor(preset, process),
  );
}

/** The advisory for this liquid under `process`: the base note plus the process note,
 * whichever exist. Null when the preset carries neither. */
export function alternativeLiquidNoteFor(
  preset: AlternativeLiquidPreset,
  process: AdditiveProcess,
): string | null {
  const processNote = preset.processNotes?.[process];
  const parts = [preset.note, processNote].filter((part): part is string => !!part);
  return parts.length > 0 ? parts.join(' ') : null;
}

/** Grams of saponifiable fat the alternative liquids bring in — fat no lye was calculated
 * against, so it survives saponification as superfat nobody asked for. */
export function alternativeLiquidFatGrams(
  rows: readonly { presetKey: string; grams: number | null }[],
): number {
  let fatGrams = 0;
  for (const { presetKey, grams } of rows) {
    const fatFraction = alternativeLiquidPreset(presetKey)?.fatFraction;
    if (!fatFraction || grams === null || !Number.isFinite(grams) || grams <= 0) continue;
    fatGrams += grams * fatFraction;
  }
  return fatGrams;
}

/** That fat expressed the way the user reads superfat: percentage points of oil weight,
 * to be read ON TOP of the recipe's stated superfat. */
export function superfatShiftFromLiquidFat(
  liquidFatGrams: number,
  totalOilGrams: number,
): number {
  if (
    !Number.isFinite(liquidFatGrams) ||
    !Number.isFinite(totalOilGrams) ||
    liquidFatGrams <= 0 ||
    totalOilGrams <= 0
  ) {
    return 0;
  }
  return (liquidFatGrams / totalOilGrams) * 100;
}

export type ExtraLyeForAcid = { naohGrams: number; kohGrams: number };

export type AcidLyeRecipe = {
  lyeType: 'naoh' | 'koh' | 'dual';
  kohBlendPercent: number;
  naohPurityPercent: number;
  kohPurityPercent: number;
};

/** Shared acid math: as-weighed extra lye for `grams` of an acid with the given pure-alkali
 * factors — dual lye allocates by KOH blend share, each alkali grossed up by its purity. */
export function extraLyeForAcid(
  factors: { naohPerGram: number; kohPerGram: number },
  grams: number,
  recipe: AcidLyeRecipe,
): ExtraLyeForAcid {
  if (!Number.isFinite(grams) || grams <= 0) {
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
  const naohGrams = (grams * (1 - kohShare) * factors.naohPerGram) / naohPurity;
  const kohGrams = (grams * kohShare * factors.kohPerGram) / kohPurity;
  return { naohGrams, kohGrams };
}

export function extraLyeForAcidLiquid(
  preset: AlternativeLiquidPreset,
  liquidGrams: number,
  recipe: AcidLyeRecipe,
): ExtraLyeForAcid {
  const factors = preset.lyeNeutralization;
  if (!factors) return { naohGrams: 0, kohGrams: 0 };
  return extraLyeForAcid(factors, liquidGrams, recipe);
}
