import {
  DEFAULT_OIL_BATCH_FRACTION,
  oilBatchFraction,
  oilGramsFromBarCount,
  oilGramsFromMoldVolumeCm3,
  rectangularMoldVolumeCm3,
} from '@soap-calc/core';
import { displayValueToGrams, type WeightUnit } from './weightUnits';

const CM_PER_INCH = 2.54;

export type MoldSizerMode = 'mold' | 'bars';

export type MoldSizerInput = {
  mode: MoldSizerMode;
  length: string;
  width: string;
  height: string;
  barCount: string;
  barWeight: string;
  useInches: boolean;
};

export const DEFAULT_MOLD_SIZER_INPUT: MoldSizerInput = {
  mode: 'mold',
  length: '',
  width: '',
  height: '',
  barCount: '',
  barWeight: '',
  useInches: false,
};

function parsePositive(value: string): number | null {
  if (value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function toCm(value: number, useInches: boolean): number {
  return useInches ? value * CM_PER_INCH : value;
}

export function suggestOilGramsFromMoldSizer(
  input: MoldSizerInput,
  oilBatchFractionOverride?: number | null,
  weightUnit: WeightUnit = 'g',
): number | null {
  const fraction = oilBatchFractionOverride ?? DEFAULT_OIL_BATCH_FRACTION;

  if (input.mode === 'bars') {
    const barCount = parsePositive(input.barCount);
    const barWeightDisplay = parsePositive(input.barWeight);
    if (barCount === null || barWeightDisplay === null) return null;
    const barWeightGrams = displayValueToGrams(barWeightDisplay, weightUnit);
    return oilGramsFromBarCount(barCount, barWeightGrams, fraction);
  }

  const length = parsePositive(input.length);
  const width = parsePositive(input.width);
  const height = parsePositive(input.height);
  if (length === null || width === null || height === null) return null;

  const volume = rectangularMoldVolumeCm3(
    toCm(length, input.useInches),
    toCm(width, input.useInches),
    toCm(height, input.useInches),
  );
  if (volume === null) return null;
  return oilGramsFromMoldVolumeCm3(volume, { oilBatchFraction: fraction });
}

export { oilBatchFraction };
