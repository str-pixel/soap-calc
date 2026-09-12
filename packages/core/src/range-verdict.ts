/**
 * Judging a reading against a guide band.
 *
 * The rule: JUDGE THE NUMBER THE UI PRINTS. The panels display a rounded figure but used to
 * compare the raw one, so a score of 20.4 printed "20" against a band ending at 20 and was
 * flagged "Too high" in the same row — the verdict contradicting the figure
 * beside it. Rounding first closes that gap by construction.
 *
 * It is also the more honest comparison. These scores are fatty-acid sums over supplier
 * profiles that vary between batches; a few tenths of a point is far below what the input
 * data supports, so calling such a reading "out of range" is false precision of exactly the
 * kind this app already refuses when it suppresses range flags under low data coverage.
 */

export type RangeVerdict = 'low' | 'in' | 'high';

/** The value as the UI prints it: rounded to `digits` decimal places. */
export function displayedValue(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * Where a reading falls against a band, decided on the value as displayed at `digits`
 * decimal places — integer scores (digits 0) for bar properties, one decimal (digits 1)
 * for fatty-acid percentages.
 */
export function rangeVerdict(
  value: number,
  low: number,
  high: number,
  digits: number,
): RangeVerdict {
  const shown = displayedValue(value, digits);
  if (shown < low) return 'low';
  if (shown > high) return 'high';
  return 'in';
}
