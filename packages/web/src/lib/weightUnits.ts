export type WeightUnit = 'g' | 'kg' | 'oz' | 'lb';

export const WEIGHT_UNITS: Record<
  WeightUnit,
  { label: string; short: string; gramsPerUnit: number; inputStep: number; displayDigits: number }
> = {
  g: { label: 'Grams', short: 'g', gramsPerUnit: 1, inputStep: 1, displayDigits: 0 },
  kg: { label: 'Kilograms', short: 'kg', gramsPerUnit: 1000, inputStep: 0.001, displayDigits: 3 },
  oz: { label: 'Ounces', short: 'oz', gramsPerUnit: 28.349523125, inputStep: 0.1, displayDigits: 1 },
  lb: { label: 'Pounds', short: 'lb', gramsPerUnit: 453.59237, inputStep: 0.01, displayDigits: 2 },
};

export const WEIGHT_UNIT_OPTIONS = (Object.keys(WEIGHT_UNITS) as WeightUnit[]).map((id) => ({
  id,
  label: WEIGHT_UNITS[id].label,
  short: WEIGHT_UNITS[id].short,
}));

export function isWeightUnit(value: unknown): value is WeightUnit {
  // Own-key check: `in` walks the prototype chain, so 'toString' etc. would pass
  // and turn every weight into NaN downstream (see process.isProcessVariantId).
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(WEIGHT_UNITS, value);
}

export function gramsToDisplayValue(grams: number, unit: WeightUnit): number {
  return grams / WEIGHT_UNITS[unit].gramsPerUnit;
}

export function displayValueToGrams(value: number, unit: WeightUnit): number {
  return value * WEIGHT_UNITS[unit].gramsPerUnit;
}

export function isCompleteNumericInput(value: string): boolean {
  if (value === '' || value === '-') return false;
  if (value.endsWith('.')) return false;
  return Number.isFinite(Number(value));
}

export function gramsStringToInputDisplay(gramsStr: string, unit: WeightUnit): string {
  if (gramsStr === '') return '';
  const grams = Number(gramsStr);
  if (!Number.isFinite(grams) || grams < 0) return '';
  const converted = gramsToDisplayValue(grams, unit);
  const digits = WEIGHT_UNITS[unit].displayDigits;
  const factor = 10 ** digits;
  return String(Math.round(converted * factor) / factor);
}

/** Line-field display: like gramsStringToInputDisplay, but keeps a single decimal in
 * gram mode so a fractional line (from the exact batch-target landing) stays visible and
 * round-trips instead of being silently re-rounded on the next edit. Whole values render
 * bare. */
export function gramsStringToLineDisplay(gramsStr: string, unit: WeightUnit): string {
  if (gramsStr === '') return '';
  const grams = Number(gramsStr);
  if (!Number.isFinite(grams) || grams < 0) return '';
  const converted = gramsToDisplayValue(grams, unit);
  const digits = Math.max(WEIGHT_UNITS[unit].displayDigits, unit === 'g' ? 1 : 0);
  const factor = 10 ** digits;
  return String(Math.round(converted * factor) / factor);
}

/** Returns null when the display value cannot be committed (invalid or still being typed). */
export function parseInputDisplayToGrams(
  displayStr: string,
  unit: WeightUnit,
): string | null {
  if (displayStr === '') return '';
  if (!isCompleteNumericInput(displayStr)) return null;
  const value = Number(displayStr);
  if (!Number.isFinite(value) || value < 0) return null;
  if (value === 0) return '';
  const grams = displayValueToGrams(value, unit);
  return String(Math.round(grams * 10) / 10);
}


export function parsePercentInput(value: string): string | null {
  if (value === '') return '';
  if (!isCompleteNumericInput(value)) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  // An oil can't exceed 100% of the total: cap it visibly (the field shows 100) rather
  // than rejecting the commit, which used to snap the field back to its old value silently.
  if (n > 100) return '100';
  return value;
}

/** The units a maker's own scale actually reads, for the dilution panel's local switch.
 * kg is excluded on purpose: no kitchen scale defaults to it, and a dilution figure in
 * kg reads as a rounding error (2.4 kg hides the 400 g). A kg-mode recipe therefore
 * falls back to grams here — see DilutionPanel's initial unit. */
export const DILUTION_UNIT_OPTIONS = (['g', 'oz', 'lb'] as const).map((id) => ({
  id: id as WeightUnit,
  short: WEIGHT_UNITS[id].short,
}));

export function formatWeight(grams: number, unit: WeightUnit, digits?: number): string {
  const config = WEIGHT_UNITS[unit];
  const value = gramsToDisplayValue(grams, unit);
  // Magnitude-aware precision. displayDigits is tuned for batch-scale figures (0 in gram
  // mode), where dropping the fraction costs 0.03% on a 1,234.6 g figure. On a DOSE it
  // costs everything: 0.3 g rendered "0 g" is a 100% error, and 0.5 g rendered "1 g" is a
  // 100% overstatement — reachable at salt's own 0.05% typical low on the default recipe.
  // Same shape as gramsStringToLineDisplay above, which already forks a 1-decimal gram
  // variant for exactly this reason. Exact integers still render bare
  // (minimumFractionDigits: 0), so batch-scale output is byte-identical.
  const d =
    digits ??
    (value > 0 && value < 10 ? Math.max(config.displayDigits, 1) : config.displayDigits);
  return `${value.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: d,
  })} ${config.short}`;
}
