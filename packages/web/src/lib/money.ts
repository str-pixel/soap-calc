import { WEIGHT_UNITS } from './weightUnits';

export type PriceUnit = 'kg' | 'lb';

export function formatMoney(amount: number, currencySymbol: string): string {
  const sign = amount < 0 ? '-' : '';
  const body = Math.abs(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${sign}${currencySymbol}${body}`;
}

export function pricePerGram(priceStr: string, unit: PriceUnit): number | null {
  if (priceStr.trim() === '') return null;
  const value = Number(priceStr);
  if (!Number.isFinite(value) || value < 0) return null;
  const gramsPerUnit = WEIGHT_UNITS[unit].gramsPerUnit;
  return value / gramsPerUnit;
}
