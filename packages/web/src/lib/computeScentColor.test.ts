// packages/web/src/lib/computeScentColor.test.ts
import { describe, expect, it } from 'vitest';
import { createEmptyScentColor, normalizeScentColor } from './scentColor';
import { applyScentColorCompliance, computeScentColorGrams } from './computeScentColor';

const scent = normalizeScentColor({
  fragrances: [
    { name: 'Vanilla dream', percent: '3', supplierMaxPercent: '2', vanillinPercent: '12',
      allergens: [{ name: 'Linalool', percentOfFragrance: '12' }, { name: 'Coumarin', percentOfFragrance: '0.4' }] },
    { name: 'Clove bud', kind: 'essential-oil', percent: '0.5', supplierMaxPercent: '', vanillinPercent: '', allergens: [] },
  ],
  colorants: [
    { name: 'Yellow oxide', kind: 'oxide', percent: '1', portionKey: '' },
    { name: 'Blue mica', kind: 'mica', percent: '1', portionKey: '#0' },
    { name: 'Glitter', kind: 'other', percent: '', portionKey: '' },
  ],
  portions: [{ name: 'Swirl', percent: '40' }],
});

describe('computeScentColorGrams (CP, 1000 g oils)', () => {
  const c = computeScentColorGrams(scent, { process: 'cp', totalOilGrams: 1000, solutionGrams: 0, deliveredSuperfatPercent: 5 });
  it('doses fragrance on the oils, stabilizer at 1:1 above 10% vanillin, and flags the clove EO', () => {
    expect(c.fragrances[0].grams).toBe(30);
    expect(c.fragrances[0].stabilizerGrams).toBe(30);
    expect(c.fragrances[0].browning).toBe('deep');
    expect(c.fragrances[0].stage).toBe('trace');
    expect(c.fragrances[1].caution).toBe(true);
    expect(c.fragrances[1].grams).toBe(5);
    expect(c.polysorbateGrams).toBe(0); // CP: no polysorbate
  });
  it('doses a whole-batter colour on all the oils and a portion colour on its share; "to shade" has no grams', () => {
    expect(c.colorants[0]).toMatchObject({ grams: 10, stage: 'oils', dispersal: { method: 'carrier-oil', carrierGrams: 10 } });
    expect(c.colorants[1]).toMatchObject({ grams: 4, stage: 'trace', portionName: 'Swirl', portionPercent: 40 });
    expect(c.colorants[2]).toMatchObject({ grams: null, stage: 'oils' });
  });
  it('sums the extras and the carrier superfat shift', () => {
    expect(c.carrierOilGrams).toBe(14);
    expect(c.carrierSuperfatShiftPercent).toBeCloseTo(1.4, 6);
    expect(c.extrasGrams).toBe(30 + 5 + 30 + 10 + 4 + 14);
    expect(c.portionsOver100).toBe(false);
  });
});

describe('applyScentColorCompliance', () => {
  it('compares the share of the FINISHED product to the supplier max and lists allergens above 0.01%', () => {
    const grams = computeScentColorGrams(scent, { process: 'cp', totalOilGrams: 1000, solutionGrams: 0, deliveredSuperfatPercent: 5 });
    const c = applyScentColorCompliance(grams, 1300, 'label');
    expect(c.fragrances[0].shareOfProduct).toBeCloseTo(2.31, 2);
    expect(c.fragrances[0].overSupplierMax).toBe(true);   // 2.31% of product > 2% max
    expect(c.fragrances[1].overSupplierMax).toBe(false);  // no max entered
    expect(c.labelAllergens.map((a) => a.name)).toEqual(['Linalool']);
    expect(c.productBasis).toBe('label');
  });
  it('an unknown product weight yields no shares and no allergen list', () => {
    const grams = computeScentColorGrams(scent, { process: 'cp', totalOilGrams: 1000, solutionGrams: 0, deliveredSuperfatPercent: 5 });
    const c = applyScentColorCompliance(grams, null, 'batch');
    expect(c.fragrances[0].shareOfProduct).toBe(0);
    expect(c.labelAllergens).toEqual([]);
  });
});

describe('LS', () => {
  it('doses fragrance on the solution, adds polysorbate 20 under a superfat, sends every colorant after dilution', () => {
    const c = computeScentColorGrams(scent, { process: 'ls', totalOilGrams: 1000, solutionGrams: 3000, deliveredSuperfatPercent: 2 });
    expect(c.fragrances[0].grams).toBe(90);
    expect(c.fragrances[0].stage).toBe('after_cook');
    expect(c.fragrances[1].grams).toBe(15); // 0.5% of 3000 g
    expect(c.polysorbateGrams).toBe(105); // equal parts to 90 g + 15 g
    expect(c.colorants.every((x) => x.stage === 'after_cook')).toBe(true);
    expect(c.colorants[0].dispersal).toEqual({ method: 'into-solution' });
    expect(c.carrierOilGrams).toBe(0);
  });
  it('is 0 g without a dilution', () => {
    const c = computeScentColorGrams(scent, { process: 'ls', totalOilGrams: 1000, solutionGrams: 0, deliveredSuperfatPercent: 2 });
    expect(c.fragranceGrams).toBe(0);
  });
});

