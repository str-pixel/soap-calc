import { describe, expect, it } from 'vitest';
import { deriveChemistryFromProfile } from '@soap-calc/core';
import {
  classifyProfileIodineDeviations,
  KNOWN_PROFILE_IODINE_DEVIATIONS,
} from './profile-iodine-deviations.js';

// Mid-IV profile so derive returns a value; stored iodine is set relative to derived
// so deltas are controlled, not hard-coded.
const PROFILE = { oleic: 80, palmitic: 10, stearic: 5, linoleic: 5 };
const iv = deriveChemistryFromProfile(PROFILE)!.iodineValue; // ~77.4 (oil-basis, post Task 1)
const grossHi = iv * 1.3; // rel +30% -> gross (>= IODINE_GROSS_PCT 25)
const moderate = iv * 1.2; // rel +20% -> warn (>= 15% threshold, < 25% gross)
// rel +14%, abs ~+10.8 (clears the 10-unit abs floor so this exercises the relative-threshold
// check, not the floor) -> below the 15% warn threshold, NOT flagged
const belowThreshold = iv * 1.14;
const justOverThreshold = iv * 1.16; // rel +16% -> warn (just above the 15% threshold, < 25% gross)

type Oil = Parameters<typeof classifyProfileIodineDeviations>[0][number];
const oil = (over: Partial<Oil>): Oil => ({
  id: 'x',
  category: 'triglyceride',
  confidence: 'verified',
  iodine: iv,
  fattyAcids: PROFILE,
  ...over,
});

describe('classifyProfileIodineDeviations', () => {
  it('flags a gross verified contradiction as error', () => {
    const [d] = classifyProfileIodineDeviations([oil({ id: 'gv', iodine: grossHi })]);
    expect(d.tier).toBe('error');
  });

  it('flags a gross estimated contradiction as error', () => {
    const [d] = classifyProfileIodineDeviations([
      oil({ id: 'ge', confidence: 'estimated', iodine: grossHi }),
    ]);
    expect(d.tier).toBe('error');
  });

  it('flags a gross legacy_only contradiction as warn, not error', () => {
    const [d] = classifyProfileIodineDeviations([
      oil({ id: 'gl', confidence: 'legacy_only', iodine: grossHi }),
    ]);
    expect(d.tier).toBe('warn');
  });

  it('treats a moderate verified deviation as warn, not error (trust-asymmetry vs SAP)', () => {
    const [d] = classifyProfileIodineDeviations([oil({ id: 'mv', iodine: moderate })]);
    expect(d.tier).toBe('warn');
  });

  it('does not flag a deviation below the relative warn threshold', () => {
    expect(classifyProfileIodineDeviations([oil({ id: 'bt', iodine: belowThreshold })])).toEqual([]);
  });

  it('flags a deviation just above the relative warn threshold (tight lower-edge pin)', () => {
    // Together with belowThreshold (+14%, not flagged) this pins the threshold to (14%, 16%] ~ 15%.
    const [d] = classifyProfileIodineDeviations([oil({ id: 'jo', iodine: justOverThreshold })]);
    expect(d.tier).toBe('warn');
  });

  it('does not flag when stored agrees with the profile', () => {
    expect(classifyProfileIodineDeviations([oil({ id: 'ok' })])).toEqual([]);
  });

  it('treats a documented deviation as acknowledged and carries its reason', () => {
    const id = Object.keys(KNOWN_PROFILE_IODINE_DEVIATIONS)[0];
    const [d] = classifyProfileIodineDeviations([oil({ id, iodine: grossHi })]);
    expect(d.tier).toBe('acknowledged');
    expect(d.reason).toBe(KNOWN_PROFILE_IODINE_DEVIATIONS[id]);
  });

  it('excludes non-glyceride categories', () => {
    expect(
      classifyProfileIodineDeviations([oil({ id: 'wax', category: 'wax', iodine: grossHi })]),
    ).toEqual([]);
  });

  it('skips oils with an incomplete profile', () => {
    expect(
      classifyProfileIodineDeviations([oil({ id: 'p', fattyAcids: { oleic: 40 }, iodine: grossHi })]),
    ).toEqual([]);
  });

  it('flags a fully-saturated profile (derived IV 0) on the absolute gap, rel is null, gross->error', () => {
    const SAT = { myristic: 74, lauric: 18, palmitic: 8 };
    const [d] = classifyProfileIodineDeviations([oil({ id: 'sat', fattyAcids: SAT, iodine: 38 })]);
    expect(d.absDelta).toBeCloseTo(38, 1);
    expect(d.relDeltaPct).toBeNull();
    expect(d.tier).toBe('error'); // oil() defaults to verified
  });

  it('a legacy_only oil with a saturated profile (derived IV 0) is warn, not error', () => {
    const SAT = { myristic: 74, lauric: 18, palmitic: 8 };
    const [d] = classifyProfileIodineDeviations([
      oil({ id: 'sat2', confidence: 'legacy_only', fattyAcids: SAT, iodine: 38 }),
    ]);
    expect(d.tier).toBe('warn');
    expect(d.relDeltaPct).toBeNull();
  });

  it('does not flag a saturated profile whose stored iodine is also ~0 (abs gap below floor)', () => {
    const SAT = { myristic: 74, lauric: 18, palmitic: 8 };
    expect(classifyProfileIodineDeviations([oil({ id: 'sat3', fattyAcids: SAT, iodine: 2 })])).toEqual([]);
  });

  it('does not flag a low-IV oil whose deviation clears 15% but not the 10-unit floor', () => {
    // deriveChemistry oil-basis IV for this profile is ~38.7; +20% rel is only ~+7.7 units.
    const lowProfile = { oleic: 45, palmitic: 30, stearic: 25 };
    const ivLow = deriveChemistryFromProfile(lowProfile)!.iodineValue;
    const [none] = classifyProfileIodineDeviations([
      oil({ id: 'lo', fattyAcids: lowProfile, iodine: ivLow * 1.2 }),
    ]);
    expect(none).toBeUndefined();
  });
});
