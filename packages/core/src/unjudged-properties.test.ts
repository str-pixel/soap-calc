import { describe, expect, it } from 'vitest';
import { isJudgedProperty, UNJUDGED_PROPERTIES } from './properties.js';

describe('properties whose band is descriptive, not a verdict', () => {
  it('longevity is shown but not judged', () => {
    expect(UNJUDGED_PROPERTIES.has('longevity')).toBe(true);
    expect(isJudgedProperty('longevity')).toBe(false);
  });

  it('every other property is still judged', () => {
    for (const key of ['hardness', 'cleansing', 'condition', 'bubbly', 'creamy'] as const) {
      expect(isJudgedProperty(key), key).toBe(true);
    }
  });
});
