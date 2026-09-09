// packages/web/src/lib/colorantGuidance.test.ts
import { describe, expect, it } from 'vitest';
import {
  colorantGuidanceText,
  colorantShadeLadder,
  colorantStabilityText,
  hpWaterText,
  percentText,
  percentValue,
  tsp,
} from './colorantGuidance';

describe('guidance leads with the percent the dose field takes', () => {
  it('states the percent first and the trade\'s teaspoon figure after it, in the active unit', () => {
    expect(colorantGuidanceText('mica', 'lb')).toBe(
      'About 0.4–1.8% of the oil weight, which is ½–2 tsp per lb. Powders differ in density, so start at the low end, weigh your spoonful once, and go by the scale after that.',
    );
    // Per kilo the spoons roughly double; the percent does not move, because it is a percent.
    expect(colorantGuidanceText('mica', 'g')).toMatch(/^About 0\.4–1\.8% of the oil weight, which is 1–4½ tsp per kg\./);
    // A single-valued band collapses instead of printing the same figure twice.
    expect(colorantGuidanceText('oxide', 'g')).toMatch(/^About 0\.2–1\.8% of the oil weight, which is ½–4½ tsp per kg\./);
    // No dye is named in the catalog any more, but the KIND keeps its band for a custom row.
    expect(colorantGuidanceText('dye', 'lb')).toMatch(/^About 0\.2% of the oil weight, which is ¼ tsp per lb\./);
  });

  it('a custom row and a catalog row of the same family now say the SAME thing', () => {
    // They used to disagree: the oxide fallback said half a teaspoon where the iron oxide
    // entry said one, so one screen carried two answers for one material.
    expect(colorantGuidanceText('oxide', 'g')).toBe(colorantGuidanceText('oxide', 'g', 'iron-oxide'));
    expect(colorantGuidanceText('mica', 'lb')).toBe(colorantGuidanceText('mica', 'lb', 'mica'));
  });

  it('"other" has no range, because glitter and a coated neon are not dosed alike', () => {
    expect(colorantGuidanceText('other', 'lb')).toBeNull();
  });

  it('says nothing at all for a colour with no defensible rate', () => {
    // Alkanet's only sourced route is an infusion, measured against the infusing oil.
    expect(colorantGuidanceText('natural', 'lb', 'alkanet-root')).toBeNull();
    // Indigo DOES carry one — three fetched sources agreed on a quarter to a half.
    expect(colorantGuidanceText('natural', 'lb', 'indigo')).toMatch(/^About 0\.2–0\.4% of the oil weight/);
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

describe('the shade ladder and the over-time line', () => {
  it('reads dose to colour, lightest first, in the active unit', () => {
    // Each rung is a percent, because that is what the dose field takes.
    expect(colorantShadeLadder('activated-charcoal', 'lb')).toBe(
      '0.1% light grey · 0.4% medium grey · 0.9% dark grey, faint grey lather · 1.8% grey-black · 2.6% black, noticeably grey lather. That is ⅛–3 tsp per lb of oils.',
    );
    // The percents do not move with the unit; only the spoons do.
    expect(colorantShadeLadder('activated-charcoal', 'g')).toMatch(/^0\.1% light grey · 0\.4% medium grey/);
    expect(colorantShadeLadder('activated-charcoal', 'g')).toMatch(/That is ¼–6½ tsp per kg of oils\.$/);
    // Turmeric's thirty-second of a teaspoon survives as a typeable figure, not a zero.
    expect(colorantShadeLadder('turmeric', 'lb')).toBe('0.03% soft yellow · 0.9% burnt orange. That is ¹⁄₃₂–1 tsp per lb of oils.');
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
    // Worded for a bottle as well as a bar: liquid soap is poured, never cut. BOTH verdicts
    // — the fades one carried the bar-only wording after its sibling had been fixed.
    expect(colorantStabilityText('alkanet-root')).not.toMatch(/cut/);
    expect(colorantStabilityText('turmeric')).not.toMatch(/cut/);
    expect(colorantStabilityText('turmeric')).toMatch(/Fades with time and light/);
    expect(colorantStabilityText('turmeric')).toMatch(/Fades/);
    // Not every colour has a sourced answer, and silence is the honest one.
    expect(colorantStabilityText('woad')).toBeNull();
    expect(colorantStabilityText('')).toBeNull();
  });
});

describe('a seeded dose keeps the precision the reading round drops', () => {
  it('seeds two decimals, so the gentlest sourced dose is not shaved by rounding', () => {
    expect(percentValue(0.125)).toBe('0.11'); // charcoal's lightest grey
    expect(percentValue(0.25)).toBe('0.22');
    expect(percentValue(0.5)).toBe('0.44');
    expect(percentValue(1)).toBe('0.88');
    // and the display still rounds for reading — a tenth is enough on screen
    expect(percentText(0.125)).toBe('0.1');
    expect(percentText(0.5)).toBe('0.4');
    expect(percentText(1)).toBe('0.9');
  });

  it('drops a trailing zero rather than seeding "1.80" into a number field', () => {
    expect(percentValue(2)).toBe('1.76');
    expect(percentValue(0.03)).toBe('0.03');
  });
});
