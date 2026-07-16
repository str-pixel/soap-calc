import { describe, expect, it } from 'vitest';
import { syncPercentEdit, syncWeightEdit } from './lineWeightSync';

describe('recipe sync invariants', () => {
  const twoLines = [
    { key: 'a', oilId: 'olive-oil', weightGrams: '600', weightPercent: '60' },
    { key: 'b', oilId: 'coconut-oil-76', weightGrams: '400', weightPercent: '40' },
  ];

  it('keeps batch fixed when editing percent on a single-line recipe with a user-set total', () => {
    const single = [{ key: 'a', oilId: 'olive-oil', weightGrams: '1000', weightPercent: '100' }];
    const result = syncPercentEdit(single, 'a', '80', '1000', true);
    expect(result.batchOilGrams).toBe('1000');
    expect(result.lines[0]).toMatchObject({ weightGrams: '800', weightPercent: '80' });
  });

  it('clamps edited weight to batch when the user set the total explicitly', () => {
    const result = syncWeightEdit(twoLines, 'a', '1500', '1000', true);
    expect(result.batchOilGrams).toBe('1000');
    expect(result.lines[0].weightGrams).toBe('1000');
    expect(result.lines[1].weightGrams).toBe('');
  });
});
