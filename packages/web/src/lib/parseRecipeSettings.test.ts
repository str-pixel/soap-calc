import { describe, expect, it } from 'vitest';
import { parseRecipeSettings } from './parseRecipeSettings';
import { DEFAULT_SETTINGS } from './recipe';
import type { RecipeSettings } from './recipe';

function settings(overrides: Partial<RecipeSettings>): RecipeSettings {
  return { ...DEFAULT_SETTINGS, ...overrides };
}

describe('parseRecipeSettings', () => {
  describe('values vs errors invariant', () => {
    it('returns non-null values and no errors for the default settings', () => {
      const result = parseRecipeSettings(DEFAULT_SETTINGS);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.values).not.toBeNull();
    });

    it('returns null values whenever there is at least one error', () => {
      const result = parseRecipeSettings(settings({ superfatPercent: 'abc' }));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('superfatPercent', () => {
    it('parses a valid superfat percent', () => {
      const result = parseRecipeSettings(settings({ superfatPercent: '5' }));
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.values.superfatPercent).toBe(5);
    });

    it('treats an empty superfat percent as 0 (not an error)', () => {
      const result = parseRecipeSettings(settings({ superfatPercent: '' }));
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.values.superfatPercent).toBe(0);
    });

    it('rejects a non-numeric superfat percent', () => {
      const result = parseRecipeSettings(settings({ superfatPercent: 'abc' }));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors).toEqual(['Invalid superfat %']);
    });

    it('rejects a negative superfat percent', () => {
      const result = parseRecipeSettings(settings({ superfatPercent: '-1' }));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors).toEqual(['Invalid superfat %']);
    });

    it('accepts superfat percent at the boundary of 50', () => {
      const result = parseRecipeSettings(settings({ superfatPercent: '50' }));
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.values.superfatPercent).toBe(50);
    });

    it('rejects superfat percent above 50', () => {
      const result = parseRecipeSettings(settings({ superfatPercent: '51' }));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors).toEqual(['Superfat must be between 0 and 50']);
    });

    it('accepts a negative superfat when allowNegativeSuperfat is set (LS lye excess)', () => {
      const result = parseRecipeSettings(settings({ superfatPercent: '-3' }), {
        allowNegativeSuperfat: true,
      });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.values.superfatPercent).toBe(-3);
    });

    it('rejects a negative superfat below the -5 floor even when allowed', () => {
      const result = parseRecipeSettings(settings({ superfatPercent: '-6' }), {
        allowNegativeSuperfat: true,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors).toEqual(['Invalid superfat %']);
    });

    it('still rejects a negative superfat by default (CP/HP)', () => {
      const result = parseRecipeSettings(settings({ superfatPercent: '-1' }));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors).toEqual(['Invalid superfat %']);
    });
  });

  describe('purity — conditional by lyeType', () => {
    it('naoh: valid NaOH purity produces no error', () => {
      const result = parseRecipeSettings(
        settings({ lyeType: 'naoh', naohPurityPercent: '96' }),
      );
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.values.naohPurityPercent).toBe(96);
    });

    it('naoh: invalid NaOH purity is an error', () => {
      const result = parseRecipeSettings(
        settings({ lyeType: 'naoh', naohPurityPercent: '0' }),
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toEqual(['NaOH purity % must be between 1 and 100']);
      }
    });

    it('naoh: an invalid-but-unused KOH purity produces no error and is undefined', () => {
      const result = parseRecipeSettings(
        settings({ lyeType: 'naoh', naohPurityPercent: '96', kohPurityPercent: '999' }),
      );
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.values.kohPurityPercent).toBeUndefined();
    });

    it('naoh: a valid-but-unused KOH purity still parses through (not forced undefined)', () => {
      const result = parseRecipeSettings(
        settings({ lyeType: 'naoh', naohPurityPercent: '96', kohPurityPercent: '77' }),
      );
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.values.kohPurityPercent).toBe(77);
    });

    it('koh: valid KOH purity produces no error', () => {
      const result = parseRecipeSettings(
        settings({ lyeType: 'koh', kohPurityPercent: '90' }),
      );
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.values.kohPurityPercent).toBe(90);
    });

    it('koh: invalid KOH purity is an error', () => {
      const result = parseRecipeSettings(
        settings({ lyeType: 'koh', kohPurityPercent: '101' }),
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toEqual(['KOH purity % must be between 1 and 100']);
      }
    });

    it('koh: an invalid-but-unused NaOH purity produces no error and is undefined', () => {
      const result = parseRecipeSettings(
        settings({ lyeType: 'koh', kohPurityPercent: '90', naohPurityPercent: '-5' }),
      );
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.values.naohPurityPercent).toBeUndefined();
    });

    it('koh: a valid-but-unused NaOH purity still parses through (not forced undefined)', () => {
      const result = parseRecipeSettings(
        settings({ lyeType: 'koh', kohPurityPercent: '90', naohPurityPercent: '88' }),
      );
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.values.naohPurityPercent).toBe(88);
    });

    it('dual: valid NaOH and KOH purity produce no error', () => {
      const result = parseRecipeSettings(
        settings({
          lyeType: 'dual',
          naohPurityPercent: '100',
          kohPurityPercent: '90',
          kohBlendPercent: '5',
        }),
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.values.naohPurityPercent).toBe(100);
        expect(result.values.kohPurityPercent).toBe(90);
      }
    });

    it('dual: invalid NaOH purity is an error', () => {
      const result = parseRecipeSettings(
        settings({
          lyeType: 'dual',
          naohPurityPercent: '0',
          kohPurityPercent: '90',
          kohBlendPercent: '5',
        }),
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toContain('NaOH purity % must be between 1 and 100');
      }
    });

    it('dual: invalid KOH purity is an error', () => {
      const result = parseRecipeSettings(
        settings({
          lyeType: 'dual',
          naohPurityPercent: '100',
          kohPurityPercent: '0',
          kohBlendPercent: '5',
        }),
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toContain('KOH purity % must be between 1 and 100');
      }
    });

    it('dual: both invalid purities produce both errors, NaOH before KOH', () => {
      const result = parseRecipeSettings(
        settings({
          lyeType: 'dual',
          naohPurityPercent: '0',
          kohPurityPercent: '0',
          kohBlendPercent: '5',
        }),
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toEqual([
          'NaOH purity % must be between 1 and 100',
          'KOH purity % must be between 1 and 100',
        ]);
      }
    });
  });

  describe('kohBlendPercent — dual only', () => {
    it('is undefined and unvalidated when lyeType is naoh, even if garbage', () => {
      const result = parseRecipeSettings(
        settings({ lyeType: 'naoh', kohBlendPercent: 'not-a-number' }),
      );
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.values.kohBlendPercent).toBeUndefined();
    });

    it('is undefined and unvalidated when lyeType is koh, even if garbage', () => {
      const result = parseRecipeSettings(
        settings({ lyeType: 'koh', kohBlendPercent: 'not-a-number' }),
      );
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.values.kohBlendPercent).toBeUndefined();
    });

    it('dual: valid blend percent parses through', () => {
      const result = parseRecipeSettings(
        settings({ lyeType: 'dual', kohBlendPercent: '10' }),
      );
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.values.kohBlendPercent).toBe(10);
    });

    it('dual: empty blend percent is treated as 0 (not an error)', () => {
      const result = parseRecipeSettings(
        settings({ lyeType: 'dual', kohBlendPercent: '' }),
      );
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.values.kohBlendPercent).toBe(0);
    });

    it('dual: non-numeric blend percent is an error', () => {
      const result = parseRecipeSettings(
        settings({ lyeType: 'dual', kohBlendPercent: 'abc' }),
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors).toEqual(['Invalid KOH blend %']);
    });

    it('dual: negative blend percent is an error', () => {
      const result = parseRecipeSettings(
        settings({ lyeType: 'dual', kohBlendPercent: '-1' }),
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors).toEqual(['Invalid KOH blend %']);
    });

    it('dual: blend percent at the boundary of 50 is valid', () => {
      const result = parseRecipeSettings(
        settings({ lyeType: 'dual', kohBlendPercent: '50' }),
      );
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.values.kohBlendPercent).toBe(50);
    });

    it('dual: blend percent above 50 is an error', () => {
      const result = parseRecipeSettings(
        settings({ lyeType: 'dual', kohBlendPercent: '51' }),
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toEqual(['KOH blend % must be between 0 and 50']);
      }
    });
  });

  describe('water — percent_of_oils mode', () => {
    it('parses a valid water percent', () => {
      const result = parseRecipeSettings(
        settings({ waterMode: 'percent_of_oils', waterPercentOfOils: '33' }),
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.values.waterMode).toBe('percent_of_oils');
        expect(result.values.waterPercentOfOils).toBe(33);
      }
    });

    it('treats an empty water percent as not an error, value undefined', () => {
      const result = parseRecipeSettings(
        settings({ waterMode: 'percent_of_oils', waterPercentOfOils: '' }),
      );
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.values.waterPercentOfOils).toBeUndefined();
    });

    it('rejects a non-numeric water percent', () => {
      const result = parseRecipeSettings(
        settings({ waterMode: 'percent_of_oils', waterPercentOfOils: 'abc' }),
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors).toEqual(['Invalid water %']);
    });

    it('rejects a negative water percent', () => {
      const result = parseRecipeSettings(
        settings({ waterMode: 'percent_of_oils', waterPercentOfOils: '-1' }),
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors).toEqual(['Invalid water %']);
    });
  });

  describe('water — lye_concentration mode', () => {
    it('parses a valid lye concentration', () => {
      const result = parseRecipeSettings(
        settings({ waterMode: 'lye_concentration', lyeConcentrationPercent: '33.33' }),
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.values.waterMode).toBe('lye_concentration');
        expect(result.values.lyeConcentrationPercent).toBe(33.33);
      }
    });

    it('treats an empty lye concentration as not an error, value undefined', () => {
      const result = parseRecipeSettings(
        settings({ waterMode: 'lye_concentration', lyeConcentrationPercent: '' }),
      );
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.values.lyeConcentrationPercent).toBeUndefined();
    });

    it('rejects a zero lye concentration', () => {
      const result = parseRecipeSettings(
        settings({ waterMode: 'lye_concentration', lyeConcentrationPercent: '0' }),
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toEqual(['Lye concentration % must be greater than 0']);
      }
    });

    it('rejects a lye concentration of exactly 100', () => {
      const result = parseRecipeSettings(
        settings({ waterMode: 'lye_concentration', lyeConcentrationPercent: '100' }),
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toEqual(['Lye concentration % must be less than 100']);
      }
    });

    it('rejects a lye concentration above 100', () => {
      const result = parseRecipeSettings(
        settings({ waterMode: 'lye_concentration', lyeConcentrationPercent: '150' }),
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toEqual(['Lye concentration % must be less than 100']);
      }
    });
  });

  describe('water — lye_water_ratio mode', () => {
    it('parses a valid ratio', () => {
      const result = parseRecipeSettings(
        settings({ waterMode: 'lye_water_ratio', lyeWaterRatio: '2' }),
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.values.waterMode).toBe('lye_water_ratio');
        expect(result.values.lyeWaterRatio).toBe(2);
      }
    });

    it('treats an empty ratio as not an error, value undefined', () => {
      const result = parseRecipeSettings(
        settings({ waterMode: 'lye_water_ratio', lyeWaterRatio: '' }),
      );
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.values.lyeWaterRatio).toBeUndefined();
    });

    it('rejects a zero ratio', () => {
      const result = parseRecipeSettings(
        settings({ waterMode: 'lye_water_ratio', lyeWaterRatio: '0' }),
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toEqual(['Water : lye ratio must be greater than 0']);
      }
    });
  });

  describe('error order', () => {
    it('orders superfat, then NaOH/KOH purity, then dual blend, then water errors', () => {
      const result = parseRecipeSettings(
        settings({
          superfatPercent: '999',
          lyeType: 'dual',
          naohPurityPercent: '0',
          kohPurityPercent: '0',
          kohBlendPercent: '999',
          waterMode: 'lye_concentration',
          lyeConcentrationPercent: '0',
        }),
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toEqual([
          'Superfat must be between 0 and 50',
          'NaOH purity % must be between 1 and 100',
          'KOH purity % must be between 1 and 100',
          'KOH blend % must be between 0 and 50',
          'Lye concentration % must be greater than 0',
        ]);
      }
    });
  });

  describe('lyeType and waterMode pass-through', () => {
    it('always includes lyeType and waterMode in values on success', () => {
      const result = parseRecipeSettings(
        settings({ lyeType: 'koh', kohPurityPercent: '90', waterMode: 'lye_water_ratio', lyeWaterRatio: '2' }),
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.values.lyeType).toBe('koh');
        expect(result.values.waterMode).toBe('lye_water_ratio');
      }
    });
  });
});
