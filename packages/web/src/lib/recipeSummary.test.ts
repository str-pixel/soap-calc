import { expect, test } from 'vitest';
import { buildAddOrderSteps, buildFullRecipe } from './recipeSummary';

/** Flatten the sectioned manifest for ordering assertions that span sections. */
const flat = (sections: ReturnType<typeof buildFullRecipe>) => sections.flatMap((s) => s.items);

const OILS = [
  { oilId: 'olive-oil', weightGrams: 300 },
  { oilId: 'coconut-oil', weightGrams: 100 },
  { oilId: 'ignored', weightGrams: 0 },
];

test('buildFullRecipe lists weighted oils (weight · %), then alkali, water, and additives', () => {
  const items = flat(buildFullRecipe({
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
  }));

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
  const items = flat(buildFullRecipe({
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
  }));
  const names = items.map((i) => i.name);
  expect(names).toContain('Sodium hydroxide (NaOH)');
  expect(names).toContain('Potassium hydroxide (KOH, 30%)');
});

test('buildFullRecipe uses plain "Water" and KOH for liquid soap', () => {
  const items = flat(buildFullRecipe({
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
  }));
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
  // Pinned to the END rather than an index — LS gained a step when "combine and cook" split
  // into blend-to-trace + cook, so an at-trace liquid has somewhere to go before the cook.
  expect(ls[ls.length - 1]).toContain('Bottle and rest 1–2 weeks');
  expect(ls.join(' ')).toContain('blend to trace');

  const hp = buildAddOrderSteps({
    process: 'hp', lyeType: 'naoh', totalOilGrams: 400, lyeGrams: 56, waterGrams: 130, weightUnit: 'g',
  });
  expect(hp.join(' ')).toContain('cook to a thick, translucent paste');
});

