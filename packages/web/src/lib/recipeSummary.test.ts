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
