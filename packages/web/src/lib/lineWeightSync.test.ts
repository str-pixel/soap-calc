import { describe, expect, it } from 'vitest';
import {
  addRecipeLine,
  solveOilLinesForBatchTarget,
  solveOilTotalForBatchTarget,
  resyncFromWeights,
  syncBatchTotalEdit,
  syncPercentEdit,
  syncWeightEdit,
} from './lineWeightSync';
import { createStarterLines } from './recipe';
import { gramsStringToLineDisplay } from './weightUnits';
import type { RecipeLine } from './recipe';

const twoLines: RecipeLine[] = [
  { key: 'a', oilId: 'olive-oil', weightGrams: '600', weightPercent: '60' },
  { key: 'b', oilId: 'coconut-oil-76', weightGrams: '400', weightPercent: '40' },
];

const threeBlank: RecipeLine[] = [
  { key: 'a', oilId: 'olive-oil', weightGrams: '', weightPercent: '' },
  { key: 'b', oilId: 'coconut-oil-76', weightGrams: '', weightPercent: '' },
  { key: 'c', oilId: 'shea-butter', weightGrams: '', weightPercent: '' },
];

function totalWeightGrams(lines: RecipeLine[]): number {
  return lines.reduce((sum, line) => sum + Number(line.weightGrams || 0), 0);
}

// The core promise of independent entry: editing one oil never moves another. Every test
// below asserts that the SIBLING lines are byte-identical to the input.

describe('syncWeightEdit (independent)', () => {
  it('sets only the edited line; its percent follows the batch anchor; siblings untouched', () => {
    const r = syncWeightEdit(twoLines, 'a', '750', '1000', true);
    expect(r.batchOilGrams).toBe('1000');
    expect(r.batchSetByUser).toBe(true);
    expect(r.lines[0]).toMatchObject({ weightGrams: '750', weightPercent: '75' });
    // sibling is exactly as it was — NOT redistributed to 250 g / 25 %
    expect(r.lines[1]).toBe(twoLines[1]);
  });

  it('lets percentages exceed 100 (warned in the UI, never auto-corrected)', () => {
    const r = syncWeightEdit(twoLines, 'a', '900', '1000', true);
    expect(r.lines[0]).toMatchObject({ weightGrams: '900', weightPercent: '90' });
    expect(r.lines[1]).toBe(twoLines[1]); // still 400 / 40 → total 130 %
    expect(totalWeightGrams(r.lines)).toBe(1300);
  });

  it('leaves percent blank when there is no batch anchor to convert against', () => {
    const r = syncWeightEdit(twoLines, 'a', '750', '', false);
    expect(r.batchOilGrams).toBe('');
    expect(r.lines[0]).toMatchObject({ weightGrams: '750', weightPercent: '' });
    expect(r.lines[1]).toBe(twoLines[1]);
  });

  it('clearing a weight empties that line only', () => {
    const r = syncWeightEdit(twoLines, 'a', '', '1000', true);
    expect(r.lines[0]).toMatchObject({ weightGrams: '', weightPercent: '' });
    expect(r.lines[1]).toBe(twoLines[1]);
    expect(r.batchOilGrams).toBe('1000');
  });

  it('a zero weight empties that line only', () => {
    const r = syncWeightEdit(twoLines, 'a', '0', '1000', true);
    expect(r.lines[0]).toMatchObject({ weightGrams: '', weightPercent: '' });
    expect(r.lines[1]).toBe(twoLines[1]);
  });
});