test('buildFullRecipe omits the blend share when kohBlendPercent is missing', () => {
  const items = flat(buildFullRecipe({
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
  }));
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

test('an in-lye solvent row (glycerin) gets the heat-to-dissolve note, not the scorch caution', () => {
  const steps = buildAddOrderSteps({
    ...CP_BASE,
    splitLiquidRows: [{ row: SPLIT({ presetKey: 'glycerin', name: 'Glycerin', addAt: 'lye' }), grams: 200 }],
  });
  const step = steps.find((s) => s.includes('Glycerin'))!;
  expect(step.toLowerCase()).toContain('heat');
  expect(step.toLowerCase()).not.toContain('scorch');
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

test('LS steps add the liquid at trace, before the cook — never to the diluted soap', () => {
  // The cook is what sterilises a sugary liquid, and the dilution stage is plain distilled
  // water only; an at-trace liquid that landed after dilution would contradict both the
  // panel guidance and the dilution math (which counts its water as already in the paste).
  const steps = buildAddOrderSteps({
    ...CP_BASE, process: 'ls', splitLiquidRows: [{ row: SPLIT(), grams: 200 }],
  });
  const idx = steps.findIndex((s) => s.includes('goat milk'));
  expect(steps[idx].toLowerCase()).toContain('at trace');
  expect(idx).toBeLessThan(steps.findIndex((s) => s.includes('Cook to a thick')));
  expect(idx).toBeLessThan(steps.findIndex((s) => s.includes('Dilute the paste')));
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

test('the Post-cook superfat section is last, and only exists when one is set in the calculator', () => {
  const input: Parameters<typeof buildFullRecipe>[0] = {
    lines: OILS,
    recipeOilWeightGrams: 400,
    weightUnit: 'g',
    lyeType: 'naoh',
    naohGrams: 0,
    kohGrams: 0,
    lyeGrams: 56.7,
    waterGrams: 132,
    additives: [
      { key: 'a', catalogId: 'sugar', name: 'Sugar', amount: 3, unit: 'percent', basis: 'oil', grams: 12, addAt: 'trace' },
    ],
    process: 'hp',
  };

  const without = buildFullRecipe(input);
  expect(without.some((s) => s.heading === 'Post-cook superfat')).toBe(false);

  const sections = buildFullRecipe({
    ...input,
    postCookSuperfat: {
      oils: [{ oilId: 'coconut-oil', percentOfOil: 5, grams: 20 }],
      percentOfOil: 5,
      grams: 20,
    },
  });
  const last = sections[sections.length - 1];
  // Last section — the final material to touch the batch, after the trace additives.
  expect(last.heading).toBe('Post-cook superfat');
  expect(last.items[0].detail).toBe('20 g · 5% of oil');
});

test('buildFullRecipe opens with the soaping temperature when provided, in °C (°F)', () => {
  const items = flat(buildFullRecipe({
    lines: OILS,
    recipeOilWeightGrams: 400,
    weightUnit: 'g',
    lyeType: 'naoh',
    naohGrams: 0,
    kohGrams: 0,
    lyeGrams: 56.7,
    waterGrams: 132,
    additives: [],
    soapingTempF: 125,
    process: 'cp',
  }));
  expect(items[0]).toEqual({ name: 'Soaping temperature', detail: '52 °C (125 °F)' });
});

test('buildFullRecipe has no temperature line when soapingTempF is omitted', () => {
  const items = flat(buildFullRecipe({
    lines: OILS,
    recipeOilWeightGrams: 400,
    weightUnit: 'g',
    lyeType: 'naoh',
    naohGrams: 0,
    kohGrams: 0,
    lyeGrams: 56.7,
    waterGrams: 132,
    additives: [],
    process: 'cp',
  }));
  expect(items.some((i) => i.name === 'Soaping temperature')).toBe(false);
});

test('buildFullRecipe runs in procedure order: oils-stage, water, in-water additives, lye, trace, after cook', () => {
  const items = flat(buildFullRecipe({
    lines: OILS,
    recipeOilWeightGrams: 400,
    weightUnit: 'g',
    lyeType: 'naoh',
    naohGrams: 0,
    kohGrams: 0,
    lyeGrams: 56.7,
    waterGrams: 132,
    additives: [
      { key: 't', catalogId: 'sugar', name: 'Sugar', amount: 3, unit: 'percent', basis: 'oil', grams: 12, addAt: 'trace' },
      { key: 'l', catalogId: 'citric-acid', name: 'Citric acid', amount: 1, unit: 'percent', basis: 'oil', grams: 4, addAt: 'lye' },
      { key: 'o', catalogId: 'clay', name: 'Kaolin clay', amount: 1, unit: 'percent', basis: 'oil', grams: 4, addAt: 'oils' },
    ],
    process: 'cp',
  }));
  const names = items.map((i) => i.name);
  const at = (name: string) => names.indexOf(name);
  // With-oils items ride with the oils block, before the water.
  expect(at('Kaolin clay')).toBeGreaterThan(at('Olive Oil'));
  expect(at('Kaolin clay')).toBeLessThan(at('Distilled water'));
  // Water first, its dissolved additives next, THEN the lye goes in.
  expect(at('Distilled water')).toBeLessThan(at('Citric acid'));
  expect(at('Citric acid')).toBeLessThan(at('Sodium hydroxide (NaOH)'));
  // Trace items follow the lye.
  expect(at('Sugar')).toBeGreaterThan(at('Sodium hydroxide (NaOH)'));
});

test('an in-lye alternative liquid lists with the water, before the alkali', () => {
  const row = {
    key: 'x', name: 'Goat milk', presetKey: 'milk', addAt: 'lye',
    mode: 'percent', percent: '50', grams: '',
  } as never;
  const items = flat(buildFullRecipe({
    lines: OILS,
    recipeOilWeightGrams: 400,
    weightUnit: 'g',
    lyeType: 'naoh',
    naohGrams: 0,
    kohGrams: 0,
    lyeGrams: 56.7,
    waterGrams: 66,
    additives: [],
    splitLiquidRows: [{ row, grams: 66 }],
    process: 'cp',
  }));
  const names = items.map((i) => i.name);
  expect(names.indexOf('Goat milk')).toBeGreaterThan(names.indexOf('Distilled water'));
  expect(names.indexOf('Goat milk')).toBeLessThan(names.indexOf('Sodium hydroxide (NaOH)'));
});

test('buildFullRecipe groups the manifest under soap-book section headings', () => {
  const sections = buildFullRecipe({
    lines: OILS,
    recipeOilWeightGrams: 400,
    weightUnit: 'g',
    lyeType: 'naoh',
    naohGrams: 0,
    kohGrams: 0,
    lyeGrams: 56.7,
    waterGrams: 132,
    additives: [
      { key: 't', catalogId: 'sugar', name: 'Sugar', amount: 3, unit: 'percent', basis: 'oil', grams: 12, addAt: 'trace' },
      { key: 'l', catalogId: 'citric-acid', name: 'Citric acid', amount: 1, unit: 'percent', basis: 'oil', grams: 4, addAt: 'lye' },
    ],
    postCookSuperfat: {
      oils: [{ oilId: 'coconut-oil', percentOfOil: 5, grams: 20 }],
      percentOfOil: 5,
      grams: 20,
    },
    soapingTempF: 125,
    process: 'hp',
  });

  expect(sections.map((s) => s.heading)).toEqual([
    null, // the leading soaping-temperature line carries no heading
    'Oils',
    'Lye solution',
    'At trace',
    'Post-cook superfat', // empty stages (On top, After cook) are omitted
  ]);

  const byHeading = (h: string | null) => sections.find((s) => s.heading === h)!.items;
  expect(byHeading(null)[0]).toEqual({ name: 'Soaping temperature', detail: '52 °C (125 °F)' });
  // Lye solution reads water → dissolved additives → alkali, stage suffix now carried
  // by the heading, not the line.
  expect(byHeading('Lye solution').map((i) => i.name)).toEqual([
    'Distilled water',
    'Citric acid',
    'Sodium hydroxide (NaOH)',
  ]);
  expect(byHeading('Lye solution')[1].detail).toBe('4 g');
  expect(byHeading('At trace')[0]).toEqual({ name: 'Sugar', detail: '12 g' });
  // The PCSF line loses its parenthetical — the heading says what it is.
  expect(byHeading('Post-cook superfat')[0].name).not.toContain('post-cook');
  expect(byHeading('Post-cook superfat')[0].detail).toBe('20 g · 5% of oil');
});

test('a reserved PCSF section line still says it comes from the oils above', () => {
  const sections = buildFullRecipe({
    lines: OILS,
    recipeOilWeightGrams: 400,
    weightUnit: 'g',
    lyeType: 'naoh',
    naohGrams: 0,
    kohGrams: 0,
    lyeGrams: 56.7,
    waterGrams: 132,
    additives: [],
    postCookSuperfat: { oils: [{ oilId: 'coconut-oil', percentOfOil: 5, grams: 20 }], percentOfOil: 5, grams: 20 },
    pcsfIsExtra: false,
    process: 'hp',
  });
  const pcsf = sections.find((s) => s.heading === 'Post-cook superfat')!;
  expect(pcsf.items[0].detail).toBe('20 g · 5% of oil · from oils above');
});

test('the after-cook section heading is process-aware — LS says After dilution', () => {
  const sections = buildFullRecipe({
    lines: OILS,
    recipeOilWeightGrams: 400,
    weightUnit: 'g',
    lyeType: 'koh',
    naohGrams: 0,
    kohGrams: 0,
    lyeGrams: 80,
    waterGrams: 132,
    additives: [
      { key: 'a', catalogId: 'fragrance', name: 'Fragrance', amount: 3, unit: 'percent', basis: 'oil', grams: 12, addAt: 'after_cook' },
    ],
    process: 'ls',
  });
  expect(sections.map((s) => s.heading)).toContain('After dilution');
});
