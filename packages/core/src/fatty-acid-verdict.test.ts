import { describe, expect, it } from 'vitest';
import { FATTY_ACID_DISPLAY_GROUPS } from './formulation-guide.js';
import {
  FATTY_ACID_HIGH_WARNINGS,
  fattyAcidIsTooHigh,
  isFattyAcidHighWarned,
} from './fatty-acid-verdict.js';

describe('which fatty-acid groups may be flagged, and only when high', () => {
  it('warns high only on trans and the two catch-alls', () => {
    expect(Object.keys(FATTY_ACID_HIGH_WARNINGS).sort()).toEqual(
      ['otherSaturated', 'otherUnsaturated', 'trans'].sort(),
    );
  });

  it('never flags the style groups or the rancidity-prone acids, at any value', () => {
    // lauric + myristic, palmitic + stearic, oleic, ricinoleic: recipe style.
    // linoleic, linolenic: rancidity depends on superfat and antioxidants this panel cannot
    // see, so the formulation insights judge it instead. A panel limit contradicted those
    // insights on every heavy recipe once an antioxidant was added.
    const quiet = ['lauricMyristic', 'palmiticStearic', 'oleic', 'ricinoleic', 'linoleic', 'linolenic'] as const;
    for (const key of quiet) {
      expect(isFattyAcidHighWarned(key), key).toBe(false);
      for (const v of [0, 30, 50, 100]) expect(fattyAcidIsTooHigh(key, v), `${key} ${v}`).toBe(false);
    }
  });

  it('flags a warned group above its band, judged on the figure the panel prints', () => {
    // trans's band is 0-2 and the panel prints one decimal.
    expect(fattyAcidIsTooHigh('trans', 2)).toBe(false);
    expect(fattyAcidIsTooHigh('trans', 2.04)).toBe(false); // prints 2
    expect(fattyAcidIsTooHigh('trans', 2.06)).toBe(true); // prints 2.1
    expect(fattyAcidIsTooHigh('trans', 22)).toBe(true);
    expect(fattyAcidIsTooHigh('otherUnsaturated', 28.5)).toBe(true);
  });

  it('never flags a warned group for being LOW', () => {
    expect(fattyAcidIsTooHigh('trans', 0)).toBe(false);
    expect(fattyAcidIsTooHigh('otherSaturated', 0)).toBe(false);
    expect(fattyAcidIsTooHigh('otherUnsaturated', 0)).toBe(false);
  });

  it('answers for every display group, so a new group is forced to decide', () => {
    for (const { key } of FATTY_ACID_DISPLAY_GROUPS) {
      expect(typeof isFattyAcidHighWarned(key), key).toBe('boolean');
    }
  });
});
