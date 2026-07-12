/** Soap quality scores are fatty-acid sums on a 0–100 scale (percent of oil weight). */
export function formatSoapPropertyPercent(value: number, digits = 1): string {
  const factor = 10 ** digits;
  const rounded = Math.round(value * factor) / factor;
  return `${rounded}%`;
}

export function formatPropertyRangePercent(
  low: number,
  high: number,
  digits = 0,
): string {
  const factor = 10 ** digits;
  const lo = Math.round(low * factor) / factor;
  const hi = Math.round(high * factor) / factor;
  return `${lo}–${hi}%`;
}

/** Bar-property scores are unitless fatty-acid sums on a 0–100 scale. */
export function formatPropertyScore(value: number): string {
  return String(Math.round(value));
}

export function formatPropertyScoreRange(low: number, high: number): string {
  return `${Math.round(low)}–${Math.round(high)}`;
}
