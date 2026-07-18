import type { AdditiveStage, DoseBasis, DoseUnit, TarLyeTreatment, WaterMode } from '@soap-calc/core';
import { isWeightUnit, type WeightUnit } from './weightUnits';
import { processForLyeType } from './process';
import { defaultVariantFor, isProcessVariantId, type ProcessVariantId } from './processProfile';

export type { WeightUnit };

export type RecipeLine = {
  key: string;
  oilId: string;
  weightGrams: string;
  weightPercent?: string;
  tarLyeTreatment?: TarLyeTreatment;
};

export type AdditiveLine = {
  key: string;
  catalogId: string;
  name: string;
  amount: string;
  basis: DoseBasis;
  unit: DoseUnit;
  addAt: AdditiveStage;
};

export type SplitLiquidSettings = {
  enabled: boolean;
  name: string;
  percentOfOil: string;
  addAt: 'lye' | 'oils' | 'trace';
};

export type RecipeSettings = {
  weightUnit: WeightUnit;
  batchOilGrams: string;
  /** True only when the user typed the batch total (or applied a suggested one);
   * a total derived from line weights follows them instead of locking them. */
  batchSetByUser: boolean;
  superfatPercent: string;
  lyeType: 'naoh' | 'koh' | 'dual';
  kohBlendPercent: string;
  waterMode: WaterMode;
  waterPercentOfOils: string;
  lyeConcentrationPercent: string;
  lyeWaterRatio: string;
  naohPurityPercent: string;
  kohPurityPercent: string;
  splitLiquid: SplitLiquidSettings;
  batchNotes: string;
  postCookSuperfatPercent: string;
  postCookSuperfatOilId: string;
  postCookSuperfatMethod: 'append' | 'subtract';
  soapConcentrationPercent: string;
  processVariant: ProcessVariantId;
};

export function newLineKey(): string {
  return `line-${crypto.randomUUID()}`;
}

export function newAdditiveKey(): string {
  return `additive-${crypto.randomUUID()}`;
}

export const DEFAULT_SPLIT_LIQUID: SplitLiquidSettings = {
  enabled: false,
  name: '',
  percentOfOil: '',
  addAt: 'trace',
};

export const DEFAULT_SETTINGS: RecipeSettings = {
  weightUnit: 'g',
  batchOilGrams: '1000',
  batchSetByUser: false,
  superfatPercent: '5',
  lyeType: 'naoh',
  kohBlendPercent: '5',
  waterMode: 'percent_of_oils',
  waterPercentOfOils: '33',
  lyeConcentrationPercent: '33.33',
  lyeWaterRatio: '2',
  naohPurityPercent: '100',
  kohPurityPercent: '90',
  splitLiquid: { ...DEFAULT_SPLIT_LIQUID },
  batchNotes: '',
  postCookSuperfatPercent: '0',
  postCookSuperfatOilId: 'olive-oil',
  postCookSuperfatMethod: 'append',
  soapConcentrationPercent: '30',
  processVariant: 'cp',
};

export function normalizeSplitLiquid(
  partial: Partial<SplitLiquidSettings> | null | undefined,
): SplitLiquidSettings {
  const addAt =
    partial?.addAt === 'lye' || partial?.addAt === 'oils' || partial?.addAt === 'trace'
      ? partial.addAt
      : DEFAULT_SPLIT_LIQUID.addAt;
  return {
    enabled: partial?.enabled === true,
    name: typeof partial?.name === 'string' ? partial.name : '',
    percentOfOil: typeof partial?.percentOfOil === 'string' ? partial.percentOfOil : '',
    addAt,
  };
}

const WATER_MODES = ['percent_of_oils', 'lye_concentration', 'lye_water_ratio'] as const;
const LYE_TYPES = ['naoh', 'koh', 'dual'] as const;

function isWaterMode(value: unknown): value is WaterMode {
  return typeof value === 'string' && (WATER_MODES as readonly string[]).includes(value);
}

function isLyeType(value: unknown): value is RecipeSettings['lyeType'] {
  return typeof value === 'string' && (LYE_TYPES as readonly string[]).includes(value);
}

/**
 * Batch provenance for a loaded or imported recipe. An explicit flag wins in both
 * directions. A recipe saved or exported before provenance existed carries no flag, but
 * its total was one the user typed — so infer the lock from the total it actually saved.
 * Defaulting those to derived would silently grow the batch on the next percent edit,
 * overflowing the mold the recipe was sized for.
 *
 * Reads the SAVED total (`partial`), deliberately, not the resolved one: a partial with
 * no total at all resolves to the 1000 g default, which no user typed and must not be
 * locked. Such a recipe stays derived even though the total it returns with is non-empty,
 * so a derived total is not always the sum of the line weights — `syncPercentEdit` treats
 * the total as a fallback rather than assuming that invariant.
 */
function resolveBatchProvenance(partial: Partial<RecipeSettings> | null | undefined): boolean {
  if (partial?.batchSetByUser !== undefined) return partial.batchSetByUser === true;
  const savedBatch = Number(partial?.batchOilGrams ?? '');
  return Number.isFinite(savedBatch) && savedBatch > 0;
}

/** Drop keys an imported/parsed object should never carry into a settings spread.
 * Object spread already defines own props (so it can't pollute Object.prototype the
 * way Object.assign can), but stripping these makes the intent explicit and keeps a
 * hostile recipe file from smuggling a literal "__proto__"/"constructor" own-key into
 * persisted + re-exported settings. Legit settings fields are unaffected. */
