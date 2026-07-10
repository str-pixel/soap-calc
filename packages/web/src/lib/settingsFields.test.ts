import { describe, test, it, expect } from 'vitest';
import {
  purityFieldsFor,
  WATER_FIELDS,
  LYE_TYPE_LABELS,
  WATER_MODE_LABELS,
  lyeChoicesFor,
  waterModeChoicesFor,
} from './settingsFields';

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

describe('process-aware field choices', () => {
  it('labels every lye type and water mode', () => {
    expect(LYE_TYPE_LABELS.koh).toContain('KOH');
    expect(WATER_MODE_LABELS.lye_water_ratio).toContain('ratio');
  });

  it('lyeChoicesFor restricts by process', () => {
    expect(lyeChoicesFor('ls')).toEqual(['koh', 'dual']);
    expect(lyeChoicesFor('cp')).toEqual(['naoh', 'dual']);
  });

  it('waterModeChoicesFor returns the process water modes', () => {
    expect(waterModeChoicesFor('cp')).toContain('percent_of_oils');
  });
});
