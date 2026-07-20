import { WEIGHT_UNITS } from './weightUnits';

export type PriceUnit = 'kg' | 'lb';

export interface CostParts {
  materials: number;
  labour: number;
  overhead: number;
  packaging: number;
}

/** One-line batch-cost composition, e.g. "materials $4.50 · overhead $0.90".
 * Components that are zero, negative, or non-finite are omitted; null when nothing remains. */
export function formatCostBreakdown(parts: CostParts, currencySymbol: string): string | null {
  const order: (keyof CostParts)[] = ['materials', 'labour', 'overhead', 'packaging'];
  const entries = order.filter((name) => Number.isFinite(parts[name]) && parts[name] > 0);
  if (entries.length === 0) return null;
  return entries.map((name) => `${name} ${formatMoney(parts[name], currencySymbol)}`).join(' · ');
}

export function formatMoney(amount: number, currencySymbol: string): string {
  // Decide the sign on the rounded cents, not the raw value: -0.004 rounds to
  // zero cents and must not print "-$0.00".
  const cents = Math.round(amount * 100);
  const sign = cents < 0 ? '-' : '';
  const body = (Math.abs(cents) / 100).toLocaleString('en-US', {
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
