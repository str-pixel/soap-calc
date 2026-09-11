/**
 * The app's one rule for printing a quantity: digits with no thousands separator, a
 * decimal point, trailing zeros dropped — "2100 g", "1249.5 g", never "2,100 g". ISO
 * 80000-1 (Quantities and units — General; https://www.iso.org/obp/ui/#iso:std:iso:80000:-1:ed-1:v1:en,
 * read 2026-09-11) allows digits to be separated into groups of three but says that
 * "neither dots nor commas are inserted in the spaces between groups" — a comma is a
 * decimal sign in most of Europe, and a grouped "1,200" typed back into a number field
 * commits as 1.2 (the trap DilutionPanel documents). The app groups nothing at all, which
 * the standard also permits. The unit follows after a space, as the SI Brochure (9th
 * edition, chapter 5) requires: "a space is always used to separate the unit from the
 * number" — so "2100 g", not "2100g". Money keeps its own conventions in money.ts.
 */
export function formatGrams(value: number, digits = 1): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
    useGrouping: false,
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

/** "a", "a and b", "a, b and c" — the app's one list conjunction, for naming things in
 * prose (step copy, batch-weight notes, dilution guidance). */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
