// packages/web/src/lib/colorantGuidance.test.ts
import { describe, expect, it } from 'vitest';
import {
  colorantGuidanceText,
  colorantShadeLadder,
  colorantStabilityText,
  hpWaterText,
  tsp,
} from './colorantGuidance';

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
    // Alkanet's only sourced route is an infusion, measured against the infusing oil.
    expect(colorantGuidanceText('natural', 'lb', 'alkanet-root')).toBeNull();
    expect(colorantGuidanceText('natural', 'lb', 'woad')).toBeNull();
    // Indigo DOES carry one now — three fetched sources agreed on a quarter to a half.
    expect(colorantGuidanceText('natural', 'lb', 'indigo')).toMatch(/^About ¼–½ tsp per lb of oils/);
  });

  it('falls back to the kind band for a custom row, which still carries its derived percent', () => {
    expect(colorantGuidanceText('mica', 'lb')).toMatch(/roughly 0\.2–0\.9% by weight/);
  });
});

describe('the shade ladder and the over-time line', () => {
  it('reads dose to colour, lightest first, in the active unit', () => {
    // The unit is named — a bare "⅛ light grey" is an eighth of nothing.
    expect(colorantShadeLadder('activated-charcoal', 'lb')).toBe(
      'Teaspoons per lb of oils: ⅛ light grey · ½ medium grey · 1 dark grey, faint grey lather · 2 grey-black · 3 black, noticeably grey lather.',
    );
    // Per kilo the same ladder roughly doubles.
    expect(colorantShadeLadder('activated-charcoal', 'g')).toMatch(/^Teaspoons per kg of oils: ¼ light grey · 1 medium grey · 2 dark grey/);
    // Turmeric's low rung survives the conversion instead of rounding to nothing.
    expect(colorantShadeLadder('turmeric', 'lb')).toBe('Teaspoons per lb of oils: ¹⁄₃₂ soft yellow · 1 burnt orange.');
  });

  it('says nothing for a colour with no sourced ladder, or for a custom row', () => {
    expect(colorantShadeLadder('indigo', 'lb')).toBeNull();
    expect(colorantShadeLadder('', 'lb')).toBeNull();
  });

  it('states what months of light and alkali do, where a source says', () => {
    expect(colorantStabilityText('iron-oxide')).toMatch(/Holds its colour/);
    expect(colorantStabilityText('spirulina')).toMatch(/Fades with time and light/);
    expect(colorantStabilityText('mica')).toMatch(/Shifts over the first weeks/);
    // Alkanet arrives grey and turns purple over the cure — a shift, not a fade.
    expect(colorantStabilityText('alkanet-root')).toMatch(/Shifts over the first weeks/);
    // Worded for a bottle as well as a bar: liquid soap is poured, never cut.
    expect(colorantStabilityText('alkanet-root')).not.toMatch(/cut/);
    expect(colorantStabilityText('turmeric')).toMatch(/Fades with time and light/);
    expect(colorantStabilityText('fdc-dye')).toMatch(/Fades/);
    // Not every colour has a sourced answer, and silence is the honest one.
    expect(colorantStabilityText('woad')).toBeNull();
    expect(colorantStabilityText('')).toBeNull();
  });
});
