import { describe, expect, it } from 'vitest';
import {
  addRecipeLine,
  resyncFromWeights,
  syncBatchTotalEdit,
  syncPercentEdit,
  syncWeightEdit,
} from './lineWeightSync';
import type { RecipeLine } from './recipe';

const twoLines: RecipeLine[] = [
  { key: 'a', oilId: 'olive-oil', weightGrams: '600', weightPercent: '60' },
  { key: 'b', oilId: 'coconut-oil-76', weightGrams: '400', weightPercent: '40' },
];

const threeLines: RecipeLine[] = [
  { key: 'a', oilId: 'olive-oil', weightGrams: '500', weightPercent: '50' },
  { key: 'b', oilId: 'coconut-oil-76', weightGrams: '300', weightPercent: '30' },
  { key: 'c', oilId: 'shea-butter', weightGrams: '200', weightPercent: '20' },
];

function totalWeightGrams(lines: RecipeLine[]): number {
  return lines.reduce((sum, line) => sum + Number(line.weightGrams || 0), 0);
}

describe('syncWeightEdit', () => {
  it('updates percent from weight and batch total when batch is unset', () => {
    const result = syncWeightEdit(twoLines, 'a', '750', '');
    expect(result.batchOilGrams).toBe('1150');
    expect(result.lines[0].weightPercent).toBe('65.2');
    expect(result.lines[1].weightPercent).toBe('34.8');
  });

  it('keeps batch fixed and redistributes other weights when batch is set', () => {
    const result = syncWeightEdit(twoLines, 'a', '750', '1000');
    expect(result.batchOilGrams).toBe('1000');
    expect(result.lines[0]).toMatchObject({ weightGrams: '750', weightPercent: '75' });
    expect(result.lines[1]).toMatchObject({ weightGrams: '250', weightPercent: '25' });
    expect(totalWeightGrams(result.lines)).toBe(1000);
  });

  it('uses empty batch when all weights are cleared', () => {
    const single = [{ key: 'a', oilId: 'olive-oil', weightGrams: '600', weightPercent: '100' }];
    const result = syncWeightEdit(single, 'a', '', '');
    expect(result.batchOilGrams).toBe('');
    expect(result.lines[0].weightGrams).toBe('');
  });
});

describe('syncPercentEdit', () => {
  it('redistributes other percents and keeps batch fixed for multi-line recipes', () => {
    const result = syncPercentEdit(twoLines, 'a', '50', '1000');
    expect(result.batchOilGrams).toBe('1000');
    expect(result.lines[0]).toMatchObject({ weightGrams: '500', weightPercent: '50' });
    expect(result.lines[1]).toMatchObject({ weightGrams: '500', weightPercent: '50' });
    expect(totalWeightGrams(result.lines)).toBe(1000);
  });

  it('redistributes remaining percent proportionally across three lines', () => {
    const result = syncPercentEdit(threeLines, 'a', '40', '1000');
    expect(result.batchOilGrams).toBe('1000');
    expect(result.lines[0]).toMatchObject({ weightGrams: '400', weightPercent: '40' });
    expect(result.lines[1]).toMatchObject({ weightGrams: '360', weightPercent: '36' });
    expect(result.lines[2]).toMatchObject({ weightGrams: '240', weightPercent: '24' });
    expect(totalWeightGrams(result.lines)).toBe(1000);
  });

  it('keeps batch fixed when editing percent on a single-line recipe', () => {
    const single = [{ key: 'a', oilId: 'olive-oil', weightGrams: '1000', weightPercent: '100' }];
    const result = syncPercentEdit(single, 'a', '80', '1000');
    expect(result.batchOilGrams).toBe('1000');
    expect(result.lines[0]).toMatchObject({ weightGrams: '800', weightPercent: '80' });
  });

  it('stores partial percent text without syncing weights', () => {
    const result = syncPercentEdit(twoLines, 'a', '', '1000');
    expect(result.lines[0].weightPercent).toBe('');
    expect(result.lines[0].weightGrams).toBe('600');
    expect(result.batchOilGrams).toBe('1000');
  });
});

describe('syncBatchTotalEdit', () => {
  it('rescales weights from percents when batch changes', () => {
    const next = syncBatchTotalEdit(twoLines, '2000');
    expect(next[0].weightGrams).toBe('1200');
    expect(next[1].weightGrams).toBe('800');
    expect(totalWeightGrams(next)).toBe(2000);
  });

  it('normalizes percents that do not total 100 before scaling', () => {
    const skewed: RecipeLine[] = [
      { key: 'a', oilId: 'olive-oil', weightGrams: '500', weightPercent: '50' },
      { key: 'b', oilId: 'coconut-oil-76', weightGrams: '400', weightPercent: '40' },
    ];
    const next = syncBatchTotalEdit(skewed, '1000');
    expect(totalWeightGrams(next)).toBe(1000);
  });

  it('clears line weights when batch is cleared', () => {
    const next = syncBatchTotalEdit(twoLines, '');
    expect(next.every((line) => line.weightGrams === '' && line.weightPercent === '')).toBe(true);
  });
});

describe('resyncFromWeights', () => {
  it('recomputes percents and batch after line removal', () => {
    const remaining = [twoLines[0]];
    const result = resyncFromWeights(remaining);
    expect(result.batchOilGrams).toBe('600');
    expect(result.lines[0]).toMatchObject({ weightGrams: '600', weightPercent: '100' });
  });
});

describe('addRecipeLine', () => {
  it('appends an empty line without changing existing weights when batch is set', () => {
    const result = addRecipeLine(twoLines, '1000', {
      key: 'c',
      oilId: 'olive-oil',
      weightGrams: '',
      weightPercent: '',
    });
    expect(result.lines).toHaveLength(3);
    expect(result.lines[2].weightGrams).toBe('');
    expect(result.batchOilGrams).toBe('1000');
    expect(totalWeightGrams(result.lines)).toBe(1000);
  });
});