describe('syncPercentEdit (independent)', () => {
  it('sets only the edited line; its grams come from the batch anchor; siblings untouched', () => {
    const r = syncPercentEdit(twoLines, 'a', '30', '1000', true);
    expect(r.lines[0]).toMatchObject({ weightPercent: '30', weightGrams: '300' });
    // sibling stays exactly 40 % / 400 g — NOT rescaled to fill 70 %
    expect(r.lines[1]).toBe(twoLines[1]);
    expect(r.batchOilGrams).toBe('1000');
    expect(r.batchSetByUser).toBe(true);
  });

  it('lets you set 30 / 60 / 10 independently and they all stay put', () => {
    const batch = '1000';
    let lines = threeBlank;
    lines = syncPercentEdit(lines, 'a', '30', batch, true).lines;
    lines = syncPercentEdit(lines, 'b', '60', batch, true).lines;
    lines = syncPercentEdit(lines, 'c', '10', batch, true).lines;
    expect(lines.map((l) => l.weightPercent)).toEqual(['30', '60', '10']);
    expect(lines.map((l) => l.weightGrams)).toEqual(['300', '600', '100']);
  });

  it('caps a single oil at 100% (it cannot exceed the whole) without touching siblings', () => {
    const r = syncPercentEdit(twoLines, 'a', '150', '1000', true);
    expect(r.lines[0]).toMatchObject({ weightPercent: '100', weightGrams: '1000' });
    expect(r.lines[1]).toBe(twoLines[1]);
  });

  it('records a typed percent even without a batch anchor (percent-first), then scales', () => {
    const r = syncPercentEdit(threeBlank, 'a', '60', '', false);
    expect(r.lines[0]).toMatchObject({ weightPercent: '60', weightGrams: '' });
    expect(r.lines[1]).toBe(threeBlank[1]);
    // a later Total-oil edit turns the stored percents into grams
    const scaled = syncBatchTotalEdit(r.lines, '1000');
    expect(scaled[0].weightGrams).toBe('600');
  });

  it('clearing / zeroing a percent empties that line only', () => {
    expect(syncPercentEdit(twoLines, 'a', '', '1000', true).lines[0]).toMatchObject({
      weightPercent: '',
      weightGrams: '',
    });
    const zeroed = syncPercentEdit(twoLines, 'a', '0', '1000', true);
    expect(zeroed.lines[0]).toMatchObject({ weightPercent: '', weightGrams: '' });
    expect(zeroed.lines[1]).toBe(twoLines[1]);
  });
});

describe('syncBatchTotalEdit (resize the whole batch, keep proportions)', () => {
  it('rescales every weight from its own percent; percentages are preserved', () => {
    const next = syncBatchTotalEdit(twoLines, '2000');
    expect(next[0]).toMatchObject({ weightGrams: '1200', weightPercent: '60' });
    expect(next[1]).toMatchObject({ weightGrams: '800', weightPercent: '40' });
  });

  it('does NOT normalize to 100 — an in-progress 90 % batch scales as 90 %', () => {
    const skewed: RecipeLine[] = [
      { key: 'a', oilId: 'olive-oil', weightGrams: '500', weightPercent: '50' },
      { key: 'b', oilId: 'coconut-oil-76', weightGrams: '400', weightPercent: '40' },
    ];
    const next = syncBatchTotalEdit(skewed, '1000');
    expect(next[0].weightGrams).toBe('500');
    expect(next[1].weightGrams).toBe('400');
    expect(totalWeightGrams(next)).toBe(900); // honors 90 %, not silently corrected
  });

  it('seeds percents from weights when none are set, then scales', () => {
    const gramOnly: RecipeLine[] = [
      { key: 'a', oilId: 'olive-oil', weightGrams: '600', weightPercent: '' },
      { key: 'b', oilId: 'coconut-oil-76', weightGrams: '400', weightPercent: '' },
    ];
    const next = syncBatchTotalEdit(gramOnly, '2000');
    expect(next[0]).toMatchObject({ weightGrams: '1200', weightPercent: '60' });
    expect(next[1]).toMatchObject({ weightGrams: '800', weightPercent: '40' });
  });

  it('leaves lines untouched for a cleared or empty batch, and with no data to scale', () => {
    expect(syncBatchTotalEdit(twoLines, '')).toEqual(twoLines);
    const empty: RecipeLine[] = [{ key: 'a', oilId: 'olive-oil', weightGrams: '', weightPercent: '' }];
    expect(syncBatchTotalEdit(empty, '1000')).toEqual(empty);
  });
});

describe('resyncFromWeights (derive total from weights — clearing the Total oil)', () => {
  it('recomputes the batch and percents from the remaining weights, unlocked', () => {
    const result = resyncFromWeights([twoLines[0]]);
    expect(result.batchOilGrams).toBe('600');
    expect(result.batchSetByUser).toBe(false);
    expect(result.lines[0]).toMatchObject({ weightGrams: '600', weightPercent: '100' });
  });
});

