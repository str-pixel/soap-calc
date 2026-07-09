import { test, expect } from 'vitest';
import { purityFieldsFor, WATER_FIELDS } from './settingsFields';

test('naoh shows one purity field, dual shows both', () => {
  expect(purityFieldsFor('naoh').map((f) => f.key)).toEqual(['naohPurityPercent']);
  expect(purityFieldsFor('koh').map((f) => f.key)).toEqual(['kohPurityPercent']);
  expect(purityFieldsFor('dual').map((f) => f.key)).toEqual(['naohPurityPercent', 'kohPurityPercent']);
});

test('each water mode maps to its field', () => {
  expect(WATER_FIELDS.percent_of_oils.key).toBe('waterPercentOfOils');
  expect(WATER_FIELDS.lye_concentration.key).toBe('lyeConcentrationPercent');
  expect(WATER_FIELDS.lye_water_ratio.key).toBe('lyeWaterRatio');
});