const UNSAFE_SETTING_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
function stripUnsafeKeys(
  partial: Partial<RecipeSettings> | null | undefined,
): Partial<RecipeSettings> {
  if (!partial) return {};
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(partial)) {
    if (!UNSAFE_SETTING_KEYS.has(key)) clean[key] = value;
  }
  return clean as Partial<RecipeSettings>;
}

export function normalizeSettings(
  partial: Partial<RecipeSettings> | null | undefined,
): RecipeSettings {
  const weightUnit = isWeightUnit(partial?.weightUnit)
    ? partial.weightUnit
    : DEFAULT_SETTINGS.weightUnit;
  const waterMode = isWaterMode(partial?.waterMode)
    ? partial.waterMode
    : DEFAULT_SETTINGS.waterMode;
  const lyeType = isLyeType(partial?.lyeType) ? partial.lyeType : DEFAULT_SETTINGS.lyeType;
  const postCookSuperfatMethod =
    partial?.postCookSuperfatMethod === 'subtract' ? 'subtract' : 'append';
  // A recipe saved or exported before sub-variants existed has no processVariant at all,
  // and a hand-edited or corrupted one may carry a stale/invalid string. Either way, fall
  // back to the variant the recipe's own alkali implies (KOH → an LS variant, else CP) —
  // not a fixed constant — so a legacy liquid-soap recipe doesn't silently normalize to CP.
  //
  // This fallback is a best-effort PRE-COERCE default, not an authoritative process/variant
  // pairing: `processForLyeType` collapses dual-lye (`lyeType: 'dual'`) to 'cp', so a
  // dual-lye liquid-soap recipe with no saved variant lands here as a CP variant even
  // though its true process may be LS. A stale-but-structurally-valid variant string is
  // also trusted as-is and not cross-checked against the recipe's process. Any caller that
  // needs an authoritative variant MUST run the result through `coerceSettingsForProcess`
  // with the recipe's actual (known) process — that is what reconciles variant vs. process
  // everywhere in the app (loadWorkspace uses the draft's own process key; import uses the
  // file's process). Do not read `processVariant` off a freshly normalized recipe as
  // ground truth before that coercion has run.
  const processVariant = isProcessVariantId(partial?.processVariant)
    ? partial.processVariant
    : defaultVariantFor(processForLyeType(lyeType));
  return {
    ...DEFAULT_SETTINGS,
    ...stripUnsafeKeys(partial),
    weightUnit,
    waterMode,
    lyeType,
    postCookSuperfatMethod,
    processVariant,
    batchSetByUser: resolveBatchProvenance(partial),
    ...(typeof partial?.batchNotes === 'string' ? { batchNotes: partial.batchNotes } : {}),
    splitLiquid: normalizeSplitLiquid(partial?.splitLiquid),
  };
}

export function createEmptyAdditives(): AdditiveLine[] {
  return [];
}

export function normalizeAdditiveLine(
  partial: Partial<AdditiveLine> & { percentOfOil?: string } & Pick<AdditiveLine, 'key'>,
): AdditiveLine {
  const addAt =
    partial.addAt === 'lye' ||
    partial.addAt === 'oils' ||
    partial.addAt === 'trace' ||
    partial.addAt === 'top' ||
    partial.addAt === 'after_cook'
      ? partial.addAt
      : 'trace';
  const basis = partial.basis === 'batch' ? 'batch' : partial.basis === 'solution' ? 'solution' : 'oil';
  const unit = partial.unit === 'ppt' ? 'ppt' : 'percent';
  const amount =
    typeof partial.amount === 'string'
      ? partial.amount
      : typeof partial.percentOfOil === 'string'
        ? partial.percentOfOil
        : '';
  return {
    key: partial.key,
    catalogId: typeof partial.catalogId === 'string' ? partial.catalogId : '',
    name: typeof partial.name === 'string' ? partial.name : '',
    amount,
    basis,
    unit,
    addAt,
  };
}

export function additivesFromSaved(
  saved: Array<Omit<AdditiveLine, 'key'>> | undefined,
): AdditiveLine[] {
  if (!saved?.length) return createEmptyAdditives();
  return saved.map((line) => normalizeAdditiveLine({ key: newAdditiveKey(), ...line }));
}

export function migrateRecipeLines(
  lines: RecipeLine[],
  settings: Pick<RecipeSettings, 'batchOilGrams'>,
): RecipeLine[] {
  const batch = Number(settings.batchOilGrams);
  if (!Number.isFinite(batch) || batch <= 0) return lines;
  return lines.map((line) => {
    if (line.weightGrams !== '' || !line.weightPercent) return line;
    const pct = Number(line.weightPercent);
    if (!Number.isFinite(pct) || pct <= 0) return line;
    return { ...line, weightGrams: String(Math.round((batch * pct) / 100)) };
  });
}

export function createStarterLines(): RecipeLine[] {
  return [
    { key: newLineKey(), oilId: 'olive-oil', weightGrams: '450', weightPercent: '45' },
    { key: newLineKey(), oilId: 'coconut-oil-76', weightGrams: '250', weightPercent: '25' },
    { key: newLineKey(), oilId: 'shea-butter', weightGrams: '300', weightPercent: '30' },
  ];
}

