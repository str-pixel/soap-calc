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
  return typeof value === 'string' && value in WEIGHT_UNITS;
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
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return value;
}

export function formatWeight(grams: number, unit: WeightUnit, digits?: number): string {
  const config = WEIGHT_UNITS[unit];
  const value = gramsToDisplayValue(grams, unit);
  const d = digits ?? config.displayDigits;
  return `${value.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: d,
  })} ${config.short}`;
}
