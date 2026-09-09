import { expect, test } from 'vitest';
import { computedScent } from '../testing/scentFixtures';
import { applyScentColorCompliance, computeScentColorGrams } from './computeScentColor';
import { addOrderStepPlan, buildAddOrderSteps, buildFullRecipe, postCookSuperfatLineDetail } from './recipeSummary';
import { normalizeScentColor } from './scentColor';

/** Flatten the sectioned manifest for ordering assertions that span sections. */
const flat = (sections: ReturnType<typeof buildFullRecipe>) => sections.flatMap((s) => s.items);

const OILS = [
  { oilId: 'olive-oil', weightGrams: 300 },
  { oilId: 'coconut-oil', weightGrams: 100 },
  { oilId: 'ignored', weightGrams: 0 },
];

/** The canonical two-oil recipe the buildFullRecipe tests vary from — each test spreads
 * this and states only what it changes, so a base-field change is made once. */
const FULL_RECIPE_BASE: Parameters<typeof buildFullRecipe>[0] = {
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
};

test('buildFullRecipe lists weighted oils (weight · %), the lye solution, and additives', () => {
  const items = flat(buildFullRecipe({
    ...FULL_RECIPE_BASE,
    additives: [
      { key: 'a', catalogId: 'fragrance', name: 'Fragrance', amount: 3, unit: 'percent', basis: 'oil', grams: 12, addAt: 'trace' },
    ],
  }));

  // The 0 g line is dropped: 2 oils + NaOH + water + 1 additive.
  expect(items).toHaveLength(5);
  // Percent uses up to 1 decimal (trailing .0 trimmed); weights are whole grams, matching
  // the app's other figures.
  expect(items.find((i) => i.name === 'Olive Oil')?.detail).toContain('75%'); // 300 / 400
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
  // CP makes the lye solution first (it needs the cooling time), then weighs the oils.
  expect(steps[0]).toContain('57 g'); // 56.7 rounds to whole grams
  expect(steps[0]).toContain('132 g');
  expect(steps[0]).toContain('NaOH');
  expect(steps[0]).toMatch(/add the lye to the water \(never the reverse\)/);
  expect(steps[1]).toContain('400 g');
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
    ...FULL_RECIPE_BASE,
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
      isExtra: true, method: 'append', deliveredSuperfatPercent: null,
    },
  });
  const last = sections[sections.length - 1];
  // Last section — the final material to touch the batch, after the trace additives.
  expect(last.heading).toBe('Post-cook superfat');
  expect(last.items[0].detail).toBe('20 g · 5% of oil');
});

test('buildFullRecipe opens with the soaping temperature when provided, in °C (°F)', () => {
  const items = flat(buildFullRecipe({
    ...FULL_RECIPE_BASE,
    soapingTempF: 125,
  }));
  expect(items[0]).toEqual({ name: 'Soaping temperature', detail: '52 °C (125 °F)' });
});

test('buildFullRecipe has no temperature line when soapingTempF is omitted', () => {
  const items = flat(buildFullRecipe({
    ...FULL_RECIPE_BASE,
  }));
  expect(items.some((i) => i.name === 'Soaping temperature')).toBe(false);
});

