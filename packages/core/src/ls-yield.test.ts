import { describe, expect, it } from 'vitest';
import { LS_SOLUTION_DENSITY_G_PER_ML, lsBottleCount, lsFinishedVolumeMl, lsPartialDilution } from './ls-yield.js';

describe('ls-yield', () => {
  it('finished volume = grams / density; bottles floor to whole', () => {
    expect(lsFinishedVolumeMl(1030)).toBeCloseTo(1000); // 1030 g / 1.03
    expect(lsBottleCount(1030, 250)).toBe(4); // 1000 ml / 250 = 4
    expect(lsBottleCount(1030, 0)).toBeNull();
  });

  it('accepts a custom density override', () => {
    expect(lsFinishedVolumeMl(1000, 1)).toBeCloseTo(1000);
    expect(lsBottleCount(1000, 500, 1)).toBe(2);
  });

  it('guards non-positive/non-finite solution grams and bottle size', () => {
    expect(lsFinishedVolumeMl(0)).toBeNull();
    expect(lsFinishedVolumeMl(-5)).toBeNull();
    expect(lsFinishedVolumeMl(Infinity)).toBeNull();
    expect(lsBottleCount(0, 250)).toBeNull();
    expect(lsBottleCount(1030, -1)).toBeNull();
    expect(lsBottleCount(1030, Infinity)).toBeNull();
  });

  it('exposes the documented density proxy', () => {
    expect(LS_SOLUTION_DENSITY_G_PER_ML).toBe(1.03);
  });
});

describe('lsPartialDilution', () => {
  // A batch: 1,200 g anhydrous, 400 g cook water, 2,400 g dilution water → 4,000 g
  // solution = 3,883 ml at 1.03 g/ml. Paste in hand = anhydrous + cook water = 1,600 g.
  const BATCH = {
    anhydrousGrams: 1200,
    totalWaterGrams: 2800,
    dilutionWaterGrams: 2400,
    solutionGrams: 4000,
  };

  it('scales paste, water and yield linearly to the volume asked for', () => {
    // Half the batch's 3,883 ml.
    const r = lsPartialDilution(BATCH, 1941.7);
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r.fraction).toBeCloseTo(0.5, 3);
    expect(r.pasteGrams).toBeCloseTo(800, 0); // half of 1,600 g paste
    expect(r.waterGrams).toBeCloseTo(1200, 0); // half the dilution water
    expect(r.solutionGrams).toBeCloseTo(2000, 0);
    expect(r.volumeMl).toBeCloseTo(1941.7, 0);
    expect(r.clamped).toBe(false);
  });

  it('clamps to the whole batch when more is asked for than exists', () => {
    const r = lsPartialDilution(BATCH, 99_000);
    expect(r?.fraction).toBe(1);
    expect(r?.pasteGrams).toBeCloseTo(1600, 0);
    expect(r?.waterGrams).toBeCloseTo(2400, 0);
    expect(r?.clamped).toBe(true);
  });

  it('honors a custom density and guards junk input', () => {
    // At 1.0 g/ml the same batch is 4,000 ml, so 2,000 ml is half.
    expect(lsPartialDilution(BATCH, 2000, 1)?.fraction).toBeCloseTo(0.5, 6);
    expect(lsPartialDilution(BATCH, 0)).toBeNull();
    expect(lsPartialDilution(BATCH, Number.NaN)).toBeNull();
    expect(lsPartialDilution({ ...BATCH, solutionGrams: 0 }, 500)).toBeNull();
  });
});
