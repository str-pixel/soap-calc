// packages/core/src/numeric.ts
/** One number guard for the package: a finite number, not null, not NaN. */
export const finite = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n);

/**
 * A value rounded at a scale — 10 for tenths, 100 for hundredths, 2 for half points — the
 * way the caller says. The epsilon absorbs binary noise on both sides: 1.1 × 10 is
 * 11.000000000000002 and must not ceil to 12; 1.45 × 10 is 14.499999999999998 and must
 * round to 15, as it would on paper.
 */
export function roundScaled(value: number, scale: number, direction: 'down' | 'up' | 'nearest'): number {
  const eps = 1e-9;
  const x = value * scale;
  const n = direction === 'down' ? Math.floor(x + eps) : direction === 'up' ? Math.ceil(x - eps) : Math.round(x + eps);
  return n / scale;
}
