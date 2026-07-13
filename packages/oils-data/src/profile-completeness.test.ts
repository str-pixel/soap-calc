import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MIN_MAPPED_PERCENT } from '@soap-calc/core';
import { incompleteProfileOils } from './profile-completeness.js';
import type { CanonicalOilDatabase } from './schema.js';

const dataPath = join(dirname(fileURLToPath(import.meta.url)), '../data/canonical-oils.json');
const db = JSON.parse(readFileSync(dataPath, 'utf8')) as CanonicalOilDatabase;

// Same "complete enough" threshold the derivation gate uses. For current data every stored
// fatty-acid key is a mapped acid, so raw profile sum == mapped percent.
const COMPLETENESS_THRESHOLD_PCT = MIN_MAPPED_PERCENT;

/**
 * Property-ready oils whose fatty-acid profile sums below the threshold.
 *
 * ORIGIN (traced): the legacy source (soap_oils.json ≈ SoapCalc) tracks a fixed 8-acid schema
 * (lauric, myristic, palmitic, stearic, ricinoleic, oleic, linoleic, linolenic). palmitoleic,
 * behenic, and arachidic have no column at all; caprylic/capric/eicosenoic/erucic only appear
 * when an acid *dominates* an oil. So oils where an untracked acid is significant-but-not-dominant
 * sum short — the gap IS the untracked-acid content (coconut's ~13% C8/C10, mustard's ~40% erucic,
 * macadamia's ~20% palmitoleic). 26 of these 27 use only SoapCalc-tracked acids, confirming the cause.
 *
 * This set is the backlog for the Phase 5 USDA FoodData Central backfill (which carries the missing
 * acids in C:D notation). A NEW id appearing here means a freshly-added oil shipped a truncated
 * profile and needs backfill/review; a REMOVED id means a backfill succeeded — update this list.
 */
const KNOWN_INCOMPLETE_PROFILES = new Set<string>([
  // rapeseed-oil-canola was here — Phase 5 gap-filled it as high-erucic rapeseed (see PROFILE_BACKFILL).
  // mustard-oil-kachi-ghani — Phase 5 gap-filled to 100% (high-erucic, Codex + literature).
  'pracaxi-seed-oil',
  'sea-buckthorn-oil-seed-and-berry',
  'soybean-27-5-hydrogenated',
  'macadamia-nut-butter',
  'tallow-sheep',
  'coconut-oil-76',
  'coconut-oil-92',
  'tallow-bear',
  // avocado-oil was here — Phase 5 backfilled it to 100% from USDA FDC (see PROFILE_BACKFILL).
  'avocado-butter',
]);

describe('fatty-acid profile completeness (catalog guard)', () => {
  it('only the known SoapCalc-truncated oils have incomplete profiles', () => {
    const ids = incompleteProfileOils(db.oils, COMPLETENESS_THRESHOLD_PCT).map((o) => o.id);
    expect(ids.sort()).toEqual([...KNOWN_INCOMPLETE_PROFILES].sort());
  });
});

describe('incompleteProfileOils', () => {
  const oils: Parameters<typeof incompleteProfileOils>[0] = [
    { id: 'complete', propertiesAvailable: true, fattyAcids: { oleic: 70, palmitic: 30 } }, // 100
    { id: 'incomplete', propertiesAvailable: true, fattyAcids: { oleic: 45 } }, // 45
    { id: 'borderline', propertiesAvailable: true, fattyAcids: { oleic: 90, palmitic: 4 } }, // 94
    { id: 'no-profile', propertiesAvailable: false },
  ];

  it('lists property-ready oils below the threshold, sorted ascending by sum', () => {
    const result = incompleteProfileOils(oils, 93);
    expect(result.map((o) => o.id)).toEqual(['incomplete']);
    expect(result[0].sum).toBe(45);
  });

  it('ignores oils without a profile and those at/above the threshold', () => {
    const ids = incompleteProfileOils(oils, 93).map((o) => o.id);
    expect(ids).not.toContain('complete');
    expect(ids).not.toContain('borderline');
    expect(ids).not.toContain('no-profile');
  });
});