describe('addRecipeLine', () => {
  it('appends an empty line, preserving existing weights and the batch/flag', () => {
    const result = addRecipeLine(twoLines, '1000', {
      key: 'c', oilId: 'olive-oil', weightGrams: '', weightPercent: '',
    }, true);
    expect(result.lines).toHaveLength(3);
    expect(result.lines[0]).toBe(twoLines[0]);
    expect(result.lines[1]).toBe(twoLines[1]);
    expect(result.lines[2].weightGrams).toBe('');
    expect(result.batchOilGrams).toBe('1000');
    expect(result.batchSetByUser).toBe(true);
  });

  it('re-derives the batch when no total is set', () => {
    const gramOnly: RecipeLine[] = [
      { key: 'a', oilId: 'olive-oil', weightGrams: '300', weightPercent: '100' },
    ];
    const result = addRecipeLine(gramOnly, '', {
      key: 'b', oilId: 'coconut-oil-76', weightGrams: '', weightPercent: '',
    }, false);
    expect(result.batchOilGrams).toBe('300');
    expect(result.batchSetByUser).toBe(false);
  });
});

describe('solveOilTotalForBatchTarget with fixed-gram extras (2000→1961 bug)', () => {
  // A grams-mode split liquid (or gram-dosed additive) adds a constant to the batch.
  // The proportional back-solve scales that constant along with the oils and lands the
  // typed 2000 at ~1961. The solver must treat the batch as affine: proportional part
  // plus the fixed grams.
  it('lands a batch with a 200 g fixed extra on the typed target', () => {
    const lines = createStarterLines();
    const oil0 = 1000;
    const proportional0 = 1469.58; // oils+lye+water for the starter recipe
    const fixed = 200;
    const batch0 = proportional0 + fixed;
    const solved = solveOilTotalForBatchTarget(lines, 2000, oil0, batch0, fixed);
    const scaled = syncBatchTotalEdit(resyncFromWeights(lines).lines, String(solved));
    const realizedOil = scaled.reduce((s, l) => s + Number(l.weightGrams || 0), 0);
    const realized = proportional0 * (realizedOil / oil0) + fixed;
    expect(Math.abs(realized - 2000)).toBeLessThan(1);
  });

  it('stays exact for the no-extras case (default omitted)', () => {
    const lines = createStarterLines();
    const solved = solveOilTotalForBatchTarget(lines, 2000, 1000, 1469.58);
    expect(solved).toBe(1361);
  });
});

describe('solveOilLinesForBatchTarget (exact landing via one fractional line)', () => {
  const OIL0 = 1000;
  const PROP0 = 1469.58; // starter recipe oils+lye+water

  function realized(lines: RecipeLine[], fixed = 0) {
    const oil = lines.reduce((s, l) => s + Number(l.weightGrams || 0), 0);
    return PROP0 * (oil / OIL0) + fixed;
  }

  it('lands the typed 2000 exactly, carrying the residual on one line', () => {
    const solved = solveOilLinesForBatchTarget(createStarterLines(), 2000, OIL0, PROP0, 0);
    expect(Math.abs(realized(solved.lines) - 2000)).toBeLessThan(0.08);
    const fractional = solved.lines.filter((l) => Number(l.weightGrams) % 1 !== 0);
    expect(fractional.length).toBeLessThanOrEqual(1);
    // The stored total matches the realized line sum (weightTotalOff invariant).
    const sum = solved.lines.reduce((s, l) => s + Number(l.weightGrams || 0), 0);
    expect(Number(solved.batchOilGrams)).toBeCloseTo(sum, 6);
  });

  it('lands exactly with fixed-gram extras in the batch', () => {
    const fixed = 200;
    const solved = solveOilLinesForBatchTarget(createStarterLines(), 2000, OIL0, PROP0 + fixed, fixed);
    expect(Math.abs(realized(solved.lines, fixed) - 2000)).toBeLessThan(0.08);
  });

  it('keeps whole-gram lines when the whole solve already lands within a deci-gram', () => {
    // Target chosen exactly on the staircase: realized batch for oil 1361 is 2000.086 —
    // ask for that and no fractional correction should be applied.
    const solved = solveOilLinesForBatchTarget(createStarterLines(), 2000.086, OIL0, PROP0, 0);
    expect(solved.lines.every((l) => Number(l.weightGrams) % 1 === 0)).toBe(true);
  });
});

describe('gramsStringToLineDisplay', () => {
  it('shows whole grams bare and keeps a single decimal only when fractional', () => {
    expect(gramsStringToLineDisplay('340', 'g')).toBe('340');
    expect(gramsStringToLineDisplay('340.3', 'g')).toBe('340.3');
    expect(gramsStringToLineDisplay('340.34', 'g')).toBe('340.3');
  });
});
