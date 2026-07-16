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
    const result = syncWeightEdit(twoLines, 'a', '750', '', false);
    expect(result.batchOilGrams).toBe('1150');
    expect(result.lines[0].weightPercent).toBe('65.2');
    expect(result.lines[1].weightPercent).toBe('34.8');
  });

  it('grows a derived batch instead of redistributing when weights are entered sequentially', () => {
    // Regression: olive 300 g auto-derives batch 300; entering coconut 200 g must
    // NOT steal weight from olive — the recipe is 300 + 200 = 500.
    const entered: RecipeLine[] = [
      { key: 'a', oilId: 'olive-oil', weightGrams: '300', weightPercent: '100' },
      { key: 'b', oilId: 'coconut-oil-76', weightGrams: '', weightPercent: '' },
    ];
    const result = syncWeightEdit(entered, 'b', '200', '300', false);
    expect(result.batchOilGrams).toBe('500');
    expect(result.batchSetByUser).toBe(false);
    expect(result.lines[0]).toMatchObject({ weightGrams: '300', weightPercent: '60' });
    expect(result.lines[1]).toMatchObject({ weightGrams: '200', weightPercent: '40' });
  });

  it('shrinks a derived batch when a weight is cleared', () => {
    const result = syncWeightEdit(twoLines, 'a', '', '1000', false);
    expect(result.batchOilGrams).toBe('400');
    expect(result.lines[0]).toMatchObject({ weightGrams: '', weightPercent: '' });
    expect(result.lines[1]).toMatchObject({ weightGrams: '400', weightPercent: '100' });
  });

  it('keeps redistributing within the batch when the user set the total explicitly', () => {
    const result = syncWeightEdit(twoLines, 'a', '750', '1000', true);
    expect(result.batchOilGrams).toBe('1000');
    expect(result.batchSetByUser).toBe(true);
    expect(result.lines[0]).toMatchObject({ weightGrams: '750', weightPercent: '75' });
    expect(result.lines[1]).toMatchObject({ weightGrams: '250', weightPercent: '25' });
  });

  it('keeps batch fixed and redistributes other weights when batch is set', () => {
    const result = syncWeightEdit(twoLines, 'a', '750', '1000', true);
    expect(result.batchOilGrams).toBe('1000');
    expect(result.lines[0]).toMatchObject({ weightGrams: '750', weightPercent: '75' });
    expect(result.lines[1]).toMatchObject({ weightGrams: '250', weightPercent: '25' });
    expect(totalWeightGrams(result.lines)).toBe(1000);
  });

  it('uses empty batch when all weights are cleared', () => {
    const single = [{ key: 'a', oilId: 'olive-oil', weightGrams: '600', weightPercent: '100' }];
    const result = syncWeightEdit(single, 'a', '', '', false);
    expect(result.batchOilGrams).toBe('');
    expect(result.lines[0].weightGrams).toBe('');
  });

  it('clearing a weight empties the line and does not resurrect it on a batch edit', () => {
    const cleared = syncWeightEdit(twoLines, 'a', '', '1000', true);
    expect(cleared.lines[0]).toMatchObject({ weightGrams: '', weightPercent: '' });
    const afterBatch = syncBatchTotalEdit(cleared.lines, '2000');
    expect(afterBatch[0].weightGrams).toBe('');
    expect(afterBatch[1].weightGrams).toBe('2000');
  });
});

