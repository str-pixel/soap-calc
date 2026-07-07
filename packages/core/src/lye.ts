import { KOH_TO_NAOH_FACTOR } from './sap.js';

export type LyeType = 'naoh' | 'koh';

/** For tar / acid-neutralization oils: include in lye math or add at trace only. */
export type TarLyeTreatment = 'include' | 'additive';

export type RecipeOilLine = {
  oilId: string;
  weightGrams: number;
  tarLyeTreatment?: TarLyeTreatment;
};

export type OilForLyeCalc = {
  id: string;
  sapKoh: number;
  sapNaoh: number;
  category?: string;
  sapRole?: 'triglyceride' | 'acid_neutralization';
};

export type WaterMode = 'percent_of_oils' | 'lye_concentration' | 'lye_water_ratio';

export type LyeRecipeInput = {
  oils: RecipeOilLine[];
  oilLookup: Record<string, OilForLyeCalc>;
  superfatPercent: number;
  lyeType: LyeType;
  naohPurityPercent?: number;
  kohPurityPercent?: number;
  waterMode?: WaterMode;
  /** Water as % of oil weight (default 33). */
  waterPercentOfOils?: number;
  /** Lye concentration as % (e.g. 33.33). */
  lyeConcentrationPercent?: number;
  /** Water : lye weight ratio (e.g. 2 = 2:1). */
  lyeWaterRatio?: number;
};

export type LyeLineResult = {
  oilId: string;
  weightGrams: number;
  lyeGrams: number;
  includedInLye: boolean;
  tarLyeTreatment?: TarLyeTreatment;
};

export type LyeCalculationResult = {
  totalOilWeightGrams: number;
  lyeWeightGrams: number;
  waterWeightGrams: number;
  totalBatchWeightGrams: number;
  lyeConcentrationPercent: number;
  waterLyeRatio: number;
  lines: LyeLineResult[];
  warnings: string[];
  errors: string[];
};

const DEFAULT_NAOH_PURITY = 100;
const DEFAULT_KOH_PURITY = 90;
const DEFAULT_WATER_PERCENT = 33;
const MAX_SUPERFAT_PERCENT = 50;

function validatePurityPercent(
  value: number | undefined,
  defaultValue: number,
  label: string,
  errors: string[],
): number {
  const purity = value ?? defaultValue;
  if (!Number.isFinite(purity) || purity <= 0 || purity > 100) {
    errors.push(`${label} must be a finite number between 1 and 100`);
    return defaultValue;
  }
  return purity;
}

export function isTarLikeOil(oil: OilForLyeCalc): boolean {
  return oil.category === 'tar' || oil.sapRole === 'acid_neutralization';
}

export function resolveTarLyeTreatment(
  oil: OilForLyeCalc,
  line: RecipeOilLine,
): TarLyeTreatment | undefined {
  if (!isTarLikeOil(oil)) return undefined;
  return line.tarLyeTreatment ?? 'include';
}

export function shouldIncludeOilInLye(
  oil: OilForLyeCalc,
  line: RecipeOilLine,
): boolean {
  if (!isTarLikeOil(oil)) return true;
  return resolveTarLyeTreatment(oil, line) === 'include';
}

/** SAP coefficient in g alkali per g oil, adjusted for purity. */
export function sapCoefficientForLye(
  oil: OilForLyeCalc,
  lyeType: LyeType,
  options: { naohPurityPercent?: number; kohPurityPercent?: number } = {},
): number {
  const naohPurity = (options.naohPurityPercent ?? DEFAULT_NAOH_PURITY) / 100;
  const kohPurity = (options.kohPurityPercent ?? DEFAULT_KOH_PURITY) / 100;

  if (lyeType === 'koh') {
    return kohPurity > 0 ? oil.sapKoh / kohPurity : 0;
  }

  return naohPurity > 0 ? oil.sapNaoh / naohPurity : 0;
}

export function lyeForOilLine(
  oil: OilForLyeCalc,
  line: RecipeOilLine,
  lyeType: LyeType,
  superfatPercent: number,
  purity: { naohPurityPercent?: number; kohPurityPercent?: number },
): number {
  if (!shouldIncludeOilInLye(oil, line) || line.weightGrams <= 0) {
    return 0;
  }

  const coefficient = sapCoefficientForLye(oil, lyeType, purity);
  const superfatFactor = 1 - superfatPercent / 100;
  return coefficient * line.weightGrams * superfatFactor;
}

