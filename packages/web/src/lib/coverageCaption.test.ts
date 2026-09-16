import { describe, expect, it } from 'vitest';
import { isPartialCoverage } from '@soap-calc/core';
import { calculateFattyAcidsForRecipe } from './calculateFattyAcids';
import {
  fattyAcidBasisCaption,
  indexesCoverageCaption,
  scoresCoverageCaption,
} from './coverageCaption';
import { OILS } from './oils';
import { DEFAULT_SETTINGS } from './recipe';

const recipe = (...parts: Array<[string, string]>) =>
  calculateFattyAcidsForRecipe(
    parts.map(([oilId, weightGrams], i) => ({ key: `k${i}`, oilId, weightGrams })),
    DEFAULT_SETTINGS,
  );

describe('coverage captions', () => {
  it('say what the fatty-acid readings are a percent of', () => {
    // Complete data needs no coverage clause.
    expect(fattyAcidBasisCaption(recipe(['evening-primrose-oil', '1000']))).toBe('Percent of oil weight');
    // Hazelnut's profile sums to 93: no oil is missing, its listed acids are 93% of its weight.
    expect(fattyAcidBasisCaption(recipe(['hazelnut-oil', '1000']))).toBe(
      'Percent of oil weight, based on fatty-acid data for 93% of recipe oil weight',
    );
    // With an oil missing, the profile is rescaled over the oils that have data, so a reading is
    // a percent of their weight: grapeseed's linoleic reads 68% here, 34% of the whole recipe.
    expect(fattyAcidBasisCaption(recipe(['grapeseed-oil', '500'], ['abyssinian-oil', '500']))).toBe(
      'Percent of the weight of oils with data, estimated from fatty-acid data for 50% of recipe oil weight (no data: Abyssinian Oil)',
    );
  });

  it('word the scores and iodine/INS lines by what each covers', () => {
    expect(scoresCoverageCaption({ coveragePercent: 100, missingOilIds: [] })).toBeNull();
    expect(scoresCoverageCaption({ coveragePercent: 93, missingOilIds: [] })).toBe(
      'Scores based on fatty-acid data for 93% of recipe oil weight',
    );
    expect(scoresCoverageCaption({ coveragePercent: 74.2, missingOilIds: ['beeswax'] })).toBe(
      'Scores estimated from fatty-acid data for 74% of recipe oil weight (no data: Beeswax)',
    );
    expect(indexesCoverageCaption({ coveragePercent: 100, missingOilIds: [] })).toBeNull();
    expect(indexesCoverageCaption({ coveragePercent: 95, missingOilIds: ['pine-tar'] })).toBe(
      'Iodine/INS based on 95% of recipe oil weight (no data: Pine Tar)',
    );
  });

  // Built to break "a partial caption never says 100% and always names a missing oil": every
  // catalog oil alone, then beside a no-data oil weighing 4 g, 0.5 g, and 1e-14 g (the last
  // reachable only by importing a file, where coverage computes as exactly 100).
  it('never print 100% on a partial caption and always name a missing oil, across the catalog', () => {
    let partial = 0;
    for (const oil of OILS) {
      for (const tiny of [null, '4', '0.5', '0.00000000000001']) {
        const r = tiny ? recipe([oil.id, '1000'], ['abyssinian-oil', tiny]) : recipe([oil.id, '1000']);
        if (!r.profile) continue;
        const where = `${oil.id} beside ${tiny ?? 'nothing'}`;
        const captions = [
          fattyAcidBasisCaption(r),
          scoresCoverageCaption(r) ?? '',
          indexesCoverageCaption(r) ?? '',
        ];
        if (isPartialCoverage(r.coveragePercent, r.missingOilIds.length)) {
          partial++;
          for (const c of captions) expect(c, where).not.toMatch(/(^|[^.\d])100%/);
          expect(captions[1], where).not.toBe('');
        }
        if (r.missingOilIds.length > 0) {
          for (const c of captions) expect(c, where).toContain('(no data: Abyssinian Oil)');
        }
      }
    }
    expect(partial).toBeGreaterThan(300);
  });
});
