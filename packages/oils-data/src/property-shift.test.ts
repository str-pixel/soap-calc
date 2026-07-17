import { describe, expect, it } from 'vitest';
import { maxAbsShift, propertyShift, PROPERTY_SHIFT_THRESHOLD } from './property-shift.js';

const LEGACY_AVOCADO = { oleic: 58, stearic: 2, linoleic: 12, palmitic: 20 };
const FDC_AVOCADO = { oleic: 71, linoleic: 13, palmitic: 11, palmitoleic: 3, stearic: 1, linolenic: 1 };
const RECONCILED_AVOCADO = { oleic: 57, linoleic: 18, palmitic: 15, palmitoleic: 8, stearic: 1, linolenic: 1 };

describe('propertyShift', () => {
  it('reports non-zero per-property deltas, largest first', () => {
    const shifts = propertyShift(LEGACY_AVOCADO, FDC_AVOCADO);
    expect(shifts[0].property).toBe('condition'); // biggest mover
    expect(shifts.find((s) => s.property === 'hardness')).toMatchObject({ before: 22, after: 12, delta: -10 });
    expect(shifts.every((s) => s.delta !== 0)).toBe(true);
  });

  it('flags the FDC single-source outlier (condition +18 exceeds the threshold)', () => {
    expect(maxAbsShift(propertyShift(LEGACY_AVOCADO, FDC_AVOCADO))).toBeGreaterThanOrEqual(
      PROPERTY_SHIFT_THRESHOLD,
    );
  });

  it('does NOT flag the reconciled 4-variety mean (moderate shift, under threshold)', () => {
    expect(maxAbsShift(propertyShift(LEGACY_AVOCADO, RECONCILED_AVOCADO))).toBeLessThan(
      PROPERTY_SHIFT_THRESHOLD,
    );
  });

  it('treats a missing legacy profile as all-zero (a pure gap-fill is a full shift)', () => {
    const shifts = propertyShift(undefined, RECONCILED_AVOCADO);
    expect(shifts.find((s) => s.property === 'condition')!.before).toBe(0);
  });
});
