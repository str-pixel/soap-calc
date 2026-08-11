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

/** The soap concentration's ONE display rule, shared by DilutionPanel and BatchSheet so the
 * on-screen and printed figures cannot disagree (the old per-surface interpolation put
 * "22.5%" and "23%" on the same sheet). One decimal — the precision every neighbouring
 * figure uses, and finer than the dilution math's own honesty; also keeps a computed
 * value from ever printing at full float precision.
 *
 * `digits` admits exactly one exception, and only because the arithmetic demands it:
 * Gradual dilution DERIVES a concentration from the water the maker recorded and writes it
 * back at TWO decimals (core's gradualDilutionFrom — at 1 dp the mass recovered from the
 * written percent sits up to ~8 g from what was actually poured, which moves a preservative
 * dose). A readout for that record has to print what was written, so it asks for 2 here
 * rather than reaching past this module for formatGrams — which is what it did until this
 * correction, leaving the app's one display rule with a caller quietly working around it.
 * Everything that displays a TARGET takes the default. */
export function formatConcentrationPercent(value: number, digits: 1 | 2 = 1): string {
  return formatGrams(value, digits);
}
