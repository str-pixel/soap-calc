import { describe, expect, it } from 'vitest';
import { deriveChemistryFromProfile } from '@soap-calc/core';
import {
  classifyProfileSapDeviations,
  KNOWN_PROFILE_SAP_DEVIATIONS,
  SAP_DEVIATION_THRESHOLD_PCT,
} from './profile-sap-deviations.js';

// A complete, near-olein profile so deriveChemistryFromProfile returns a value; we set each
// oil's stored SAP relative to the derived value so the delta is controlled, not hard-coded.
const PROFILE = { oleic: 80, palmitic: 10, stearic: 5, linoleic: 5 };
const derivedSap = deriveChemistryFromProfile(PROFILE)!.sapKoh;
const within = derivedSap; // 0% delta
const contradicting = derivedSap * (1 + (SAP_DEVIATION_THRESHOLD_PCT + 5) / 100); // ~+13%

type Oil = Parameters<typeof classifyProfileSapDeviations>[0][number];
const oil = (over: Partial<Oil>): Oil => ({
  id: 'x',
  category: 'triglyceride',
  confidence: 'verified',
  sapKoh: within,
  fattyAcids: PROFILE,
  ...over,
});

describe('classifyProfileSapDeviations', () => {
  it('flags an undocumented verified oil contradicting its profile as error', () => {
    const [d] = classifyProfileSapDeviations([oil({ id: 'new-verified', sapKoh: contradicting })]);
    expect(d.tier).toBe('error');
    expect(d.id).toBe('new-verified');
    expect(Math.abs(d.deltaPct)).toBeGreaterThan(SAP_DEVIATION_THRESHOLD_PCT);
  });

  it('flags an undocumented estimated oil contradicting its profile as error', () => {
    const [d] = classifyProfileSapDeviations([
      oil({ id: 'new-est', confidence: 'estimated', sapKoh: contradicting }),
    ]);
    expect(d.tier).toBe('error');
  });

  it('flags an undocumented legacy_only oil as warn, not error', () => {
    const [d] = classifyProfileSapDeviations([
      oil({ id: 'new-legacy', confidence: 'legacy_only', sapKoh: contradicting }),
    ]);
    expect(d.tier).toBe('warn');
  });

  it('treats a documented deviation as acknowledged and carries its reason', () => {
    const id = Object.keys(KNOWN_PROFILE_SAP_DEVIATIONS)[0];
    const [d] = classifyProfileSapDeviations([oil({ id, sapKoh: contradicting })]);
    expect(d.tier).toBe('acknowledged');
    expect(d.reason).toBe(KNOWN_PROFILE_SAP_DEVIATIONS[id]);
  });

  it('ignores oils whose SAP agrees with the profile within threshold', () => {
    expect(classifyProfileSapDeviations([oil({ id: 'agrees' })])).toEqual([]);
  });

  it('excludes non-glyceride categories (derivation assumes a triglyceride backbone)', () => {
    expect(
      classifyProfileSapDeviations([
        oil({ id: 'wax', category: 'wax', sapKoh: contradicting }),
        oil({ id: 'acid', category: 'free_acid', sapKoh: contradicting }),
      ]),
    ).toEqual([]);
  });

  it('skips oils with an incomplete profile (not judgeable)', () => {
    expect(
      classifyProfileSapDeviations([
        oil({ id: 'partial', fattyAcids: { oleic: 40 }, sapKoh: contradicting }),
      ]),
    ).toEqual([]);
  });
});
