export type LyeType = 'naoh' | 'koh' | 'dual';

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
  /** When lyeType is dual: percent of total alkali weight from KOH (0–100). */
  kohBlendPercent?: number;
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
  naohGrams: number;
  kohGrams: number;
  includedInLye: boolean;
  tarLyeTreatment?: TarLyeTreatment;
};

export type LyeCalculationResult = {
  totalOilWeightGrams: number;
  lyeWeightGrams: number;
  naohWeightGrams: number;
  kohWeightGrams: number;
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
/** Water-mode defaults applied when the input omits a value. Exported so display
 * layers can show the effective number instead of an empty label. */
export const DEFAULT_WATER_PERCENT = 33;
export const DEFAULT_LYE_CONCENTRATION_PERCENT = 33.33;
export const DEFAULT_LYE_WATER_RATIO = 2;
const MAX_SUPERFAT_PERCENT = 50;
const NEG_SUPERFAT_FLOOR = -5;
/** Default KOH share for dual-lye recipes; shared with analyzeFormulation so the
 * "advanced technique" insight matches what calculateLye actually blends. */
export const DEFAULT_KOH_BLEND_PERCENT = 5;

function validatePurityPercent(
  value: number | undefined,
  defaultValue: number,
  label: string,
  errors: string[],
): number {
  const purity = value ?? defaultValue;
  if (!Number.isFinite(purity) || purity <= 0 || purity > 100) {
    errors.push(`${label} must be a finite number greater than 0 and at most 100`);
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
  kohBlendPercent = 0,
): { lyeGrams: number; naohGrams: number; kohGrams: number } {
  if (!shouldIncludeOilInLye(oil, line) || line.weightGrams <= 0) {
    return { lyeGrams: 0, naohGrams: 0, kohGrams: 0 };
  }

  const superfatFactor = 1 - superfatPercent / 100;

  if (lyeType === 'dual') {
    const kohFraction = Math.min(1, Math.max(0, kohBlendPercent / 100));
    const naohCoeff = sapCoefficientForLye(oil, 'naoh', purity);
    const kohCoeff = sapCoefficientForLye(oil, 'koh', purity);
    const fullNaohGrams = naohCoeff * line.weightGrams * superfatFactor;
    const blendDenom = (1 - kohFraction) * kohCoeff + kohFraction * naohCoeff;
    if (blendDenom <= 0) {
      return { lyeGrams: 0, naohGrams: 0, kohGrams: 0 };
    }
    const totalAlkali = (fullNaohGrams * kohCoeff) / blendDenom;
    const naohGrams = totalAlkali * (1 - kohFraction);
    const kohGrams = totalAlkali * kohFraction;
    return { lyeGrams: naohGrams + kohGrams, naohGrams, kohGrams };
  }

  const coefficient = sapCoefficientForLye(oil, lyeType, purity);
  const lyeGrams = coefficient * line.weightGrams * superfatFactor;
  if (lyeType === 'koh') {
    return { lyeGrams, naohGrams: 0, kohGrams: lyeGrams };
  }
  return { lyeGrams, naohGrams: lyeGrams, kohGrams: 0 };
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
    input.superfatPercent < NEG_SUPERFAT_FLOOR ||
    input.superfatPercent > MAX_SUPERFAT_PERCENT
  ) {
    errors.push(
      `superfatPercent must be a finite number between ${NEG_SUPERFAT_FLOOR} and ${MAX_SUPERFAT_PERCENT}`,
    );
  }

  const waterMode = input.waterMode ?? 'percent_of_oils';
  if (waterMode === 'lye_concentration') {
    const conc = input.lyeConcentrationPercent ?? DEFAULT_LYE_CONCENTRATION_PERCENT;
    if (!Number.isFinite(conc) || conc <= 0 || conc >= 100) {
      errors.push(
        'lyeConcentrationPercent must be a finite number between 0 and 100 (exclusive)',
      );
    }
  } else if (waterMode === 'lye_water_ratio') {
    const ratio = input.lyeWaterRatio ?? DEFAULT_LYE_WATER_RATIO;
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
  } else if (input.lyeType === 'koh') {
    validatePurityPercent(input.kohPurityPercent, DEFAULT_KOH_PURITY, 'kohPurityPercent', errors);
  } else {
    validatePurityPercent(input.naohPurityPercent, DEFAULT_NAOH_PURITY, 'naohPurityPercent', errors);
    validatePurityPercent(input.kohPurityPercent, DEFAULT_KOH_PURITY, 'kohPurityPercent', errors);
    const blend = input.kohBlendPercent ?? DEFAULT_KOH_BLEND_PERCENT;
    if (!Number.isFinite(blend) || blend < 0 || blend > 50) {
      errors.push('kohBlendPercent must be a finite number between 0 and 50');
    }
  }

  const hasFatalInputError = errors.length > 0;

  let totalOilWeightGrams = 0;
  let lyeWeightGrams = 0;
  let naohWeightGrams = 0;
  let kohWeightGrams = 0;
  const kohBlendPercent = input.kohBlendPercent ?? DEFAULT_KOH_BLEND_PERCENT;

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
      ? { lyeGrams: 0, naohGrams: 0, kohGrams: 0 }
      : lyeForOilLine(
          oil,
          line,
          input.lyeType,
          input.superfatPercent,
          purity,
          kohBlendPercent,
        );

    if (
      line.weightGrams > 0 &&
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

    lyeWeightGrams += lineLye.lyeGrams;
    naohWeightGrams += lineLye.naohGrams;
    kohWeightGrams += lineLye.kohGrams;
    lines.push({
      oilId: line.oilId,
      weightGrams: line.weightGrams,
      lyeGrams: lineLye.lyeGrams,
      naohGrams: lineLye.naohGrams,
      kohGrams: lineLye.kohGrams,
      includedInLye,
      tarLyeTreatment,
    });
  }

  let waterWeightGrams = 0;

  if (!hasFatalInputError) {
    switch (waterMode) {
      case 'lye_concentration': {
        const concentration =
          (input.lyeConcentrationPercent ?? DEFAULT_LYE_CONCENTRATION_PERCENT) / 100;
        waterWeightGrams = lyeWeightGrams / concentration - lyeWeightGrams;
        break;
      }
      case 'lye_water_ratio': {
        const ratio = input.lyeWaterRatio ?? DEFAULT_LYE_WATER_RATIO;
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

  if (
    !hasFatalInputError &&
    lyeWeightGrams > 0 &&
    waterWeightGrams > 0 &&
    waterWeightGrams < lyeWeightGrams
  ) {
    warnings.push(
      'Water is less than lye by weight — use at least a 1:1 water:lye ratio to dissolve alkali safely.',
    );
  }

  return {
    totalOilWeightGrams,
    lyeWeightGrams,
    naohWeightGrams,
    kohWeightGrams,
    waterWeightGrams,
    totalBatchWeightGrams: totalOilWeightGrams + lyeWeightGrams + waterWeightGrams,
    lyeConcentrationPercent,
    waterLyeRatio,
    lines,
    warnings,
    errors,
  };
}

/** Present a lye result as if the oils were scaled by `factor` (0–1): scales the lye-side
 * quantities (lye/water are linear in oil weight), preserving oil weights, concentration,
 * and water:lye ratio. Used for the post-cook-superfat "subtract" method (reserve oil). */
export function scaleLyeResult(result: LyeCalculationResult, factor: number): LyeCalculationResult {
  const f = Math.min(1, Math.max(0, factor));
  const lyeWeightGrams = result.lyeWeightGrams * f;
  const naohWeightGrams = result.naohWeightGrams * f;
  const kohWeightGrams = result.kohWeightGrams * f;
  const waterWeightGrams = result.waterWeightGrams * f;
  return {
    ...result,
    lyeWeightGrams,
    naohWeightGrams,
    kohWeightGrams,
    waterWeightGrams,
    totalBatchWeightGrams: result.totalOilWeightGrams + lyeWeightGrams + waterWeightGrams,
    lines: result.lines.map((line) => ({
      ...line,
      lyeGrams: line.lyeGrams * f,
      naohGrams: line.naohGrams * f,
      kohGrams: line.kohGrams * f,
    })),
  };
}

