import { describe, expect, it } from 'vitest';
import { LS_SOAP_QUALITY_ORDER, lsSoapQualities } from '@soap-calc/core';
import { calculateFattyAcidsForRecipe } from './calculateFattyAcids';
import { OILS } from './oils';
import { DEFAULT_SETTINGS } from './recipe';

const recipe = (...parts: Array<[string, string]>) =>
  calculateFattyAcidsForRecipe(
    parts.map(([oilId, weightGrams], i) => ({ key: `k${i}`, oilId, weightGrams })),
    DEFAULT_SETTINGS,
  );

describe('liquid soap qualities on the catalog the app loads', () => {
  // The meters draw a 0–100 track with aria-valuemax 100. A recipe's value is a weight-average of
  // its oils', so every oil alone bounds every recipe (the highest measured: 94, conditioning).
  it('stay within 0–100 and finite for every oil in the catalog', () => {
    let oilsWithData = 0;
    for (const oil of OILS) {
      const r = recipe([oil.id, '1000']);
      if (!r.profile) continue;
      oilsWithData++;
      const q = lsSoapQualities(r.profile);
      for (const key of LS_SOAP_QUALITY_ORDER) {
        expect(Number.isFinite(q[key]) && q[key] >= 0 && q[key] <= 100, `${oil.id} ${key} = ${q[key]}`).toBe(true);
      }
    }
    expect(oilsWithData).toBeGreaterThan(100);
  });

  it("read the book's own castor recipe the way its table does: castor raises lather, not conditioning", () => {
    // 30% babassu, 25% castor, 30% high-oleic sunflower, 15% cocoa butter (LS:12356-12359, p397).
    const q = lsSoapQualities(
      recipe(['babassu-oil', '300'], ['castor-oil', '250'], ['sunflower-oil-high-oleic', '300'], ['cocoa-butter', '150'])
        .profile!,
    );
    expect(q.bodyLatherStability).toBeCloseTo(14.6, 0);
    expect(q.cleansing).toBeCloseTo(18.9, 0);
    expect(q.conditioning).toBeCloseTo(38.2, 0); // 60.7 if ricinoleic counted
    expect(q.lather).toBeCloseTo(41.4, 0); // 18.9 if it did not
  });

  it("leave coconut's C8/C10 out of cleansing, as the table's eight acids do", () => {
    // The bar-soap cleansing score counts caprylic and capric and reads 79.3 on 100% coconut.
    expect(lsSoapQualities(recipe(['coconut-oil-76', '1000']).profile!).cleansing).toBeCloseTo(65.9, 0);
  });
});
