import { describe, expect, it } from 'vitest';
import { LS_SOLUTION_DENSITY_G_PER_ML, lsBottleCount, lsFinishedVolumeMl } from './ls-yield.js';

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