export function calculateLye(input: LyeRecipeInput): LyeCalculationResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  const tarWarningsIssued = new Set<string>();
  const specialtyWarningsIssued = new Set<string>();
  const lines: LyeLineResult[] = [];
  const purity = {
    naohPurityPercent: input.naohPurityPercent,
    kohPurityPercent: input.kohPurityPercent,
  };

  if (
    !Number.isFinite(input.superfatPercent) ||
    input.superfatPercent < 0 ||
    input.superfatPercent > MAX_SUPERFAT_PERCENT
  ) {
    errors.push(
      `superfatPercent must be a finite number between 0 and ${MAX_SUPERFAT_PERCENT}`,
    );
  }

  const waterMode = input.waterMode ?? 'percent_of_oils';
  if (waterMode === 'lye_concentration') {
    const conc = input.lyeConcentrationPercent ?? 33.33;
    if (!Number.isFinite(conc) || conc <= 0 || conc >= 100) {
      errors.push(
        'lyeConcentrationPercent must be a finite number between 0 and 100 (exclusive)',
      );
    }
  } else if (waterMode === 'lye_water_ratio') {
    const ratio = input.lyeWaterRatio ?? 2;
    if (!Number.isFinite(ratio) || ratio <= 0) {
      errors.push('lyeWaterRatio must be a finite number greater than 0');
    }
  } else if (
    input.waterPercentOfOils !== undefined &&
    (!Number.isFinite(input.waterPercentOfOils) || input.waterPercentOfOils < 0)
  ) {
    errors.push('waterPercentOfOils must be a non-negative finite number');
  }

  if (input.lyeType === 'naoh') {
    validatePurityPercent(input.naohPurityPercent, DEFAULT_NAOH_PURITY, 'naohPurityPercent', errors);
  } else {
    validatePurityPercent(input.kohPurityPercent, DEFAULT_KOH_PURITY, 'kohPurityPercent', errors);
  }

  const hasFatalInputError = errors.length > 0;

  let totalOilWeightGrams = 0;
  let lyeWeightGrams = 0;

  for (const line of input.oils) {
    const oil = input.oilLookup[line.oilId];
    if (!oil) {
      errors.push(`Unknown oil id: ${line.oilId}`);
      continue;
    }

    if (!Number.isFinite(line.weightGrams) || line.weightGrams < 0) {
      errors.push(`Invalid weight for oil ${line.oilId}`);
      continue;
    }

    totalOilWeightGrams += line.weightGrams;
    const includedInLye = shouldIncludeOilInLye(oil, line);
    const tarLyeTreatment = resolveTarLyeTreatment(oil, line);
    const lineLye = hasFatalInputError
      ? 0
      : lyeForOilLine(
          oil,
          line,
          input.lyeType,
          input.superfatPercent,
          purity,
        );

    if (
      isTarLikeOil(oil) &&
      tarLyeTreatment === 'include' &&
      !tarWarningsIssued.has(oil.id)
    ) {
      tarWarningsIssued.add(oil.id);
      warnings.push(
        `${oil.id}: tar included in lye calc using acid-neutralization estimate — verify batch`,
      );
    }

    if (
      line.weightGrams > 0 &&
      includedInLye &&
      (oil.category === 'wax' || oil.category === 'free_acid') &&
      !specialtyWarningsIssued.has(oil.id)
    ) {
      specialtyWarningsIssued.add(oil.id);
      warnings.push(
        `${oil.id}: ${oil.category} SAP may be approximate — verify batch`,
      );
    }

    lyeWeightGrams += lineLye;
    lines.push({
      oilId: line.oilId,
      weightGrams: line.weightGrams,
      lyeGrams: lineLye,
      includedInLye,
      tarLyeTreatment,
    });
  }

  let waterWeightGrams = 0;

  if (!hasFatalInputError) {
    switch (waterMode) {
      case 'lye_concentration': {
        const concentration = (input.lyeConcentrationPercent ?? 33.33) / 100;
        waterWeightGrams = lyeWeightGrams / concentration - lyeWeightGrams;
        break;
      }
      case 'lye_water_ratio': {
        const ratio = input.lyeWaterRatio ?? 2;
        waterWeightGrams = lyeWeightGrams * ratio;
        break;
      }
      default:
        waterWeightGrams =
          totalOilWeightGrams * ((input.waterPercentOfOils ?? DEFAULT_WATER_PERCENT) / 100);
    }
  }

  const lyePlusWater = lyeWeightGrams + waterWeightGrams;
  const lyeConcentrationPercent =
    lyePlusWater > 0 ? (lyeWeightGrams / lyePlusWater) * 100 : 0;
  const waterLyeRatio = lyeWeightGrams > 0 ? waterWeightGrams / lyeWeightGrams : 0;

  return {
    totalOilWeightGrams,
    lyeWeightGrams,
    waterWeightGrams,
    totalBatchWeightGrams: totalOilWeightGrams + lyeWeightGrams + waterWeightGrams,
    lyeConcentrationPercent,
    waterLyeRatio,
    lines,
    warnings,
    errors,
  };
}

/** @internal exposed for tests documenting Soapee parity factor */
export const SOAPEE_NAOH_FACTOR = KOH_TO_NAOH_FACTOR;
