export function formatGrams(value: number, digits = 1): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

/** Plain numeric string for form inputs (no locale grouping). */
export function formatInputNumber(value: number, digits = 1): string {
  const factor = 10 ** digits;
  return String(Math.round(value * factor) / factor);
}

/** The dilution target's ONE display rule, shared by DilutionPanel and BatchSheet so the
 * on-screen and printed figures cannot disagree (the old per-surface interpolation put
 * "22.5%" and "23%" on the same sheet). One decimal — the precision every neighbouring
 * figure uses, and finer than the dilution math's own honesty; also keeps a computed
 * value from ever printing at full float precision. */
export function formatConcentrationPercent(value: number): string {
  return formatGrams(value, 1);
}
