import { describe, expect, it } from 'vitest';
import {
  applyOilWasteFactor,
  cylinderMoldVolumeCm3,
  DEFAULT_OIL_BATCH_FRACTION,
  oilBatchFraction,
  oilGramsFromBarCount,
  oilGramsFromMoldVolumeCm3,
  rectangularMoldVolumeCm3,
} from './mold-sizer.js';

describe('mold-sizer', () => {
  it('computes rectangular mold volume', () => {
    expect(rectangularMoldVolumeCm3(20, 10, 5)).toBe(1000);
    expect(rectangularMoldVolumeCm3(0, 10, 5)).toBeNull();
  });

  it('suggests oil grams from mold volume', () => {
    const volume = rectangularMoldVolumeCm3(20, 10, 5)!;
    expect(oilGramsFromMoldVolumeCm3(volume)).toBeCloseTo(
      volume * 0.92 * DEFAULT_OIL_BATCH_FRACTION,
      5,
    );
  });

  it('suggests oil grams from bar count', () => {
    expect(oilGramsFromBarCount(10, 100)).toBeCloseTo(10 * 100 * DEFAULT_OIL_BATCH_FRACTION, 5);
  });

  it('derives oil batch fraction', () => {
    expect(oilBatchFraction(650, 1000)).toBe(0.65);
    expect(oilBatchFraction(1000, 900)).toBeNull();
  });

  it('applies waste factor to suggested oil grams', () => {
    expect(applyOilWasteFactor(1000, 5)).toBeCloseTo(1050, 5);
    expect(applyOilWasteFactor(1000, 0)).toBe(1000);
    expect(applyOilWasteFactor(1000, 60)).toBeNull();
  });

  it('cylinder volume is π r² h', () => {
    expect(cylinderMoldVolumeCm3(4, 10)).toBeCloseTo(Math.PI * 16 * 10);
    expect(cylinderMoldVolumeCm3(0, 10)).toBeNull();
    expect(cylinderMoldVolumeCm3(4, 0)).toBeNull();
    expect(cylinderMoldVolumeCm3(-1, 10)).toBeNull();
    expect(cylinderMoldVolumeCm3(Infinity, 10)).toBeNull();
  });

  it('feeds oilGramsFromMoldVolumeCm3 like a rectangular volume', () => {
    const volume = cylinderMoldVolumeCm3(4, 10)!;
    expect(oilGramsFromMoldVolumeCm3(volume)).toBeCloseTo(
      volume * 0.92 * DEFAULT_OIL_BATCH_FRACTION,
      5,
    );
  });
});
