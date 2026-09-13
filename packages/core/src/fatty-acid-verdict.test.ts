import { describe, expect, it } from 'vitest';
import { FATTY_ACID_DISPLAY_GROUPS } from './formulation-guide.js';
import {
  FATTY_ACID_HIGH_WARNINGS,
  fattyAcidIsTooHigh,
  isFattyAcidHighWarned,
} from './fatty-acid-verdict.js';

describe('which fatty-acid groups may be flagged, and only when high', () => {
  it('warns high only on the groups with a stated failure mode', () => {
    expect(Object.keys(FATTY_ACID_HIGH_WARNINGS).sort()).toEqual(
      ['linoleic', 'linolenic', 'otherSaturated', 'otherUnsaturated', 'trans'].sort(),
    );
  });

  it('never flags lauric+myristic, palmitic+stearic, oleic or ricinoleic, at any value', () => {
    // Being outside these bands is a difference of recipe style, not a fault: the books'
    // own worked recipe reads low lauric, low oleic and high ricinoleic at once.
    for (const key of ['lauricMyristic', 'palmiticStearic', 'oleic', 'ricinoleic'] as const) {
      expect(isFattyAcidHighWarned(key), key).toBe(false);
      for (const v of [0, 50, 100]) expect(fattyAcidIsTooHigh(key, v), `${key} ${v}`).toBe(false);
    }
  });

  it('flags a warned group above its band, judged on the figure the panel prints', () => {
    // linoleic's band is 7-14 and the panel prints one decimal.
    expect(fattyAcidIsTooHigh('linoleic', 14)).toBe(false);
    expect(fattyAcidIsTooHigh('linoleic', 14.04)).toBe(false); // prints 14
    expect(fattyAcidIsTooHigh('linoleic', 14.06)).toBe(true); // prints 14.1
    expect(fattyAcidIsTooHigh('trans', 22)).toBe(true);
    expect(fattyAcidIsTooHigh('otherUnsaturated', 28.5)).toBe(true);
  });

  it('never flags a warned group for being LOW: less of a rancidity-prone acid is no fault', () => {
    expect(fattyAcidIsTooHigh('linoleic', 0)).toBe(false);
    expect(fattyAcidIsTooHigh('linolenic', 0)).toBe(false);
    expect(fattyAcidIsTooHigh('trans', 0)).toBe(false);
  });

  it('answers for every display group, so a new group is forced to decide', () => {
    for (const { key } of FATTY_ACID_DISPLAY_GROUPS) {
      expect(typeof isFattyAcidHighWarned(key), key).toBe('boolean');
    }
  });
});