test('buildFullRecipe runs in procedure order: oils-stage, water, in-water additives, lye, trace, after cook', () => {
  // HP: the oils-first process (CP makes the lye solution first — see the section-order test).
  const items = flat(buildFullRecipe({
    ...FULL_RECIPE_BASE,
    process: 'hp',
    additives: [
      { key: 't', catalogId: 'sugar', name: 'Sugar', amount: 3, unit: 'percent', basis: 'oil', grams: 12, addAt: 'trace' },
      { key: 'l', catalogId: 'citric-acid', name: 'Citric acid', amount: 1, unit: 'percent', basis: 'oil', grams: 4, addAt: 'lye' },
      { key: 'o', catalogId: 'clay', name: 'Kaolin clay', amount: 1, unit: 'percent', basis: 'oil', grams: 4, addAt: 'oils' },
    ],
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

test('an in-lye alternative liquid lists AFTER the alkali — it joins the finished solution', () => {
  // The procedure step in this same file directs in-lye liquids into the (cooled) lye
  // solution — sugars scorch under raw lye — so the manifest must not imply pouring the
  // alkali onto the liquid. Only dry in-lye additives dissolve in the water first.
  const row = {
    key: 'x', name: 'Goat milk', presetKey: 'milk', addAt: 'lye',
    mode: 'percent', percent: '50', grams: '',
  } as never;
  const items = flat(buildFullRecipe({
    ...FULL_RECIPE_BASE,
    waterGrams: 66,
    splitLiquidRows: [{ row, grams: 66 }],
  }));
  const names = items.map((i) => i.name);
  expect(names.indexOf('Goat milk')).toBeGreaterThan(names.indexOf('Sodium hydroxide (NaOH)'));
});

test('buildFullRecipe groups the manifest under soap-book section headings', () => {
  const sections = buildFullRecipe({
    ...FULL_RECIPE_BASE,
    additives: [
      { key: 't', catalogId: 'sugar', name: 'Sugar', amount: 3, unit: 'percent', basis: 'oil', grams: 12, addAt: 'trace' },
      { key: 'l', catalogId: 'citric-acid', name: 'Citric acid', amount: 1, unit: 'percent', basis: 'oil', grams: 4, addAt: 'lye' },
    ],
    postCookSuperfat: {
      oils: [{ oilId: 'coconut-oil', percentOfOil: 5, grams: 20 }],
      percentOfOil: 5,
      grams: 20,
      isExtra: true, method: 'append', deliveredSuperfatPercent: null,
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
    ...FULL_RECIPE_BASE,
    postCookSuperfat: { oils: [{ oilId: 'coconut-oil', percentOfOil: 5, grams: 20 }], percentOfOil: 5, grams: 20, isExtra: false, method: 'subtract', deliveredSuperfatPercent: null },
    process: 'hp',
  });
  const pcsf = sections.find((s) => s.heading === 'Post-cook superfat')!;
  // "from oils above" says where the grams come from; "(lye reduced)" re-establishes the
  // dropped explanation for why the printed lye figures run below SAP-table math.
  expect(pcsf.items[0].detail).toBe('20 g · 5% of oil · from oils above (lye reduced)');
});

test('the after-cook section heading is process-aware — LS says After dilution', () => {
  const sections = buildFullRecipe({
    ...FULL_RECIPE_BASE,
    lyeType: 'koh',
    lyeGrams: 80,
    additives: [
      { key: 'a', catalogId: 'fragrance', name: 'Fragrance', amount: 3, unit: 'percent', basis: 'oil', grams: 12, addAt: 'after_cook' },
    ],
    process: 'ls',
  });
  expect(sections.map((s) => s.heading)).toContain('After dilution');
});

test('a solvent in-lye liquid (glycerin) lists BEFORE the alkali — it is what the alkali dissolves into', () => {
  const row = {
    key: 'g', name: 'Glycerin', presetKey: 'glycerin', addAt: 'lye',
    mode: 'percent', percent: '50', grams: '',
  } as never;
  const items = flat(buildFullRecipe({
    ...FULL_RECIPE_BASE,
    process: 'ls',
    lyeType: 'koh',
    lyeGrams: 80,
    splitLiquidRows: [{ row, grams: 220 }],
  }));
  const names = items.map((i) => i.name);
  expect(names.indexOf('Glycerin')).toBeGreaterThan(names.indexOf('Water'));
  expect(names.indexOf('Glycerin')).toBeLessThan(names.indexOf('Potassium hydroxide (KOH)'));
});

test('a PCSF line with no applied state at all fails safe — it never claims a reserve', () => {
  // Only a type-bypassing caller can get here; if one does, "extra weight" is the harmless
  // reading and "from oils above (lye reduced)" the harmful one.
  expect(postCookSuperfatLineDetail({ grams: 20, percentOfOil: 5 }, 'g', undefined as never)).toBe(
    '20 g · 5% of oil',
  );
});

test('section order follows the process: CP makes the lye solution first, HP and LS heat the oils first', () => {
  const headings = (process: 'cp' | 'hp' | 'ls', lyeType: 'naoh' | 'koh') =>
    buildFullRecipe({ ...FULL_RECIPE_BASE, process, lyeType, soapingTempF: 125 }).map((s) => s.heading);
  expect(headings('cp', 'naoh')).toEqual([null, 'Lye solution', 'Oils']);
  expect(headings('hp', 'naoh')).toEqual([null, 'Oils', 'Lye solution']);
  expect(headings('ls', 'koh')).toEqual([null, 'Oils', 'Lye solution']);
});

test('CP steps make the lye solution first, quoting the menu temperature, then the oils', () => {
  const steps = buildAddOrderSteps({ ...CP_BASE, soapingTempF: 125 });
  expect(steps[0]).toContain('NaOH');
  expect(steps[0]).toContain('cool to 52 °C (125 °F)');
  expect(steps[1]).toContain('1,000 g');
  expect(steps[1]).toContain('warm to 52 °C (125 °F)');
  expect(steps.join(' ')).not.toContain('38–43');
});

test('CP steps keep a generic temperature band only when no menu temperature is given', () => {
  const steps = buildAddOrderSteps(CP_BASE);
  expect(steps[0]).toContain('NaOH');
  expect(steps[0]).toContain('38–43 °C');
});

const ADDITIVE = (name: string, addAt: 'lye' | 'oils' | 'trace' | 'top' | 'after_cook') => ({
  key: name, catalogId: name.toLowerCase(), name, amount: 1, unit: 'percent' as const,
  basis: 'oil' as const, grams: 10, addAt,
});

test('CP steps name each additive at the stage the Full recipe files it under', () => {
  const steps = buildAddOrderSteps({
    ...CP_BASE,
    additives: [ADDITIVE('Citric acid', 'lye'), ADDITIVE('Kaolin clay', 'oils'), ADDITIVE('Sugar', 'trace'), ADDITIVE('Dried petals', 'top')],
  });
  const lye = steps.find((s) => s.includes('NaOH'))!;
  expect(lye).toMatch(/stir .*Citric acid.* into the water/);
  expect(steps.find((s) => s.includes('warm to'))).toContain('Kaolin clay');
  expect(steps.find((s) => s.includes('at trace'))).toContain('Sugar');
  expect(steps.find((s) => s.includes('Pour into the mold'))).toContain('Dried petals');
  // Nothing generic survives beside a named additive.
  expect(steps.join(' ')).not.toContain('any additives');
});

test('HP steps put in-lye additives before the alkali and after-cook additives after the cook', () => {
  const steps = buildAddOrderSteps({
    process: 'hp', lyeType: 'naoh', totalOilGrams: 1000, lyeGrams: 138, waterGrams: 330, weightUnit: 'g',
    additives: [ADDITIVE('Table salt', 'lye'), ADDITIVE('Fragrance', 'after_cook'), ADDITIVE('Sugar', 'trace')],
  });
  expect(steps.find((s) => s.includes('NaOH'))).toMatch(/stir .*Table salt.* into the water/);
  expect(steps.find((s) => s.includes('After the cook'))).toContain('Fragrance');
  expect(steps.find((s) => s.includes('cook to a thick'))).toContain('Sugar');
});

test('LS steps name after-dilution additives in the dilution step, never in the paste', () => {
  const steps = buildAddOrderSteps({
    process: 'ls', lyeType: 'koh', totalOilGrams: 1000, lyeGrams: 200, waterGrams: 400, weightUnit: 'g',
    additives: [ADDITIVE('Fragrance', 'after_cook'), ADDITIVE('Sugar', 'lye')],
  });
  expect(steps.find((s) => s.includes('Dilute'))).toContain('Fragrance');
  expect(steps.find((s) => s.includes('KOH'))).toMatch(/stir .*Sugar.* into the water/);
});

test('every process hosts every additive stage in exactly one step, and every liquid slot once', () => {
  for (const process of ['cp', 'hp', 'ls'] as const) {
    const plan = addOrderStepPlan(process);
    const hosted = plan.flatMap((step) => step.hosts).sort();
    expect(hosted, process).toEqual(['after_cook', 'lye', 'oils', 'top', 'trace']);
    const slots = plan.flatMap((step) => step.liquids.map((l) => l.slot)).sort();
    expect(slots, process).toEqual(['lye_after_alkali', 'lye_before_alkali', 'oils', 'trace']);
  }
});

test('a solvent in-lye liquid (glycerin) is weighed with the water BEFORE the alkali step, in CP and LS', () => {
  const glycerin = { row: SPLIT({ presetKey: 'glycerin', name: 'Glycerin', addAt: 'lye' }), grams: 220 };
  const cp = buildAddOrderSteps({ ...CP_BASE, splitLiquidRows: [glycerin] });
  expect(cp.findIndex((s) => s.includes('Glycerin'))).toBeLessThan(cp.findIndex((s) => s.includes('NaOH')));
  const ls = buildAddOrderSteps({
    process: 'ls', lyeType: 'koh', totalOilGrams: 1000, lyeGrams: 200, waterGrams: 400, weightUnit: 'g',
    splitLiquidRows: [glycerin],
  });
  expect(ls.findIndex((s) => s.includes('Glycerin'))).toBeLessThan(ls.findIndex((s) => s.includes('KOH')));
  expect(ls.find((s) => s.includes('Glycerin'))).toMatch(/with the water/);
});

test('a sugary in-lye liquid (milk) still joins the cooled solution AFTER the alkali step', () => {
  const milk = { row: SPLIT({ presetKey: 'milk', name: 'Goat milk', addAt: 'lye' }), grams: 200 };
  const cp = buildAddOrderSteps({ ...CP_BASE, splitLiquidRows: [milk] });
  expect(cp.findIndex((s) => s.includes('Goat milk'))).toBeGreaterThan(cp.findIndex((s) => s.includes('NaOH')));
});

test('with additives present but none at trace, no generic "any additives" line survives', () => {
  const steps = buildAddOrderSteps({ ...CP_BASE, additives: [ADDITIVE('Citric acid', 'lye')] });
  expect(steps.join(' ')).not.toContain('any additives');
  expect(steps.join(' ')).toMatch(/stir .*Citric acid.* into the water/);
});

test('a line parked on a stage the process does not offer is still named somewhere in the steps', () => {
  // A saved HP line at After cook survives a switch to CP; an LS recipe can carry a top line.
  const cp = buildAddOrderSteps({ ...CP_BASE, additives: [ADDITIVE('Fragrance', 'after_cook')] });
  expect(cp.join(' ')).toContain('Fragrance');
  const ls = buildAddOrderSteps({
    process: 'ls', lyeType: 'koh', totalOilGrams: 1000, lyeGrams: 200, waterGrams: 400, weightUnit: 'g',
    additives: [ADDITIVE('Dried petals', 'top')],
  });
  expect(ls.join(' ')).toContain('Dried petals');
});

test('the oils list runs biggest amount first, whatever order they were entered in', () => {
  const items = flat(buildFullRecipe({
    ...FULL_RECIPE_BASE,
    lines: [
      { oilId: 'castor-oil', weightGrams: 20 },
      { oilId: 'coconut-oil-76', weightGrams: 100 },
      { oilId: 'olive-oil', weightGrams: 280 },
    ],
  }));
  const names = items.map((i) => i.name);
  const at = (name: string) => names.indexOf(name);
  expect(at('Olive Oil')).toBeLessThan(at('Coconut Oil, 76°F'));
  expect(at('Coconut Oil, 76°F')).toBeLessThan(at('Castor Oil'));
});

test('additives within a stage run biggest amount first', () => {
  const items = flat(buildFullRecipe({
    ...FULL_RECIPE_BASE,
    additives: [
      { key: 'a', catalogId: 'clay', name: 'Kaolin clay', amount: 1, unit: 'percent', basis: 'oil', grams: 4, addAt: 'trace' },
      { key: 'b', catalogId: 'fragrance', name: 'Fragrance', amount: 3, unit: 'percent', basis: 'oil', grams: 12, addAt: 'trace' },
    ],
  }));
  const names = items.map((i) => i.name);
  expect(names.indexOf('Fragrance')).toBeLessThan(names.indexOf('Kaolin clay'));
});

test('the lye solution keeps its mixing order — amount never reorders lye into water', () => {
  // Sorting by amount would put the 57 g alkali above the 4 g citric acid; the section is a
  // mixing instruction, so the dissolved additive stays between the water and the lye.
  const items = flat(buildFullRecipe({
    ...FULL_RECIPE_BASE,
    additives: [
      { key: 'l', catalogId: 'citric-acid', name: 'Citric acid', amount: 1, unit: 'percent', basis: 'oil', grams: 4, addAt: 'lye' },
    ],
  }));
  const names = items.map((i) => i.name);
  expect(names.indexOf('Distilled water')).toBeLessThan(names.indexOf('Citric acid'));
  expect(names.indexOf('Citric acid')).toBeLessThan(names.indexOf('Sodium hydroxide (NaOH)'));
});

test('post-cook superfat oils run biggest amount first', () => {
  const sections = buildFullRecipe({
    ...FULL_RECIPE_BASE,
    postCookSuperfat: {
      oils: [
        { oilId: 'castor-oil', percentOfOil: 1, grams: 4 },
        { oilId: 'shea-butter', percentOfOil: 5, grams: 20 },
      ],
      percentOfOil: 6,
      grams: 24,
      isExtra: true, method: 'append', deliveredSuperfatPercent: null,
    },
  });
  const names = sections.find((s) => s.heading === 'Post-cook superfat')!.items.map((i) => i.name);
  expect(names).toEqual(['Shea Butter', 'Castor Oil']);
});

test('the add-in-order steps name additives heaviest first, like the manifest above them', () => {
  // The clay is entered first but weighs a third of the fragrance; the step must read down
  // the Full recipe's trace section, not across it.
  const steps = buildAddOrderSteps({
    process: 'cp',
    lyeType: 'naoh',
    totalOilGrams: 400,
    lyeGrams: 56.7,
    waterGrams: 132,
    weightUnit: 'g',
    additives: [
      { name: 'Kaolin clay', addAt: 'trace', grams: 4 },
      { name: 'Fragrance', addAt: 'trace', grams: 12 },
    ],
  });
  const trace = steps.find((s) => s.includes('at trace'))!;
  expect(trace).toContain('the Fragrance and Kaolin clay');
});

// ---- Fragrance & colorants in the manifest and the steps ----------------------------------

/** 400 g of oils: 3% vanilla fragrance (12 g; 12% vanillin → 12 g stabilizer at 1:1) with
 * a 12% linalool declaration, a whole-batter oxide at 1% (4 g) and a mica at 1% of a 40%
 * portion (1.6 g). Finished bar taken as 600 g: 12 g × 12% = 1.44 g linalool = 0.24%. */
const SCENT_CP = computedScent({
      fragrances: [{ name: 'Vanilla dream', percent: '3', supplierMaxPercent: '', vanillinPercent: '12', allergens: [{ name: 'Linalool', percentOfFragrance: '12' }] }],
      colorants: [
        { name: 'Yellow oxide', kind: 'oxide', percent: '1', portionKey: '' },
        { name: 'Blue mica', kind: 'mica', percent: '1', portionKey: '#0' },
      ],
      portions: [{ name: 'Swirl', percent: '40' }],
    }, { process: 'cp', totalOilGrams: 400, productGrams: 600 });

test('Full recipe (CP): base colour inside Oils, portion colours in a Colorants section after trace, Fragrance after that with stabilizer and label allergens', () => {
  const sections = buildFullRecipe({ ...FULL_RECIPE_BASE, scentColor: SCENT_CP });
  const headings = sections.map((s) => s.heading);
  expect(headings.indexOf('Colorants')).toBeGreaterThan(headings.indexOf('Oils'));
  expect(headings.indexOf('Fragrance')).toBe(headings.indexOf('Colorants') + 1);
  const oils = sections.find((s) => s.heading === 'Oils')!;
  expect(oils.items.some((i) => i.name === 'Yellow oxide' && i.detail === '4 g · 1% · Mix 1:1 with a light carrier oil (4 g)')).toBe(true);
  const colorants = sections.find((s) => s.heading === 'Colorants')!;
  expect(colorants.items[0]).toEqual({ name: 'Swirl — 40%', detail: '' });
  expect(colorants.items[1].name).toBe('Blue mica');
  expect(colorants.items[1].detail).toBe('1.6 g · 1% · Mix 1:1 with a light carrier oil (1.6 g)');
  const fragrance = sections.find((s) => s.heading === 'Fragrance')!;
  expect(fragrance.items.map((i) => i.name)).toEqual(['Vanilla dream', 'Vanilla stabilizer', 'Name on the label']);
  expect(fragrance.items[0].detail).toBe('12 g · 3% of oils');
  expect(fragrance.items[1].detail).toBe('12 g');
  expect(fragrance.items[2].detail).toBe('Linalool 0.24%');
});

test('Full recipe (CP): the scent sections sit between At trace and Top', () => {
  const sections = buildFullRecipe({
    ...FULL_RECIPE_BASE,
    scentColor: SCENT_CP,
    additives: [
      { key: 't', catalogId: 'silk', name: 'Silk', amount: 1, unit: 'percent', basis: 'oil', grams: 4, addAt: 'trace' },
      { key: 'u', catalogId: 'oatmeal', name: 'Oatmeal', amount: 1, unit: 'percent', basis: 'oil', grams: 4, addAt: 'top' },
    ],
  });
  expect(sections.map((s) => s.heading)).toEqual([
    'Lye solution', 'Oils', 'At trace', 'Colorants', 'Fragrance', 'On top',
  ]);
});

test('Full recipe (HP/LS): the Fragrance section is last; LS colorants sit in the after-dilution slot', () => {
  const ls = computedScent({
        fragrances: [{ name: 'Lemon', kind: 'essential-oil', percent: '1', supplierMaxPercent: '', vanillinPercent: '', allergens: [] }],
        colorants: [{ name: 'Blue dye', kind: 'dye', percent: '', portionKey: '' }],
        portions: [],
      }, { process: 'ls', totalOilGrams: 400, solutionGrams: 1200, deliveredSuperfatPercent: 2, productGrams: 1200 });
  const sections = buildFullRecipe({ ...FULL_RECIPE_BASE, process: 'ls', lyeType: 'koh', scentColor: ls });
  const headings = sections.map((s) => s.heading);
  expect(headings[headings.length - 1]).toBe('Fragrance');
  expect(headings[headings.length - 2]).toBe('Colorants');
  expect(sections.find((s) => s.heading === 'Colorants')!.items[0]).toEqual({ name: 'Blue dye', detail: 'to shade · Stir straight into the diluted soap' });
  expect(sections.find((s) => s.heading === 'Fragrance')!.items.map((i) => [i.name, i.detail])).toEqual([
    ['Lemon', '12 g · 1% of solution'],
    ['Polysorbate 20', '12 g'],
  ]);
  // HP: after the post-cook superfat section, at the very end.
  const hp = applyScentColorCompliance(
    computeScentColorGrams(SCENT_INPUT_HP, { process: 'hp', totalOilGrams: 400, solutionGrams: 0, deliveredSuperfatPercent: 3 }),
    600,
    'label',
  );
  const hpSections = buildFullRecipe({
    ...FULL_RECIPE_BASE,
    process: 'hp',
    scentColor: hp,
    postCookSuperfat: { oils: [{ oilId: 'shea-butter', grams: 20, percentOfOil: 5 }], grams: 20, percentOfOil: 5, isExtra: true, method: 'append', deliveredSuperfatPercent: 8 } as never,
  });
  expect(hpSections.map((s) => s.heading).slice(-3)).toEqual(['Post-cook superfat', 'Colorants', 'Fragrance']);
});

const SCENT_INPUT_HP = normalizeScentColor({
  fragrances: [{ name: 'Oak', percent: '3', supplierMaxPercent: '', vanillinPercent: '', allergens: [] }],
  colorants: [{ name: 'Red oxide', kind: 'oxide', percent: '1', portionKey: '#0' }],
  portions: [{ name: 'Top', percent: '30' }],
});

test('a blank scent row (no name, no dose) is not listed', () => {
  const blank = computedScent({ fragrances: [{ name: '', percent: '', supplierMaxPercent: '', vanillinPercent: '', allergens: [] }], colorants: [{ name: '', kind: 'mica', percent: '', portionKey: '' }], portions: [] }, { process: 'cp', totalOilGrams: 400, productGrams: 600 });
  const sections = buildFullRecipe({ ...FULL_RECIPE_BASE, scentColor: blank });
  expect(sections.map((s) => s.heading)).toEqual(['Lye solution', 'Oils']);
  expect(sections.find((s) => s.heading === 'Oils')!.items).toHaveLength(2);
});

test('Add-in-order steps (CP): base colour with the oils, fragrance at trace, then the portion split naming its colour', () => {
  const steps = buildAddOrderSteps({ ...CP_BASE, scentColor: SCENT_CP });
  expect(steps.find((s) => s.includes('warm to'))).toMatch(/Blend in the Yellow oxide\./);
  const trace = steps.find((s) => s.includes('at trace'))!;
  expect(trace).toBe(
    'Stir in the Vanilla dream (stabilizer mixed in) at trace. Then split the batter — Swirl 40% (Blue mica) — and colour each portion.',
  );
});

test('HP steps put the fragrance and the portion split after the cook; LS names dyes and fragrance in the dilute step', () => {
  const hp = applyScentColorCompliance(
    computeScentColorGrams(SCENT_INPUT_HP, { process: 'hp', totalOilGrams: 400, solutionGrams: 0, deliveredSuperfatPercent: 3 }),
    600,
    'label',
  );
  const hpSteps = buildAddOrderSteps({ ...CP_BASE, process: 'hp', scentColor: hp });
  expect(hpSteps.find((s) => s.includes('After the cook'))).toBe(
    'After the cook, stir in the Oak and any post-cook superfat. Then split the batter — Top 30% (Red oxide) — and colour each portion.',
  );
  const ls = computedScent({
        fragrances: [{ name: 'Lemon', kind: 'essential-oil', percent: '1', supplierMaxPercent: '', vanillinPercent: '', allergens: [] }],
        colorants: [{ name: 'Blue dye', kind: 'dye', percent: '', portionKey: '' }],
        portions: [],
      }, { process: 'ls', totalOilGrams: 400, solutionGrams: 1200, deliveredSuperfatPercent: 0, productGrams: 1200 });
  const lsSteps = buildAddOrderSteps({ ...CP_BASE, process: 'ls', lyeType: 'koh', scentColor: ls });
  expect(lsSteps.find((s) => s.includes('Dilute the paste'))).toBe(
    'Dilute the paste with hot water, then blend in the Lemon and Blue dye.',
  );
});

test('a just-added blank portion is not named in the split sentence', () => {
  const scent = computedScent({ fragrances: [], colorants: [{ name: 'Blue mica', kind: 'mica', percent: '1', portionKey: '' }], portions: [{ name: '', percent: '' }] }, { process: 'cp', totalOilGrams: 400, productGrams: 600 });
  const steps = buildAddOrderSteps({ ...CP_BASE, scentColor: scent });
  expect(steps.join(' ')).not.toMatch(/split the batter/);
});

test('a colorant sent through the lye lists with the lye solution, not under Colorants', () => {
  const scent = computedScent({
    fragrances: [],
    colorants: [
      { catalogId: 'madder-root', name: 'Madder root', kind: 'natural', percent: '0.88', portionKey: '', viaLye: true },
      { catalogId: 'mica', name: '', kind: 'mica', percent: '1', portionKey: '' },
    ],
    portions: [],
  }, { process: 'cp', totalOilGrams: 400, productGrams: 600 });
  const sections = buildFullRecipe({ ...FULL_RECIPE_BASE, scentColor: scent });
  const lye = sections.find((s) => s.heading === 'Lye solution')!;
  // in the pot before the oils are, so it reads there — after the alkali and its liquid
  expect(lye.items[lye.items.length - 1].name).toBe('Madder root');
  expect(lye.items[lye.items.length - 1].detail).toBe('3.5 g · 0.88% · Stir into the lye solution itself — it needs no other solvent');
  // the mica stays a whole-batter colour, with the oils; neither is a design step
  expect(sections.find((s) => s.heading === 'Colorants')).toBeUndefined();
  expect(sections.find((s) => s.heading === 'Oils')!.items.some((i) => i.name === 'Mica')).toBe(true);
});

test('Add-in-order steps (CP): a lye colour is named in the lye step, not at the split', () => {
  const scent = computedScent({
    fragrances: [],
    colorants: [{ catalogId: 'madder-root', name: '', kind: 'natural', percent: '0.88', portionKey: '#0', viaLye: true }],
    portions: [{ name: 'Swirl', percent: '40' }],
  }, { process: 'cp', totalOilGrams: 400, productGrams: 600 });
  const steps = buildAddOrderSteps({ ...CP_BASE, scentColor: scent });
  // it goes into the water before the alkali does, which is where the lye step names it
  expect(steps[0]).toContain('stir the Madder root into the water first');
  // the stored portion pick does not colour a portion while the route is on
  expect(steps.join(' ')).not.toMatch(/Swirl 40% \(Madder root\)/);
});
