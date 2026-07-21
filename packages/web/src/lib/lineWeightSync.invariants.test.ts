import { describe, expect, it } from 'vitest';
import { syncPercentEdit, syncWeightEdit } from './lineWeightSync';
import type { RecipeLine } from './recipe';

describe('recipe sync invariants (independent entry)', () => {
  const twoLines: RecipeLine[] = [
    { key: 'a', oilId: 'olive-oil', weightGrams: '600', weightPercent: '60' },
    { key: 'b', oilId: 'coconut-oil-76', weightGrams: '400', weightPercent: '40' },
  ];

  it('single-line percent edit sets grams from the batch anchor', () => {
    const single = [{ key: 'a', oilId: 'olive-oil', weightGrams: '1000', weightPercent: '100' }];
    const result = syncPercentEdit(single, 'a', '80', '1000', true);
    expect(result.batchOilGrams).toBe('1000');
    expect(result.lines[0]).toMatchObject({ weightGrams: '800', weightPercent: '80' });
  });

  it('does NOT clamp an edited weight to the batch — it just drives that line past 100 %', () => {
    const result = syncWeightEdit(twoLines, 'a', '1500', '1000', true);
    expect(result.batchOilGrams).toBe('1000');
    expect(result.lines[0]).toMatchObject({ weightGrams: '1500', weightPercent: '150' });
    expect(result.lines[1]).toBe(twoLines[1]); // sibling untouched
  });

  // The central invariant: an edit to one line returns every OTHER line by reference
  // identity (never a copy with shifted numbers), across many lines and both columns.
  const many: RecipeLine[] = Array.from({ length: 12 }, (_, i) => ({
    key: `k${i}`,
    oilId: 'olive-oil',
    weightGrams: '50',
    weightPercent: '5',
  }));

  it('editing any single line leaves all other lines referentially identical', () => {
    for (const editKey of ['k0', 'k5', 'k11']) {
      const w = syncWeightEdit(many, editKey, '123', '1000', true);
      const p = syncPercentEdit(many, editKey, '12.5', '1000', true);
      for (let i = 0; i < many.length; i++) {
        if (many[i].key === editKey) continue;
        expect(w.lines[i], `weight edit left ${many[i].key} untouched`).toBe(many[i]);
        expect(p.lines[i], `percent edit left ${many[i].key} untouched`).toBe(many[i]);
      }
    }
  });

  it('never emits a negative weight or percent', () => {
    for (const value of ['', '0', '5', '999999']) {
      for (const out of [
        syncWeightEdit(many, 'k0', value, '1000', true),
        syncPercentEdit(many, 'k0', value, '1000', true),
      ]) {
        for (const line of out.lines) {
          expect(Number(line.weightGrams || 0)).toBeGreaterThanOrEqual(0);
          expect(Number(line.weightPercent || 0)).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });
});
