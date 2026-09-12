/**
 * Radar geometry shared by the two radars. Axes start at twelve o'clock and run clockwise.
 */
export const radarAngle = (i: number, n: number): number =>
  (-90 + (i * 360) / n) * (Math.PI / 180);

export const radarPoint = (
  cx: number,
  cy: number,
  i: number,
  n: number,
  radius: number,
): { x: number; y: number } => ({
  x: cx + radius * Math.cos(radarAngle(i, n)),
  y: cy + radius * Math.sin(radarAngle(i, n)),
});

/**
 * The ring band of a band-fitted radar, as fractions of the outer radius. Every axis maps
 * its own typical range onto this same annulus, so "in range" reads as "on the ring"
 * whatever the range's size in percent.
 */
export const RING_INNER = 0.5;
export const RING_OUTER = 0.72;

/** Overshoot above a band runs to the rim over at least this many points, so a hairline
 *  band (0–1%) does not fling a 2% reading to the edge. */
const OVERSHOOT_MIN = 5;

/**
 * Where a value sits on an axis whose typical band is fitted to the ring, as a fraction of
 * the outer radius. In band: linearly across the ring, inner edge at `low`, outer at `high`.
 * Below: linearly from the hub (0) to the inner edge; a band starting at 0 has no "below",
 * so 0 sits on the inner edge, in range. Above: linearly from the outer edge to the rim,
 * reaching it at `high + max(band width, OVERSHOOT_MIN)` and clamped there.
 */
export function fitRadius(value: number, low: number, high: number): number {
  if (value <= low) {
    return low > 0 ? RING_INNER * (value / low) : RING_INNER;
  }
  if (value <= high) {
    const width = high - low;
    return width > 0 ? RING_INNER + (RING_OUTER - RING_INNER) * ((value - low) / width) : RING_OUTER;
  }
  const span = Math.max(high - low, OVERSHOOT_MIN);
  return RING_OUTER + (1 - RING_OUTER) * Math.min(1, (value - high) / span);
}
