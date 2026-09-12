// packages/web/src/lib/computeScentColor.test.ts
import { describe, expect, it } from 'vitest';
import { createEmptyScentColor, normalizeScentColor } from './scentColor';
import { applyScentColorCompliance, computeScentColorGrams } from './computeScentColor';
import { computedScent } from '../testing/scentFixtures';

const scent = normalizeScentColor({
  fragrances: [
    { catalogId: 'lavender', name: 'Vanilla dream', percent: '3', vanillinPercent: '12',
      allergens: [{ name: 'Linalool', percentOfFragrance: '12' }, { name: 'Coumarin', percentOfFragrance: '0.4' }] },
    { name: 'Clove bud', kind: 'essential-oil', percent: '0.5', vanillinPercent: '', allergens: [] },
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
  it('settles the share of the FINISHED product, and lists what the picked oil carries', () => {
    const grams = computeScentColorGrams(scent, { process: 'cp', totalOilGrams: 1000, solutionGrams: 0, deliveredSuperfatPercent: 5 });
    const c = applyScentColorCompliance(grams, { kind: 'label', grams: 1300, perGramOfContents: 1 });
    expect(c.fragrances[0].shareOfProduct).toBeCloseTo(2.31, 2);
    expect(c.fragrances[0].overSafeMax).toBe(false);   // lavender: no ceiling on record
    expect(c.fragrances[0].ceilingPercentOfBasis).toBeNull();
    expect(c.labelAllergens.map((a) => a.name)).toEqual(['Linalool']);
    expect(c.productBasis).toBe('label');
  });
  it('an unknown product weight yields no shares — but what an oil carries does not need one', () => {
    const grams = computeScentColorGrams(scent, { process: 'cp', totalOilGrams: 1000, solutionGrams: 0, deliveredSuperfatPercent: 5 });
    const c = applyScentColorCompliance(grams, { kind: 'batch', grams: null, perGramOfContents: 1 });
    expect(c.fragrances[0].shareOfProduct).toBe(0);
    expect(c.labelAllergens.map((a) => a.name)).toEqual(['Linalool']);
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

describe('the usual-range verdict is settled in pass 1, per process, on the dose as typed', () => {
  const at = (percent: string, process: 'cp' | 'ls') =>
    computedScent({ fragrances: [{ name: 'F', percent }], colorants: [], portions: [] },
      { process, totalOilGrams: 1000, solutionGrams: 3000, productGrams: null }).fragrances[0];
  it('bars past 6% of oil weight, liquid soap past 3% of the solution', () => {
    expect(at('6', 'cp').overUsualRange).toBe(false);
    expect(at('6.1', 'cp').overUsualRange).toBe(true);
    expect(at('3', 'ls').overUsualRange).toBe(false);
    expect(at('3.1', 'ls').overUsualRange).toBe(true);
    expect(at('', 'cp').overUsualRange).toBe(false);
  });
  it('a dose typed past 100 keeps its figure, its grams and its verdicts — the more absurd, the louder', () => {
    const f = at('150', 'cp');
    expect(f.percent).toBe(150);
    expect(f.grams).toBe(1500);
    expect(f.overUsualRange).toBe(true);
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
    expect(applyScentColorCompliance(a, { kind: 'label', grams: 1300, perGramOfContents: 1 })).toBe(a);
  });
});

describe("a vein's oil is oil the recipe carries", () => {
  it('counts twice the pigment, in the batch weight and in the superfat', () => {
    const mk = (mixedWith: string) => computeScentColorGrams(normalizeScentColor({
      fragrances: [],
      colorants: [{ catalogId: 'mica', name: '', kind: 'mica', percent: '1', portionKey: '', mixedWith }],
      portions: [],
    }), { process: 'cp', totalOilGrams: 1000, solutionGrams: 0, deliveredSuperfatPercent: 5 });

    const oil = mk('oil');
    expect(oil.carrierOilGrams).toBe(10);
    expect(oil.extrasGrams).toBe(20);
    expect(oil.carrierSuperfatShiftPercent).toBeCloseTo(1, 9);

    // 1:2 pigment to oil — the largest single load a colour puts on a recipe, so it is the
    // one that must not go missing from the weight or the superfat.
    const vein = mk('vein');
    expect(vein.carrierOilGrams).toBe(20);
    expect(vein.extrasGrams).toBe(30);
    expect(vein.carrierSuperfatShiftPercent).toBeCloseTo(2, 9);

    // Water and a dusted line carry no oil at all, so they shift nothing.
    for (const mix of ['water', 'dry']) {
      const c = mk(mix);
      expect(c.carrierOilGrams).toBe(0);
      expect(c.extrasGrams).toBe(10);
      expect(c.carrierSuperfatShiftPercent).toBe(0);
    }
  });
});

describe('the batter total counts only shares a colour holds', () => {
  const twoShares = normalizeScentColor({
    fragrances: [],
    colorants: [
      { catalogId: 'mica', name: '', kind: 'mica', percent: '1', portionKey: '#0' },
      { catalogId: 'iron-oxide', name: '', kind: 'oxide', percent: '1', portionKey: '#1' },
    ],
    portions: [{ name: 'A', percent: '70' }, { name: 'B', percent: '70' }],
  });

  it('adds them up and flags over-100 where there IS a batter', () => {
    const cp = computeScentColorGrams(twoShares, { process: 'cp', totalOilGrams: 1000, solutionGrams: 0, deliveredSuperfatPercent: 5 });
    expect(cp.portionsTotalPercent).toBe(140);
    expect(cp.portionsOver100).toBe(true);
  });

  it('counts nothing in a liquid soap, which has no batter to divide', () => {
    // The colours already hold no share there; the total must say the same thing, or the
    // over-100 warning describes shares no control in that process can show or reach.
    const ls = computeScentColorGrams(twoShares, { process: 'ls', totalOilGrams: 1000, solutionGrams: 3000, deliveredSuperfatPercent: 2 });
    expect(ls.colorants.map((c) => c.portionKey)).toEqual(['', '']);
    expect(ls.portionsTotalPercent).toBe(0);
    expect(ls.portionsOver100).toBe(false);
  });
});

describe('which oil accelerates trace', () => {
  const row = (over: Record<string, unknown>) => computeScentColorGrams(normalizeScentColor({
    fragrances: [{ name: '', percent: '3', ...over }],
    colorants: [], portions: [],
  }), { process: 'cp', totalOilGrams: 1000, solutionGrams: 0, deliveredSuperfatPercent: 5 });

  it('is the catalog\'s answer for an oil picked from it', () => {
    expect(row({ catalogId: 'cinnamon' }).fragrances[0].caution).toBe(true);
    expect(row({ catalogId: 'clove' }).fragrances[0].caution).toBe(true);
    expect(row({ catalogId: 'lavender' }).fragrances[0].caution).toBe(false);
  });

  it('falls back to the name only for an oil the maker named themselves', () => {
    expect(row({ name: 'Clove bud' }).fragrances[0].caution).toBe(true);
    expect(row({ name: 'Lavender' }).fragrances[0].caution).toBe(false);
    // A picked lavender stays calm even if the maker had typed something else first: the
    // pick is the fact, not the leftover text.
    expect(row({ catalogId: 'lavender', name: 'Cinnamon' }).fragrances[0].caution).toBe(false);
  });
});

describe('what a picked oil carries, and what it may be dosed at', () => {
  const at = (id: string, percent: string) => applyScentColorCompliance(
    computeScentColorGrams(normalizeScentColor({ fragrances: [{ catalogId: id, name: '', percent }], colorants: [], portions: [] }),
      { process: 'cp', totalOilGrams: 1000, solutionGrams: 0, deliveredSuperfatPercent: 5 }),
  { kind: 'label', grams: 1300, perGramOfContents: 1 },
  );

  it('reads the allergens off the catalog and lists them for the label, once each', () => {
    const c = at('grapefruit', '2');
    expect(c.fragrances[0].allergenNames).toEqual(['Limonene', 'Citral', 'Geraniol']);
    expect(c.labelAllergens.map((a) => a.name)).toEqual(['Limonene', 'Citral', 'Geraniol']);
  });

  it('reads the ceiling off the catalog, decides over it once, here, and turns it into the dose basis', () => {
    // Clove: EU law's 0.001% methyl eugenol ÷ 0.1% of the oil → 1.0% of the bar.
    const under = at('clove', '1').fragrances[0];
    expect(under.ceiling).toMatchObject({ percentOfProduct: 1.0, authority: 'EU law', substance: 'Methyl eugenol' });
    expect(under.ceiling!.why).toMatch(/EU law/);
    expect(under.ceilingAboveUsualRange).toBe(false);
    expect(under.overSafeMax).toBe(false);
    // 10 g in a 1300 g bar; the most that fits is 1% × 1290 ÷ 0.99 = 13.03 g → 1.303% of 1000 g oils.
    expect(under.ceilingPercentOfBasis).toBeCloseTo(1.303, 3);
    const over = at('clove', '3').fragrances[0];
    expect(over.shareOfProduct).toBeGreaterThan(1.0);
    expect(over.overSafeMax).toBe(true);
    // and a dose past 100% is over too, not silently nothing
    expect(at('clove', '150').fragrances[0].overSafeMax).toBe(true);
    // the start rides on the row, so the panel does no catalog work per render
    expect(under.startingDose).toEqual({ percent: 0.5, why: expect.stringMatching(/^well under its ceiling/) });
    expect(at('lavender', '1').fragrances[0].startingDose).toMatchObject({ percent: 3 });
    // no ceiling on record → never over, nothing to convert
    const lav = at('lavender', '8').fragrances[0];
    expect(lav.ceiling).toBeNull();
    expect(lav.overSafeMax).toBe(false);
    expect(lav.ceilingPercentOfBasis).toBeNull();
    // a ceiling above the usual range is carried, flagged — in the dose basis — and can still be passed
    const ger = at('geranium', '8').fragrances[0];
    expect(ger.ceiling!.percentOfProduct).toBeCloseTo(15.82, 1);
    expect(ger.ceilingAboveUsualRange).toBe(true);
    expect(ger.overSafeMax).toBe(false);
    expect(at('geranium', '30').fragrances[0].overSafeMax).toBe(true);
  });

  it('the dose-basis figure is solved with the oil in the product, not scaled — and is null before the product weight is known', () => {
    const c = computedScent({ fragrances: [{ catalogId: 'ylang-ylang', name: '', percent: '2' }], colorants: [], portions: [] },
      { process: 'cp', totalOilGrams: 1000, productGrams: null, productBasis: 'batch' });
    expect(c.fragrances[0].ceilingPercentOfBasis).toBeNull();
    // 1.4% of a 1300 g bar that holds 20 g of the oil: 0.014 × 1280 ÷ 0.986 = 18.17 g → 1.817% of oils.
    const known = applyScentColorCompliance(c, { kind: 'label', grams: 1300, perGramOfContents: 1 });
    expect(known.fragrances[0].ceilingPercentOfBasis).toBeCloseTo(1.817, 3);
    // and the maker typing exactly that lands exactly on the ceiling
    const share = (18.17 / (1280 + 18.17)) * 100;
    expect(share).toBeCloseTo(1.4, 2);
  });

  it('in liquid soap the polysorbate that rides with the dose is counted, so the printed figure can be typed', () => {
    // 1000 g solution, tea tree 3% with a superfat → 30 g oil + 30 g polysorbate in the bottle.
    const c = computedScent({ fragrances: [{ catalogId: 'tea-tree', name: '', percent: '3' }], colorants: [], portions: [] },
      { process: 'ls', totalOilGrams: 500, solutionGrams: 1000, deliveredSuperfatPercent: 5, productGrams: 1000 });
    const f = c.fragrances[0];
    expect(f.polysorbateGrams).toBe(30);
    expect(f.extrasPerGramOfOil).toBe(1);
    // rest 940 g; g = 0.01 × 940 ÷ (1 − 0.02) = 9.59 g → 0.959% of the solution
    expect(f.ceilingPercentOfBasis).toBeCloseTo(0.959, 3);
    // and the figure is the same with the dose field empty — the ratio is known before a dose is
    const empty = computedScent({ fragrances: [{ catalogId: 'tea-tree', name: '', percent: '' }], colorants: [], portions: [] },
      { process: 'ls', totalOilGrams: 500, solutionGrams: 1000, deliveredSuperfatPercent: 5, productGrams: 940 });
    expect(empty.fragrances[0].ceilingPercentOfBasis).toBeCloseTo(f.ceilingPercentOfBasis!, 6);
    // retyping that figure lands on the ceiling, not over it
    const g = (f.ceilingPercentOfBasis! / 100) * 1000;
    expect((100 * g) / (940 + 2 * g)).toBeCloseTo(1.0, 3);
  });

  it('…and so is the preservative dosed on the whole pot, so the figure is exact for the bottle', () => {
    // The same bottle with a 1% w/w preservative: the pot is 1000 ÷ 0.99 = 1010.1 g and grows
    // by 2 ÷ 0.99 g for every gram of oil (oil + polysorbate, then the preservative on both).
    const s = 1 / 0.99;
    const c = computedScent({ fragrances: [{ catalogId: 'tea-tree', name: '', percent: '3' }], colorants: [], portions: [] },
      { process: 'ls', totalOilGrams: 500, solutionGrams: 1000, deliveredSuperfatPercent: 5, productGrams: 1000 * s, productPerGramOfContents: s });
    const f = c.fragrances[0];
    const g = (f.ceilingPercentOfBasis! / 100) * 1000;
    const rest = 1000 * s - 60 * s;
    expect((100 * g) / (rest + 2 * g * s)).toBeCloseTo(1.0, 6);
  });

  it('an oil the maker named carries nothing the app can vouch for', () => {
    const c = applyScentColorCompliance(
      computeScentColorGrams(normalizeScentColor({ fragrances: [{ name: 'Mine', percent: '3' }], colorants: [], portions: [] }),
        { process: 'cp', totalOilGrams: 1000, solutionGrams: 0, deliveredSuperfatPercent: 5 }),
    { kind: 'label', grams: 1300, perGramOfContents: 1 },
    );
    expect(c.fragrances[0].allergenNames).toEqual([]);
    expect(c.labelAllergens).toEqual([]);
  });
});
