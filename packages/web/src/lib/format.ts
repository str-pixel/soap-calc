export function formatGrams(value: number, digits = 1): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

/** Plain numeric string for form inputs (no locale grouping). */
export function formatInputNumber(value: number, digits = 1): string {
  const factor = 10 ** digits;
  return String(Math.round(value * factor) / factor);
}