describe('portion shares', () => {
  const mk = (percent: string) => normalizeScentColor({
    fragrances: [], colorants: [{ name: 'Mica', kind: 'mica', percent: '1', portionKey: '#0' }],
    portions: [{ name: 'Swirl', percent }],
  });
  const ctx = { process: 'cp' as const, totalOilGrams: 1000, solutionGrams: 0, deliveredSuperfatPercent: 5 };
  it('a linked portion with a blank or zero share doses nothing — never the whole batter', () => {
    expect(computeScentColorGrams(mk(''), ctx).colorants[0]).toMatchObject({ grams: null, stage: 'trace', portionName: 'Swirl' });
    expect(computeScentColorGrams(mk('0'), ctx).colorants[0].grams).toBeNull();
  });
  it('a single oversize portion is seen and flagged; the dose is capped at the whole oils', () => {
    const scent = normalizeScentColor({ fragrances: [], colorants: [{ name: 'Mica', kind: 'mica', percent: '1', portionKey: '#0' }], portions: [{ name: 'Swirl', percent: '100' }] });
    scent.portions[0].percent = '150'; // typed live; normalization clamps only on load
    const c = computeScentColorGrams(scent, ctx);
    expect(c.portions[0].percent).toBe(150);
    expect(c.portionsOver100).toBe(true);
    expect(c.colorants[0].grams).toBe(10);
  });
});

describe('HP dispersal follows the stage', () => {
  it('a whole-batter colour goes straight into the oils; a portion colour into hot sugar water', () => {
    const scentHp = normalizeScentColor({
      fragrances: [],
      colorants: [
        { name: 'Red oxide', kind: 'oxide', percent: '1', portionKey: '' },
        { name: 'Blue mica', kind: 'mica', percent: '1', portionKey: '#0' },
      ],
      portions: [{ name: 'Top', percent: '30' }],
    });
    const c = computeScentColorGrams(scentHp, { process: 'hp', totalOilGrams: 1000, solutionGrams: 0, deliveredSuperfatPercent: 3 });
    expect(c.colorants[0]).toMatchObject({ stage: 'oils', dispersal: { method: 'recipe-oil' } });
    expect(c.colorants[1]).toMatchObject({ stage: 'after_cook', dispersal: { method: 'hot-sugar-water' } });
  });
});

describe('the shares are totalled across the colours that hold them', () => {
  it('two colours at 70% each total 140% and flag over-100', () => {
    // A share belongs to a colour, so an unclaimed one no longer exists to be counted.
    const scentP = normalizeScentColor({
      fragrances: [],
      colorants: [
        { name: 'A', kind: 'mica', percent: '1', portionKey: '#0' },
        { name: 'B', kind: 'mica', percent: '1', portionKey: '#1' },
      ],
      portions: [{ name: 'A', percent: '70' }, { name: 'B', percent: '70' }],
    });
    const c = computeScentColorGrams(scentP, { process: 'cp', totalOilGrams: 1000, solutionGrams: 0, deliveredSuperfatPercent: 5 });
    expect(c.portionsTotalPercent).toBe(140);
    expect(c.portionsOver100).toBe(true);
  });
});

describe('a supplier max of 0 is "not entered", so the prompt fires instead of every check going quiet', () => {
  it('reads 0 as null', () => {
    const s0 = normalizeScentColor({ fragrances: [{ name: 'F', percent: '5', supplierMaxPercent: '0', vanillinPercent: '', allergens: [] }], colorants: [], portions: [] });
    const c = computeScentColorGrams(s0, { process: 'cp', totalOilGrams: 1000, solutionGrams: 0, deliveredSuperfatPercent: 5 });
    expect(c.fragrances[0].supplierMaxPercent).toBeNull();
  });
});

describe('a colour on a portion with no share says what is missing', () => {
  it('portionShareMissing is set only when a dose was typed and the linked portion has no share', () => {
    const mk = (portionPercent: string, dose: string) => normalizeScentColor({
      fragrances: [], colorants: [{ name: 'Mica', kind: 'mica', percent: dose, portionKey: '#0' }],
      portions: [{ name: 'Swirl', percent: portionPercent }],
    });
    const ctx = { process: 'cp' as const, totalOilGrams: 1000, solutionGrams: 0, deliveredSuperfatPercent: 5 };
    expect(computeScentColorGrams(mk('', '1'), ctx).colorants[0].portionShareMissing).toBe(true);
    expect(computeScentColorGrams(mk('', ''), ctx).colorants[0].portionShareMissing).toBe(false);
    expect(computeScentColorGrams(mk('40', '1'), ctx).colorants[0].portionShareMissing).toBe(false);
  });
});

describe('an empty section is one shared object', () => {
  it('returns the same identity across calls and through the compliance pass', () => {
    const a = computeScentColorGrams(createEmptyScentColor(), { process: 'cp', totalOilGrams: 1000, solutionGrams: 0, deliveredSuperfatPercent: 5 });
    const b = computeScentColorGrams(createEmptyScentColor(), { process: 'ls', totalOilGrams: 500, solutionGrams: 3000, deliveredSuperfatPercent: 0 });
    expect(a).toBe(b);
    expect(applyScentColorCompliance(a, 1300, 'label')).toBe(a);
  });
});
