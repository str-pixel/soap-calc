import { describe, expect, it } from 'vitest';
import { deriveChemistryFromProfile, MIN_MAPPED_PERCENT } from '@soap-calc/core';
import { PROFILE_BACKFILL } from './profile-backfill.js';

describe('PROFILE_BACKFILL', () => {
  it('every entry is a complete, oracle-mappable profile summing ~100%', () => {
    for (const [id, { profile }] of Object.entries(PROFILE_BACKFILL)) {
      const sum = Object.values(profile).reduce((a, b) => a + b, 0);
      expect(sum, `${id} profile sum`).toBeGreaterThanOrEqual(98);
      expect(sum, `${id} profile sum`).toBeLessThanOrEqual(102);
      const derived = deriveChemistryFromProfile(profile);
      expect(derived, `${id} must derive (all acids known, ≥${MIN_MAPPED_PERCENT}% mapped)`).not.toBeNull();
      expect(derived!.mappedPercent).toBeGreaterThanOrEqual(MIN_MAPPED_PERCENT);
    }
  });

  it('every entry carries a citation', () => {
    for (const [id, { source }] of Object.entries(PROFILE_BACKFILL)) {
      expect(source, `${id} source`).toMatch(/\S/);
    }
  });

  it('avocado-oil pilot: FDC profile derives a SAP consistent with the stored value (gate-safe)', () => {
    const derived = deriveChemistryFromProfile(PROFILE_BACKFILL['avocado-oil'].profile)!;
    // Stored SAP is 0.188; within the 8% profile-consistency gate so the build stays green.
    expect(Math.abs((0.188 - derived.sapKoh) / derived.sapKoh) * 100).toBeLessThan(8);
  });
});
