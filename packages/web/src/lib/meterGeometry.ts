/**
 * Layout helpers for the zoned meters (the Meters view of both result panels).
 */

/** Clamp a reading to a position on the 0–100 track, as a percentage. */
export const trackPct = (n: number): number => Math.max(0, Math.min(100, n));

/** Inside this many track-percent of either edge, a label centred on its marker would
 *  hang off the row and clip (0.5% printed as "5%"). Anchor it to the marker's side instead. */
const EDGE_PCT = 8;

/** Which side of its marker a label should grow from, given the marker's track position. */
export function valueAnchor(pct: number): 'start' | 'middle' | 'end' {
  if (pct < EDGE_PCT) return 'start';
  if (pct > 100 - EDGE_PCT) return 'end';
  return 'middle';
}

/** The class modifier that applies a `valueAnchor` to a `.property-meters__value` label. */
export function valueAnchorClass(pct: number): string {
  const anchor = valueAnchor(pct);
  return anchor === 'middle' ? '' : ` property-meters__value--${anchor}`;
}
