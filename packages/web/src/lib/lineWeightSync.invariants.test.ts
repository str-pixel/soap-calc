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

  function sumGrams(lines: { weightGrams: string }[]): number {
    return lines.reduce((sum, line) => sum + Number(line.weightGrams || 0), 0);
  }

  it('finding #2: 10 near-equal lines under a locked batch stay summed to the batch after an edit', () => {
    // Editing one line to near the full batch leaves the other 9 lines with very little
    // headroom; the rounding remainder must carry across multiple lines rather than
    // dumping onto (and clamping) a single one, which previously lost grams silently.
    const lines = Array.from({ length: 10 }, (_, i) => ({
      key: `k${i}`,
      oilId: 'olive-oil',
      weightGrams: '100',
      weightPercent: '10',
    }));
    const result = syncWeightEdit(lines, 'k0', '1000', '1006', true);
    expect(result.batchOilGrams).toBe('1006');
    expect(sumGrams(result.lines)).toBe(1006);
    for (const line of result.lines) {
      expect(Number(line.weightGrams || 0)).toBeGreaterThanOrEqual(0);
    }
  });

  it('finding #2: 40 near-equal lines under a locked batch stay summed to the batch after an edit', () => {
    const lines = Array.from({ length: 40 }, (_, i) => ({
      key: `k${i}`,
      oilId: 'olive-oil',
      weightGrams: '25',
      weightPercent: '2.5',
    }));
    // Batch total of 1013 (40 * 25 + 13) forces a non-trivial rounding remainder; editing
    // one line to near the full batch squeezes the other 39 lines to near-zero headroom.
    const result = syncWeightEdit(lines, 'k0', '990', '1013', true);
    expect(result.batchOilGrams).toBe('1013');
    expect(sumGrams(result.lines)).toBe(1013);
    for (const line of result.lines) {
      expect(Number(line.weightGrams || 0)).toBeGreaterThanOrEqual(0);
    }
  });
});
