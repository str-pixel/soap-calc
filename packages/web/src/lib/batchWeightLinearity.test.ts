import { expect, test } from 'vitest';
import { calculateRecipe } from './calculateRecipe';
import { computeRecipeAdditives, computeExtrasGrams } from './calculateAdditives';
import { createStarterLines, DEFAULT_SETTINGS, type RecipeLine, type RecipeSettings } from './recipe';

/**
 * Tripwire for the batch-weight entry field's ratio solve (commitBatchWeightInput):
 * displayed batch weight must stay LINEAR in oil scale — b(s) = s × b(1), no constant
 * offset. This holds because every contributor (lye, water, %-of-oil and ppt-of-batch
 * additives, split liquid, PCSF) is proportional to an oil-scaled basis and the app has
 * no fixed-gram dose unit. If that ever changes, the ratio solve in useRecipeInputs
 * becomes wrong — fix the solver, not this test.
 */

function batchWeightFor(
  lines: RecipeLine[],
  settings: RecipeSettings,
  additives: Parameters<typeof computeRecipeAdditives>[0],
): number | null {
  const { result, displayTotals } = calculateRecipe(lines, settings);
  if (!result || !displayTotals) return null;
  const base = displayTotals.batchWeightGrams;
  const computed = computeRecipeAdditives(additives, {
    oilGrams: displayTotals.recipeOilWeightGrams,
    batchGrams: base,
    solutionGrams: 0,
  });
  return base + computeExtrasGrams(computed, null, null, true);
}

const scaled = (lines: RecipeLine[], s: number): RecipeLine[] =>
  lines.map((l) => ({ ...l, weightGrams: String(Number(l.weightGrams) * s) }));

const CASES: Array<{
  name: string;
  settings: RecipeSettings;
  additives: Parameters<typeof computeRecipeAdditives>[0];
}> = [
  { name: 'plain CP, default water', settings: DEFAULT_SETTINGS, additives: [] },
  {
    name: 'percent-of-oil + ppt-of-batch additives',
    settings: DEFAULT_SETTINGS,
    additives: [
      { key: 'a', catalogId: 'fragrance', name: 'Fragrance', amount: '3', unit: 'percent', basis: 'oil', addAt: 'trace' },
      { key: 'b', catalogId: 'sugar-sorbitol', name: 'Sugar', amount: '2', unit: 'ppt', basis: 'batch', addAt: 'trace' },
    ],
  },
  {
    name: 'lye-concentration water mode',
    settings: { ...DEFAULT_SETTINGS, waterMode: 'lye_concentration' as RecipeSettings['waterMode'] },
    additives: [],
  },
];

test('batch weight is linear in oil scale (ratio-solve tripwire)', () => {
  for (const c of CASES) {
    const lines = createStarterLines();
    const b1 = batchWeightFor(lines, c.settings, c.additives);
    const b2 = batchWeightFor(scaled(lines, 2), c.settings, c.additives);
    const b337 = batchWeightFor(scaled(lines, 3.37), c.settings, c.additives);
    expect(b1, c.name).not.toBeNull();
    expect(b2! / b1!, `${c.name}: b(2)/b(1)`).toBeCloseTo(2, 6);
    expect(b337! / b1!, `${c.name}: b(3.37)/b(1)`).toBeCloseTo(3.37, 6);
  }
});