describe('syncPercentEdit (user-set batch — locked)', () => {
  it('redistributes other percents and keeps batch fixed for multi-line recipes', () => {
    const result = syncPercentEdit(twoLines, 'a', '50', '1000', true);
    expect(result.batchOilGrams).toBe('1000');
    expect(result.batchSetByUser).toBe(true);
    expect(result.lines[0]).toMatchObject({ weightGrams: '500', weightPercent: '50' });
    expect(result.lines[1]).toMatchObject({ weightGrams: '500', weightPercent: '50' });
    expect(totalWeightGrams(result.lines)).toBe(1000);
  });

  it('redistributes remaining percent proportionally across three lines', () => {
    const result = syncPercentEdit(threeLines, 'a', '40', '1000', true);
    expect(result.batchOilGrams).toBe('1000');
    expect(result.lines[0]).toMatchObject({ weightGrams: '400', weightPercent: '40' });
    expect(result.lines[1]).toMatchObject({ weightGrams: '360', weightPercent: '36' });
    expect(result.lines[2]).toMatchObject({ weightGrams: '240', weightPercent: '24' });
    expect(totalWeightGrams(result.lines)).toBe(1000);
  });

  it('keeps batch fixed when editing percent on a single-line recipe', () => {
    const single = [{ key: 'a', oilId: 'olive-oil', weightGrams: '1000', weightPercent: '100' }];
    const result = syncPercentEdit(single, 'a', '80', '1000', true);
    expect(result.batchOilGrams).toBe('1000');
    expect(result.lines[0]).toMatchObject({ weightGrams: '800', weightPercent: '80' });
  });

  it('clearing a percent empties the line and does not silently delete on a batch edit', () => {
    const cleared = syncPercentEdit(twoLines, 'a', '', '1000', true);
    expect(cleared.lines[0]).toMatchObject({ weightGrams: '', weightPercent: '' });
    expect(cleared.batchOilGrams).toBe('1000');
    expect(cleared.batchSetByUser).toBe(true);
    const afterBatch = syncBatchTotalEdit(cleared.lines, '2000');
    expect(afterBatch[0].weightGrams).toBe('');
    expect(afterBatch[1].weightGrams).toBe('2000');
  });
});

