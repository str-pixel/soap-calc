import { expect, test } from 'vitest';
import { buildAddOrderSteps, buildFullRecipe } from './recipeSummary';

const OILS = [
  { oilId: 'olive-oil', weightGrams: 300 },
  { oilId: 'coconut-oil', weightGrams: 100 },
  { oilId: 'ignored', weightGrams: 0 },
];

test('buildFullRecipe lists weighted oils (weight · %), then alkali, water, and additives', () => {
  const items = buildFullRecipe({
    lines: OILS,
    recipeOilWeightGrams: 400,
    weightUnit: 'g',
    lyeType: 'naoh',
    naohGrams: 0,
    kohGrams: 0,
    lyeGrams: 56.7,
    waterGrams: 132,
    additives: [
      { key: 'a', catalogId: 'fragrance', name: 'Fragrance', amount: 3, unit: 'percent', basis: 'oil', grams: 12, addAt: 'trace' },
    ],
    process: 'cp',
  });

  // The 0 g line is dropped: 2 oils + NaOH + water + 1 additive.
  expect(items).toHaveLength(5);
  // Percent uses up to 1 decimal (trailing .0 trimmed); weights are whole grams, matching
  // the app's other figures.
  expect(items[0].detail).toContain('75%'); // 300 / 400
  const names = items.map((i) => i.name);
  expect(names).toContain('Sodium hydroxide (NaOH)');
  expect(names).toContain('Distilled water');
  expect(names).toContain('Fragrance');
  expect(items.find((i) => i.name === 'Sodium hydroxide (NaOH)')?.detail).toContain('57 g');
  expect(items.find((i) => i.name === 'Fragrance')?.detail).toContain('12 g');
});

test('buildFullRecipe names both alkalis for dual lye', () => {
  const items = buildFullRecipe({
    lines: [{ oilId: 'olive-oil', weightGrams: 400 }],
    recipeOilWeightGrams: 400,
    weightUnit: 'g',
    lyeType: 'dual',
    naohGrams: 40,
    kohGrams: 17,
    lyeGrams: 57,
    kohBlendPercent: '30',
    waterGrams: 130,
    additives: [],
    process: 'cp',
  });
  const names = items.map((i) => i.name);
  expect(names).toContain('Sodium hydroxide (NaOH)');
  expect(names).toContain('Potassium hydroxide (KOH, 30%)');
});

test('buildFullRecipe uses plain "Water" and KOH for liquid soap', () => {
  const items = buildFullRecipe({
    lines: [{ oilId: 'olive-oil', weightGrams: 400 }],
    recipeOilWeightGrams: 400,
    weightUnit: 'g',
    lyeType: 'koh',
    naohGrams: 0,
    kohGrams: 0,
    lyeGrams: 90,
    waterGrams: 270,
    additives: [],
    process: 'ls',
  });
  const names = items.map((i) => i.name);
  expect(names).toContain('Potassium hydroxide (KOH)');
  expect(names).toContain('Water');
  expect(names).not.toContain('Distilled water');
});

test('buildAddOrderSteps quotes the batch weights and keeps lye-into-water for CP', () => {
  const steps = buildAddOrderSteps({
    process: 'cp',
    lyeType: 'naoh',
    totalOilGrams: 400,
    lyeGrams: 56.7,
    waterGrams: 132,
    weightUnit: 'g',
  });
  expect(steps).toHaveLength(5);
  expect(steps[0]).toContain('400 g');
  expect(steps[1]).toContain('57 g'); // 56.7 rounds to whole grams
  expect(steps[1]).toContain('132 g');
  expect(steps[1]).toContain('NaOH');
  expect(steps[1]).toMatch(/add the lye to the water \(never the reverse\)/);
  expect(steps[4]).toContain('cure 4–6 weeks');
});

test('buildAddOrderSteps switches copy for liquid soap and hot process', () => {
  const ls = buildAddOrderSteps({
    process: 'ls', lyeType: 'koh', totalOilGrams: 400, lyeGrams: 90, waterGrams: 270, weightUnit: 'g',
  });
  expect(ls[1]).toContain('KOH');
  expect(ls[4]).toContain('Bottle and rest 1–2 weeks');

  const hp = buildAddOrderSteps({
    process: 'hp', lyeType: 'naoh', totalOilGrams: 400, lyeGrams: 56, waterGrams: 130, weightUnit: 'g',
  });
  expect(hp.join(' ')).toContain('cook to a thick, translucent paste');
});

test('buildFullRecipe omits the blend share when kohBlendPercent is missing', () => {
  const items = buildFullRecipe({
    lines: [{ oilId: 'olive-oil', weightGrams: 400 }],
    recipeOilWeightGrams: 400,
    weightUnit: 'g',
    lyeType: 'dual',
    naohGrams: 40,
    kohGrams: 17,
    lyeGrams: 57,
    waterGrams: 130,
    additives: [],
    process: 'cp',
  });
  const names = items.map((i) => i.name);
  expect(names).toContain('Potassium hydroxide (KOH)');
  expect(names.some((n) => n.includes('0%'))).toBe(false);
});

