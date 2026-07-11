import type { DoseBasis, DoseUnit } from '@soap-calc/core';
import { formatGrams } from './format';

/** Human dose label, e.g. "5% of oil", "1% of batch", "3 ppt of oil". */
export function formatDose(amount: number, basis: DoseBasis, unit: DoseUnit): string {
  const basisWord = basis === 'batch' ? 'batch' : basis === 'solution' ? 'solution' : 'oil';
  const value = formatGrams(amount, 1);
  return unit === 'ppt' ? `${value} ppt of ${basisWord}` : `${value}% of ${basisWord}`;
}