describe('syncPercentEdit (derived batch — unlocked)', () => {
  it('preserves other lines’ typed weights and grows the batch instead of stealing', () => {
    // Regression (finding 3): olive 300 g auto-derives batch 300. Typing coconut = 40%
    // must keep olive at 300 g and grow the batch to 500 (300 + 200), matching the
    // weight-entry path — NOT cut olive to 180 g by locking the derived 300.
    const entered: RecipeLine[] = [
      { key: 'a', oilId: 'olive-oil', weightGrams: '300', weightPercent: '100' },
      { key: 'b', oilId: 'coconut-oil-76', weightGrams: '', weightPercent: '' },
    ];
    const result = syncPercentEdit(entered, 'b', '40', '300', false);
    expect(result.batchOilGrams).toBe('500');
    expect(result.batchSetByUser).toBe(false);
    expect(result.lines[0]).toMatchObject({ weightGrams: '300', weightPercent: '60' });
    expect(result.lines[1]).toMatchObject({ weightGrams: '200', weightPercent: '40' });
  });

  it('clearing a percent on a derived batch shrinks the total from remaining weights', () => {
    const result = syncPercentEdit(twoLines, 'a', '', '1000', false);
    expect(result.batchOilGrams).toBe('400');
    expect(result.batchSetByUser).toBe(false);
    expect(result.lines[0]).toMatchObject({ weightGrams: '', weightPercent: '' });
    expect(result.lines[1]).toMatchObject({ weightGrams: '400', weightPercent: '100' });
  });

  it('scales the sole line against the derived total when it is the only oil', () => {
    const single = [{ key: 'a', oilId: 'olive-oil', weightGrams: '300', weightPercent: '100' }];
    const result = syncPercentEdit(single, 'a', '80', '300', false);
    expect(result.batchSetByUser).toBe(false);
    expect(result.lines[0]).toMatchObject({ weightGrams: '240', weightPercent: '100' });
    expect(result.batchOilGrams).toBe('240');
  });

  it('at 100% keeps the edited line’s OWN weight and clears the others (not the others’ total)', () => {
    // Finding 1: typing 100% on olive must keep olive at 300 g and drop coconut,
    // giving a 300 g single-oil batch — not reassign olive to coconut's 200 g.
    const result = syncPercentEdit(
      [
        { key: 'a', oilId: 'olive-oil', weightGrams: '300', weightPercent: '60' },
        { key: 'b', oilId: 'coconut-oil-76', weightGrams: '200', weightPercent: '40' },
      ],
      'a',
      '100',
      '500',
      false,
    );
    expect(result.batchOilGrams).toBe('300');
    expect(result.batchSetByUser).toBe(false);
    expect(result.lines[0]).toMatchObject({ weightGrams: '300', weightPercent: '100' });
    expect(result.lines[1].weightGrams).toBe('');
  });

  it('at 100% keeps the edited line’s weight even when it is the smaller line', () => {
    const result = syncPercentEdit(
      [
        { key: 'a', oilId: 'olive-oil', weightGrams: '200', weightPercent: '40' },
        { key: 'b', oilId: 'coconut-oil-76', weightGrams: '300', weightPercent: '60' },
      ],
      'a',
      '100',
      '500',
      false,
    );
    expect(result.batchOilGrams).toBe('200');
    expect(result.lines[0]).toMatchObject({ weightGrams: '200', weightPercent: '100' });
    expect(result.lines[1].weightGrams).toBe('');
  });

  it('scales the sole line against its own weight when the batch is unsynced/empty', () => {
    // Finding 2: batch string empty but the line has a real weight — a percent edit must
    // scale against the line's own 300 g, not fall back to 0 and wipe it.
    const single = [{ key: 'a', oilId: 'olive-oil', weightGrams: '300', weightPercent: '100' }];
    const result = syncPercentEdit(single, 'a', '80', '', false);
    expect(result.lines[0].weightGrams).toBe('240');
    expect(result.batchOilGrams).toBe('240');
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

  it('preserves line weights when batch is cleared', () => {
    const next = syncBatchTotalEdit(twoLines, '');
    expect(next).toEqual(twoLines);
  });

  it('rescales from gram weights when percents are empty', () => {
    const gramOnly: RecipeLine[] = [
      { key: 'a', oilId: 'olive-oil', weightGrams: '600', weightPercent: '' },
      { key: 'b', oilId: 'coconut-oil-76', weightGrams: '400', weightPercent: '' },
    ];
    const next = syncBatchTotalEdit(gramOnly, '2000');
    expect(totalWeightGrams(next)).toBe(2000);
    expect(next[0].weightGrams).toBe('1200');
    expect(next[1].weightGrams).toBe('800');
    expect(next[0].weightPercent).toBe('60');
    expect(next[1].weightPercent).toBe('40');
  });

  it('leaves lines unchanged when there are no percents or weights', () => {
    const empty: RecipeLine[] = [
      { key: 'a', oilId: 'olive-oil', weightGrams: '', weightPercent: '' },
    ];
    expect(syncBatchTotalEdit(empty, '1000')).toEqual(empty);
  });
});

describe('resyncFromWeights', () => {
  it('recomputes percents and batch after line removal and marks the batch derived', () => {
    const remaining = [twoLines[0]];
    const result = resyncFromWeights(remaining);
    expect(result.batchOilGrams).toBe('600');
    expect(result.batchSetByUser).toBe(false);
    expect(result.lines[0]).toMatchObject({ weightGrams: '600', weightPercent: '100' });
  });
});

describe('addRecipeLine', () => {
  it('appends an empty line without changing existing weights when batch is set, preserving the flag', () => {
    const result = addRecipeLine(twoLines, '1000', {
      key: 'c',
      oilId: 'olive-oil',
      weightGrams: '',
      weightPercent: '',
    }, true);
    expect(result.lines).toHaveLength(3);
    expect(result.lines[2].weightGrams).toBe('');
    expect(result.batchOilGrams).toBe('1000');
    expect(result.batchSetByUser).toBe(true);
    expect(totalWeightGrams(result.lines)).toBe(1000);
  });

  it('re-derives the batch (unlocked) when no user total is set', () => {
    const gramOnly: RecipeLine[] = [
      { key: 'a', oilId: 'olive-oil', weightGrams: '300', weightPercent: '100' },
    ];
    const result = addRecipeLine(gramOnly, '300', {
      key: 'b',
      oilId: 'coconut-oil-76',
      weightGrams: '',
      weightPercent: '',
    }, false);
    expect(result.batchOilGrams).toBe('300');
    expect(result.batchSetByUser).toBe(false);
  });
});

describe('removeLine sequence (finding 1 regression)', () => {
  it('removing a line unlocks the batch so a later weight edit grows it instead of stealing', () => {
    // User typed total 1000 (locked), olive 600 / coconut 400. Removing coconut must
    // NOT leave the derived 600 flagged as user-set; adding a line + weight then grows.
    const afterRemove = resyncFromWeights([twoLines[0]]);
    expect(afterRemove.batchOilGrams).toBe('600');
    expect(afterRemove.batchSetByUser).toBe(false);

    const withNew = addRecipeLine(
      afterRemove.lines,
      afterRemove.batchOilGrams,
      { key: 'c', oilId: 'shea-butter', weightGrams: '', weightPercent: '' },
      afterRemove.batchSetByUser,
    );
    const edited = syncWeightEdit(
      withNew.lines,
      'c',
      '500',
      withNew.batchOilGrams,
      withNew.batchSetByUser,
    );
    expect(edited.batchOilGrams).toBe('1100');
    expect(edited.lines[0]).toMatchObject({ weightGrams: '600' });
    expect(edited.lines[1]).toMatchObject({ weightGrams: '500' });
  });
});
