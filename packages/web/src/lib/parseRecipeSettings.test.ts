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
      const { values, errors } = parseRecipeSettings(DEFAULT_SETTINGS);
      expect(errors).toHaveLength(0);
      expect(values).not.toBeNull();
    });

    it('returns null values whenever there is at least one error', () => {
      const { values, errors } = parseRecipeSettings(settings({ superfatPercent: 'abc' }));
      expect(errors.length).toBeGreaterThan(0);
      expect(values).toBeNull();
    });
  });

  describe('superfatPercent', () => {
    it('parses a valid superfat percent', () => {
      const { values, errors } = parseRecipeSettings(settings({ superfatPercent: '5' }));
      expect(errors).toHaveLength(0);
      expect(values!.superfatPercent).toBe(5);
    });

    it('treats an empty superfat percent as 0 (not an error)', () => {
      const { values, errors } = parseRecipeSettings(settings({ superfatPercent: '' }));
      expect(errors).toHaveLength(0);
      expect(values!.superfatPercent).toBe(0);
    });

    it('rejects a non-numeric superfat percent', () => {
      const { values, errors } = parseRecipeSettings(settings({ superfatPercent: 'abc' }));
      expect(errors).toEqual(['Invalid superfat %']);
      expect(values).toBeNull();
    });

    it('rejects a negative superfat percent', () => {
      const { errors } = parseRecipeSettings(settings({ superfatPercent: '-1' }));
      expect(errors).toEqual(['Invalid superfat %']);
    });

    it('accepts superfat percent at the boundary of 50', () => {
      const { values, errors } = parseRecipeSettings(settings({ superfatPercent: '50' }));
      expect(errors).toHaveLength(0);
      expect(values!.superfatPercent).toBe(50);
    });

    it('rejects superfat percent above 50', () => {
      const { errors, values } = parseRecipeSettings(settings({ superfatPercent: '51' }));
      expect(errors).toEqual(['Superfat must be between 0 and 50']);
      expect(values).toBeNull();
    });
  });

  describe('purity — conditional by lyeType', () => {
    it('naoh: valid NaOH purity produces no error', () => {
      const { errors, values } = parseRecipeSettings(
        settings({ lyeType: 'naoh', naohPurityPercent: '96' }),
      );
      expect(errors).toHaveLength(0);
      expect(values!.naohPurityPercent).toBe(96);
    });

    it('naoh: invalid NaOH purity is an error', () => {
      const { errors, values } = parseRecipeSettings(
        settings({ lyeType: 'naoh', naohPurityPercent: '0' }),
      );
      expect(errors).toEqual(['NaOH purity % must be between 1 and 100']);
      expect(values).toBeNull();
    });

    it('naoh: an invalid-but-unused KOH purity produces no error and is undefined', () => {
      const { errors, values } = parseRecipeSettings(
        settings({ lyeType: 'naoh', naohPurityPercent: '96', kohPurityPercent: '999' }),
      );
      expect(errors).toHaveLength(0);
      expect(values!.kohPurityPercent).toBeUndefined();
    });

    it('naoh: a valid-but-unused KOH purity still parses through (not forced undefined)', () => {
      const { errors, values } = parseRecipeSettings(
        settings({ lyeType: 'naoh', naohPurityPercent: '96', kohPurityPercent: '77' }),
      );
      expect(errors).toHaveLength(0);
      expect(values!.kohPurityPercent).toBe(77);
    });

    it('koh: valid KOH purity produces no error', () => {
      const { errors, values } = parseRecipeSettings(
        settings({ lyeType: 'koh', kohPurityPercent: '90' }),
      );
      expect(errors).toHaveLength(0);
      expect(values!.kohPurityPercent).toBe(90);
    });

    it('koh: invalid KOH purity is an error', () => {
      const { errors, values } = parseRecipeSettings(
        settings({ lyeType: 'koh', kohPurityPercent: '101' }),
      );
      expect(errors).toEqual(['KOH purity % must be between 1 and 100']);
      expect(values).toBeNull();
    });

    it('koh: an invalid-but-unused NaOH purity produces no error and is undefined', () => {
      const { errors, values } = parseRecipeSettings(
        settings({ lyeType: 'koh', kohPurityPercent: '90', naohPurityPercent: '-5' }),
      );
      expect(errors).toHaveLength(0);
      expect(values!.naohPurityPercent).toBeUndefined();
    });

    it('dual: valid NaOH and KOH purity produce no error', () => {
      const { errors, values } = parseRecipeSettings(
        settings({
          lyeType: 'dual',
          naohPurityPercent: '100',
          kohPurityPercent: '90',
          kohBlendPercent: '5',
        }),
      );
      expect(errors).toHaveLength(0);
      expect(values!.naohPurityPercent).toBe(100);
      expect(values!.kohPurityPercent).toBe(90);
    });

    it('dual: invalid NaOH purity is an error', () => {
      const { errors } = parseRecipeSettings(
        settings({
          lyeType: 'dual',
          naohPurityPercent: '0',
          kohPurityPercent: '90',
          kohBlendPercent: '5',
        }),
      );
      expect(errors).toContain('NaOH purity % must be between 1 and 100');
    });

    it('dual: invalid KOH purity is an error', () => {
      const { errors } = parseRecipeSettings(
        settings({
          lyeType: 'dual',
          naohPurityPercent: '100',
          kohPurityPercent: '0',
          kohBlendPercent: '5',
        }),
      );
      expect(errors).toContain('KOH purity % must be between 1 and 100');
    });

    it('dual: both invalid purities produce both errors, NaOH before KOH', () => {
      const { errors } = parseRecipeSettings(
        settings({
          lyeType: 'dual',
          naohPurityPercent: '0',
          kohPurityPercent: '0',
          kohBlendPercent: '5',
        }),
      );
      expect(errors).toEqual([
        'NaOH purity % must be between 1 and 100',
        'KOH purity % must be between 1 and 100',
      ]);
    });
  });

  describe('kohBlendPercent — dual only', () => {
    it('is undefined and unvalidated when lyeType is naoh, even if garbage', () => {
      const { errors, values } = parseRecipeSettings(
        settings({ lyeType: 'naoh', kohBlendPercent: 'not-a-number' }),
      );
      expect(errors).toHaveLength(0);
      expect(values!.kohBlendPercent).toBeUndefined();
    });

    it('is undefined and unvalidated when lyeType is koh, even if garbage', () => {
      const { errors, values } = parseRecipeSettings(
        settings({ lyeType: 'koh', kohBlendPercent: 'not-a-number' }),
      );
      expect(errors).toHaveLength(0);
      expect(values!.kohBlendPercent).toBeUndefined();
    });

    it('dual: valid blend percent parses through', () => {
      const { errors, values } = parseRecipeSettings(
        settings({ lyeType: 'dual', kohBlendPercent: '10' }),
      );
      expect(errors).toHaveLength(0);
      expect(values!.kohBlendPercent).toBe(10);
    });

    it('dual: empty blend percent is treated as 0 (not an error)', () => {
      const { errors, values } = parseRecipeSettings(
        settings({ lyeType: 'dual', kohBlendPercent: '' }),
      );
      expect(errors).toHaveLength(0);
      expect(values!.kohBlendPercent).toBe(0);
    });

    it('dual: non-numeric blend percent is an error', () => {
      const { errors, values } = parseRecipeSettings(
        settings({ lyeType: 'dual', kohBlendPercent: 'abc' }),
      );
      expect(errors).toEqual(['Invalid KOH blend %']);
      expect(values).toBeNull();
    });

    it('dual: negative blend percent is an error', () => {
      const { errors } = parseRecipeSettings(
        settings({ lyeType: 'dual', kohBlendPercent: '-1' }),
      );
      expect(errors).toEqual(['Invalid KOH blend %']);
    });

    it('dual: blend percent at the boundary of 50 is valid', () => {
      const { errors, values } = parseRecipeSettings(
        settings({ lyeType: 'dual', kohBlendPercent: '50' }),
      );
      expect(errors).toHaveLength(0);
      expect(values!.kohBlendPercent).toBe(50);
    });

    it('dual: blend percent above 50 is an error', () => {
      const { errors } = parseRecipeSettings(
        settings({ lyeType: 'dual', kohBlendPercent: '51' }),
      );
      expect(errors).toEqual(['KOH blend % must be between 0 and 50']);
    });
  });

  describe('water — percent_of_oils mode', () => {
    it('parses a valid water percent', () => {
      const { errors, values } = parseRecipeSettings(
        settings({ waterMode: 'percent_of_oils', waterPercentOfOils: '33' }),
      );
      expect(errors).toHaveLength(0);
      expect(values!.waterMode).toBe('percent_of_oils');
      expect(values!.waterPercentOfOils).toBe(33);
    });

    it('treats an empty water percent as not an error, value undefined', () => {
      const { errors, values } = parseRecipeSettings(
        settings({ waterMode: 'percent_of_oils', waterPercentOfOils: '' }),
      );
      expect(errors).toHaveLength(0);
      expect(values!.waterPercentOfOils).toBeUndefined();
    });

    it('rejects a non-numeric water percent', () => {
      const { errors, values } = parseRecipeSettings(
        settings({ waterMode: 'percent_of_oils', waterPercentOfOils: 'abc' }),
      );
      expect(errors).toEqual(['Invalid water %']);
      expect(values).toBeNull();
    });

    it('rejects a negative water percent', () => {
      const { errors } = parseRecipeSettings(
        settings({ waterMode: 'percent_of_oils', waterPercentOfOils: '-1' }),
      );
      expect(errors).toEqual(['Invalid water %']);
    });
  });

  describe('water — lye_concentration mode', () => {
    it('parses a valid lye concentration', () => {
      const { errors, values } = parseRecipeSettings(
        settings({ waterMode: 'lye_concentration', lyeConcentrationPercent: '33.33' }),
      );
      expect(errors).toHaveLength(0);
      expect(values!.waterMode).toBe('lye_concentration');
      expect(values!.lyeConcentrationPercent).toBe(33.33);
    });

    it('treats an empty lye concentration as not an error, value undefined', () => {
      const { errors, values } = parseRecipeSettings(
        settings({ waterMode: 'lye_concentration', lyeConcentrationPercent: '' }),
      );
      expect(errors).toHaveLength(0);
      expect(values!.lyeConcentrationPercent).toBeUndefined();
    });

    it('rejects a zero lye concentration', () => {
      const { errors, values } = parseRecipeSettings(
        settings({ waterMode: 'lye_concentration', lyeConcentrationPercent: '0' }),
      );
      expect(errors).toEqual(['Lye concentration % must be greater than 0']);
      expect(values).toBeNull();
    });

    it('rejects a lye concentration of exactly 100', () => {
      const { errors, values } = parseRecipeSettings(
        settings({ waterMode: 'lye_concentration', lyeConcentrationPercent: '100' }),
      );
      expect(errors).toEqual(['Lye concentration % must be less than 100']);
      expect(values).toBeNull();
    });

    it('rejects a lye concentration above 100', () => {
      const { errors } = parseRecipeSettings(
        settings({ waterMode: 'lye_concentration', lyeConcentrationPercent: '150' }),
      );
      expect(errors).toEqual(['Lye concentration % must be less than 100']);
    });
  });

  describe('water — lye_water_ratio mode', () => {
    it('parses a valid ratio', () => {
      const { errors, values } = parseRecipeSettings(
        settings({ waterMode: 'lye_water_ratio', lyeWaterRatio: '2' }),
      );
      expect(errors).toHaveLength(0);
      expect(values!.waterMode).toBe('lye_water_ratio');
      expect(values!.lyeWaterRatio).toBe(2);
    });

    it('treats an empty ratio as not an error, value undefined', () => {
      const { errors, values } = parseRecipeSettings(
        settings({ waterMode: 'lye_water_ratio', lyeWaterRatio: '' }),
      );
      expect(errors).toHaveLength(0);
      expect(values!.lyeWaterRatio).toBeUndefined();
    });

    it('rejects a zero ratio', () => {
      const { errors, values } = parseRecipeSettings(
        settings({ waterMode: 'lye_water_ratio', lyeWaterRatio: '0' }),
      );
      expect(errors).toEqual(['Water : lye ratio must be greater than 0']);
      expect(values).toBeNull();
    });
  });

  describe('error order', () => {
    it('orders superfat, then NaOH/KOH purity, then dual blend, then water errors', () => {
      const { errors } = parseRecipeSettings(
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
      expect(errors).toEqual([
        'Superfat must be between 0 and 50',
        'NaOH purity % must be between 1 and 100',
        'KOH purity % must be between 1 and 100',
        'KOH blend % must be between 0 and 50',
        'Lye concentration % must be greater than 0',
      ]);
    });
  });

  describe('lyeType and waterMode pass-through', () => {
    it('always includes lyeType and waterMode in values on success', () => {
      const { values } = parseRecipeSettings(
        settings({ lyeType: 'koh', kohPurityPercent: '90', waterMode: 'lye_water_ratio', lyeWaterRatio: '2' }),
      );
      expect(values!.lyeType).toBe('koh');
      expect(values!.waterMode).toBe('lye_water_ratio');
    });
  });
});