test('buildAddOrderSteps derives CP unmold/cure timing from the estimates when provided', () => {
  const steps = buildAddOrderSteps({
    process: 'cp',
    lyeType: 'naoh',
    totalOilGrams: 400,
    lyeGrams: 56.7,
    waterGrams: 132,
    weightUnit: 'g',
    unmoldText: '≈ 11–34 h',
    cureText: '≈ 5–7.5 weeks',
  });
  expect(steps[4]).toBe('Pour into the mold; unmold ≈ 11–34 h and cure ≈ 5–7.5 weeks.');
  expect(steps[4]).not.toContain('24–48');
});

test('buildAddOrderSteps keeps the generic CP timing copy when estimates are unavailable', () => {
  const steps = buildAddOrderSteps({
    process: 'cp', lyeType: 'naoh', totalOilGrams: 400, lyeGrams: 56.7, waterGrams: 132, weightUnit: 'g',
  });
  expect(steps[4]).toContain('unmold in 24–48 h and cure 4–6 weeks');
});

const SPLIT = (
  over: Partial<import('./recipe').SplitLiquidRow> = {},
): import('./recipe').SplitLiquidRow => ({
  key: 'row-1',
  presetKey: '',
  name: 'goat milk',
  customWaterPercent: '',
  sizeMode: 'percent_of_oils',
  amount: '20',
  addAt: 'trace',
  ...over,
});
const CP_BASE = {
  process: 'cp' as const, lyeType: 'naoh' as const, totalOilGrams: 1000,
  lyeGrams: 138, waterGrams: 330, weightUnit: 'g' as const,
};

test('CP steps blend the alternative liquid in at trace, before fragrance', () => {
  const steps = buildAddOrderSteps({ ...CP_BASE, splitLiquidRows: [{ row: SPLIT(), grams: 200 }] });
  const idx = steps.findIndex((s) => s.includes('goat milk'));
  expect(steps[idx]).toContain('200 g');
  expect(steps[idx].toLowerCase()).toContain('trace');
  expect(idx).toBeLessThan(steps.findIndex((s) => s.includes('fragrance')));
});

test('CP steps stir an in-lye liquid into the cooled lye solution, with a sugar caution for sugary presets', () => {
  const steps = buildAddOrderSteps({
    ...CP_BASE,
    splitLiquidRows: [{ row: SPLIT({ presetKey: 'milk', name: 'Milk (dairy or plant)', addAt: 'lye' }), grams: 200 }],
  });
  const step = steps.find((s) => s.includes('Milk (dairy or plant)'))!;
  expect(step).toContain('cooled lye solution');
  expect(step.toLowerCase()).toContain('scorch');
});

test('CP steps blend a with-oils liquid into the oils before the lye goes in', () => {
  const steps = buildAddOrderSteps({ ...CP_BASE, splitLiquidRows: [{ row: SPLIT({ addAt: 'oils' }), grams: 200 }] });
  const idx = steps.findIndex((s) => s.includes('goat milk'));
  expect(steps[idx].toLowerCase()).toContain('oils');
  expect(idx).toBeLessThan(steps.findIndex((s) => s.includes('lye solution into the oils')));
});

test('HP steps stir the liquid into the cooked paste, without repeating "after the cook"', () => {
  const steps = buildAddOrderSteps({
    ...CP_BASE, process: 'hp', splitLiquidRows: [{ row: SPLIT(), grams: 200 }],
  });
  const idx = steps.findIndex((s) => s.includes('goat milk'));
  expect(steps[idx].toLowerCase()).toContain('cooked paste');
  expect(steps[idx].toLowerCase()).not.toContain('after the cook');
  expect(idx).toBeGreaterThan(steps.findIndex((s) => s.includes('cook to a thick')));
});

test('LS steps add the liquid to the diluted soap', () => {
  const steps = buildAddOrderSteps({
    ...CP_BASE, process: 'ls', splitLiquidRows: [{ row: SPLIT(), grams: 200 }],
  });
  const idx = steps.findIndex((s) => s.includes('goat milk'));
  expect(steps[idx].toLowerCase()).toContain('diluted soap');
  expect(idx).toBeGreaterThan(steps.findIndex((s) => s.includes('Dilute the paste')));
});

test('steps are unchanged when there are no rows or only zero-gram rows', () => {
  const base = buildAddOrderSteps(CP_BASE);
  expect(buildAddOrderSteps({ ...CP_BASE, splitLiquidRows: [] })).toEqual(base);
  expect(buildAddOrderSteps({ ...CP_BASE, splitLiquidRows: [{ row: SPLIT(), grams: 0 }] })).toEqual(base);
});

test('two rows at different stages both appear, each at its position', () => {
  const steps = buildAddOrderSteps({
    ...CP_BASE,
    splitLiquidRows: [
      { row: SPLIT({ name: 'aloe juice', addAt: 'oils', key: 'row-a' }), grams: 50 },
      { row: SPLIT({ name: 'goat milk', addAt: 'trace', key: 'row-b' }), grams: 150 },
    ],
  });
  const aloeIdx = steps.findIndex((s) => s.includes('aloe juice'));
  const milkIdx = steps.findIndex((s) => s.includes('goat milk'));
  expect(aloeIdx).toBeGreaterThan(-1);
  expect(milkIdx).toBeGreaterThan(-1);
  expect(aloeIdx).toBeLessThan(steps.findIndex((s) => s.includes('lye solution into the oils')));
  expect(milkIdx).toBeGreaterThan(steps.findIndex((s) => s.includes('blend to light trace')));
});
