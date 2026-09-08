// packages/web/src/lib/colorantGuidance.test.ts
import { describe, expect, it } from 'vitest';
import { colorantGuidanceText, hpWaterText } from './colorantGuidance';

describe('guidance renders in the active weight unit', () => {
  it('imperial: tsp per lb; metric: tsp per kg (1 lb = 0.4536 kg → ×2.2, rounded to halves)', () => {
    expect(colorantGuidanceText('mica', 'lb')).toBe('About ½–1 tsp per lb of oils — roughly 0.2–0.9% by weight; density varies by product, start low.');
    expect(colorantGuidanceText('mica', 'kg')).toBe('About 1–2 tsp per kg of oils — roughly 0.2–0.9% by weight; density varies by product, start low.');
    expect(colorantGuidanceText('oxide', 'g')).toBe('About 1–2 tsp per kg of oils — roughly 0.2–0.9% by weight; half or less for brown and red; density varies by product, start low.');
    expect(colorantGuidanceText('oxide', 'lb')).toBe('About ½–1 tsp per lb of oils — roughly 0.2–0.9% by weight; half or less for brown and red; density varies by product, start low.');
    expect(colorantGuidanceText('natural', 'oz')).toBe('About ½–1 tsp per lb of oils — roughly 0.2–0.9% by weight; density varies by product, start low.');
  });
  it('dyes and "other" have no range', () => {
    expect(colorantGuidanceText('dye', 'g')).toBeNull();
    expect(colorantGuidanceText('other', 'lb')).toBeNull();
  });
  it('the HP water figure follows the unit', () => {
    expect(hpWaterText('g')).toBe('7–14 g hot water and a pinch of sugar');
    expect(hpWaterText('oz')).toBe('¼–½ oz hot water and a pinch of sugar');
  });
});
