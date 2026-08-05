import {
  DEFAULT_LYE_CONCENTRATION_PERCENT,
  DEFAULT_LYE_WATER_RATIO,
  DEFAULT_WATER_PERCENT,
  type DilutionResult,
  type FormulationInsight,
  type LyeCalculationResult,
  type NeutralizationResult,
  type RecipePropertiesResult,
} from '@soap-calc/core';
import { additiveStageLabel } from './additiveStageLabel';
import type { ComputedAdditive, ComputedPostCookSuperfat } from './calculateAdditives';
import type { RecipeFattyAcids } from './calculateFattyAcids';
import type { RecipeDisplayTotals } from './calculateRecipe';
import type { RecipeIndexResult } from './calculateRecipeIndexes';
import type { ProcessId } from './process';
import type { RecipeLine, RecipeSettings, SplitLiquidRow, WeightUnit } from './recipe';
import { oilDisplayName } from './oilDisplay';
import { formatGrams } from './format';
import { formatWeight } from './weightUnits';

export { additiveStageLabel };

export type BatchSheetData = {
  recipeName: string;
  batchNotes: string;
  weightUnit: WeightUnit;
  lyeLabel: string;
  settings: RecipeSettings;
  lines: RecipeLine[];
  linePercents: Map<string, number>;
  result: LyeCalculationResult;
  displayTotals: RecipeDisplayTotals;
  additives: ComputedAdditive[];
  splitLiquidRows: Array<{ row: SplitLiquidRow; grams: number | null }>;
  splitLiquidGrams: number | null;
  postCookSuperfat: ComputedPostCookSuperfat | null;
  pcsfIsExtra: boolean;
  extrasGrams: number;
  dilution: DilutionResult | null;
  /** The maker's scale reading for the whole batch's paste, in grams — the same App state
   * DilutionPanel and PortionDilutionResults read (see DilutionPanel's own doc). A valid one
   * corrects the printed "Dilution water to add" figure via correctedDilutionWaterGrams
   * (lib/measuredPaste), so the sheet a maker carries to the bench matches the screen.
   * Optional: data built before the field existed prints the recipe's own computed figure. */
  measuredPasteGrams?: string;
  /** True when `measuredPasteGrams` is what's LEFT after earlier dilutions rather than the
   * whole batch (see DilutionPanel's declaration radios). A remaining-paste reading describes
   * a smaller pot, not the batch — it must never correct this printed batch row. */
  measuredPasteIsRemaining?: boolean;
  /** The mass of finished product actually bottled: solution base (real paste when the
   * target exceeds it) plus additives, append-mode post-cook oil, and split-liquid solids —
   * see useRecipeViewModel's bottledSolutionGrams / computeBottledSolutionGrams. Printed
   * alongside (not instead of) the chemistry-only `dilution.solutionGrams` row, since the
   * sheet is the page taken to the bench and that is what actually gets bottled. Null/
   * undefined falls back to `dilution.solutionGrams` (no separate row needed). */
  bottledSolutionGrams?: number | null;
  /** The best-known WHOLE-BATCH paste mass — see useRecipeViewModel. Corrects the printed
   * "Dilution water to add" for an alternative liquid's non-water solids, which
   * calculateDilution's anhydrous + water arithmetic leaves out of the pot entirely
   * (correctedDilutionWaterGrams, the same helper DilutionPanel's batch row goes through).
   * Without it the sheet carried to the bench prescribed the solids' worth of extra water
   * — 5,450 g against the 5,000 g on screen for a 900 g liquid at 50% water. Optional:
   * absent, the recipe's own figure prints, which is identical for a recipe with no split
   * liquid. */
  wholeBatchPasteGrams?: number | null;
  /** Grams of split liquid with undeclared water content. Non-zero makes the printed
   * dilution figure a lower bound, and the sheet must say so — the bench copy is the one
   * surface with no sibling panel to explain it. Optional: data built before the field
   * existed prints no caveat (same convention as soapingTempF). */
  unknownLiquidGrams?: number;
  /** The over-dilution verdict holds even if every undeclared gram were solids — the
   * printed sheet may state it as fact instead of hedging (mirrors DilutionPanel). */
  overDilutionCertain?: boolean;
  /** The 1:1 lye-dissolution check could not run (an in-lye liquid's water content is
   * undeclared) — printed beside the lye figures for the same reason. Independent of
   * `dilution`: unlike the two fields above, this applies to every process (CP/HP included),
   * so it must render in the always-present Lye solution section, not inside the
   * LS-only Dilution block. */
  lyeWaterUnverifiable?: boolean;
  neutralization: NeutralizationResult | null;
  properties: RecipePropertiesResult | null;
  indexes: RecipeIndexResult;
  batchWeightWithExtras: number;
  waterModeLabel: string;
  /** Effective soaping temperature, °F; absent on data built before the field existed. */
  soapingTempF?: number;
  /** Carries `modeledOilIds` (which oils' profiles are reconstructions) alongside the aggregate.
   *  Required, and not duplicated as a sibling field: the modeled note is a data-honesty signal,
   *  so a caller must not be able to omit it and silently print a reconstruction as measured. */
  fattyAcids: RecipeFattyAcids;
  insights: FormulationInsight[];
  process: ProcessId;
};

export function canPrintBatchSheet(
  result: LyeCalculationResult | null,
  displayTotals: RecipeDisplayTotals | null,
  inputErrors: string[],
): boolean {
  if (!result || !displayTotals || inputErrors.length > 0) return false;
  if (result.errors.length > 0) return false;
  if (displayTotals.recipeOilWeightGrams <= 0) return false;
  if (result.lyeWeightGrams <= 0) return false;
  return true;
}

export function buildBatchSheetData(input: BatchSheetData): BatchSheetData {
  return { ...input };
}

export function formatBatchSheetProperty(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return formatGrams(value, 1);
}

export function batchSheetOilName(oilId: string): string {
  return oilDisplayName(oilId);
}

export function formatBatchWeight(grams: number, unit: WeightUnit): string {
  return formatWeight(grams, unit);
}

// Blank water fields are valid input (parseRecipeSettings maps them to undefined and
// the core applies its defaults), so label the value the math actually used.
export function waterModeLabel(settings: RecipeSettings): string {
  switch (settings.waterMode) {
    case 'lye_concentration':
      return `${settings.lyeConcentrationPercent || DEFAULT_LYE_CONCENTRATION_PERCENT}% lye concentration`;
    case 'lye_water_ratio':
      return `${settings.lyeWaterRatio || DEFAULT_LYE_WATER_RATIO}:1 water:lye`;
    default:
      return `${settings.waterPercentOfOils || DEFAULT_WATER_PERCENT}% of oils`;
  }
}
