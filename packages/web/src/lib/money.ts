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
  // Filter on rounded cents so a sub-cent part can't print as "$0.00".
  const entries = order.filter(
    (name) => Number.isFinite(parts[name]) && Math.round(parts[name] * 100) > 0,
  );
  if (entries.length === 0) return null;
  return entries.map((name) => `${name} ${formatMoney(parts[name], currencySymbol)}`).join(' · ');
}

export function formatMoney(amount: number, currencySymbol: string): string {
  // Round the MAGNITUDE so half-cents land symmetrically for both signs
  // (Math.round(-2.5) would round toward +∞), and decide the sign on the rounded
  // cents so -0.004 prints "$0.00", never "-$0.00".
  const cents = Math.round(Math.abs(amount) * 100);
  const sign = amount < 0 && cents > 0 ? '-' : '';
  const body = (cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${sign}${currencySymbol}${body}`;
}

export function pricePerGram(priceStr: string, unit: PriceUnit): number | null {
  // Defense-in-depth: a prototype-chain 'entry' would hand us undefined here.
  if (typeof priceStr !== 'string' || priceStr.trim() === '') return null;
  const value = Number(priceStr);
  if (!Number.isFinite(value) || value < 0) return null;
  const gramsPerUnit = WEIGHT_UNITS[unit].gramsPerUnit;
  return value / gramsPerUnit;
}
