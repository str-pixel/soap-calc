import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { deriveChemistryFromProfile, MIN_MAPPED_PERCENT } from '@soap-calc/core';
import { PROFILE_BACKFILL } from './profile-backfill.js';
import { OIL_ID_OVERRIDES } from './oil-id-overrides.js';

const litePath = join(dirname(fileURLToPath(import.meta.url)), '../data/canonical-oils-lite.json');
const liteDb = JSON.parse(readFileSync(litePath, 'utf8')) as {
  oils: { id: string; sourceType?: string }[];
};

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

  /**
   * Drift guard for the "modeled" UI signal: the lite DB must flag `sourceType: 'derived'` on
   * exactly the backfills whose profile is a reconstruction (a hydrogenation transform), never on
   * an fdc/literature entry (those are measured data). The web hides nothing on this flag — it
   * shows a "Modeled" tag — so a false positive would defame measured data, and a false negative
   * would ship a reconstruction as if it were measured.
   */
  it('the lite DB flags sourceType "derived" on exactly the derived backfills', () => {
    const expected = Object.entries(PROFILE_BACKFILL)
      .filter(([, b]) => b.sourceType === 'derived')
      .map(([slug]) => OIL_ID_OVERRIDES[slug] ?? slug)
      .sort();
    const flagged = liteDb.oils
      .filter((o) => o.sourceType === 'derived')
      .map((o) => o.id)
      .sort();
    expect(flagged).toEqual(expected);
    // The derived set is small and deliberate — the two hydrogenated lauric forms plus PHSO.
    expect(expected).toEqual([
      'coconut-oil-92',
      'palm-kernel-oil-flakes-hydrogenated',
      'soybean-27-5-hydrogenated',
    ]);
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
