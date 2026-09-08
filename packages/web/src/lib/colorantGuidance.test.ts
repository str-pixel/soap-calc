// packages/web/src/lib/colorantGuidance.test.ts
import { describe, expect, it } from 'vitest';
import { colorantGuidanceText, hpWaterText, tsp } from './colorantGuidance';

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

describe('spoon fractions', () => {
  it('reads the small ones as fractions a maker owns, and the big ones as halves', () => {
    expect(tsp(1 / 32)).toBe('¹⁄₃₂');
    expect(tsp(0.03)).toBe('¹⁄₃₂'); // turmeric's sourced low end, not "0"
    expect(tsp(0.125)).toBe('⅛');
    expect(tsp(0.25)).toBe('¼');
    expect(tsp(0.5)).toBe('½');
    expect(tsp(1)).toBe('1');
    expect(tsp(1.5)).toBe('1½');
    expect(tsp(2)).toBe('2');
    expect(tsp(0)).toBe('0');
  });
});

describe('a catalog pick ships its own sourced rate, and no invented weight percent', () => {
  it('renders the entry rate per pound or per kilo, and collapses a single-valued band', () => {
    expect(colorantGuidanceText('mica', 'lb', 'mica')).toBe(
      'About ½–2 tsp per lb of oils — weigh a spoonful once to fix your own percent, and start low.',
    );
    // 1 tsp/lb is about 2 tsp/kg.
    expect(colorantGuidanceText('oxide', 'g', 'iron-oxide')).toBe(
      'About 2 tsp per kg of oils — weigh a spoonful once to fix your own percent, and start low.',
    );
    expect(colorantGuidanceText('dye', 'lb', 'fdc-dye')).toMatch(/^About ¼ tsp per lb of oils/);
  });

  it('says nothing at all for a colour with no defensible rate', () => {
    expect(colorantGuidanceText('natural', 'lb', 'indigo')).toBeNull();
    expect(colorantGuidanceText('natural', 'lb', 'alkanet-root')).toBeNull();
  });

  it('falls back to the kind band for a custom row, which still carries its derived percent', () => {
    expect(colorantGuidanceText('mica', 'lb')).toMatch(/roughly 0\.2–0\.9% by weight/);
  });
});
