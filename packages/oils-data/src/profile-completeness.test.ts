import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MIN_MAPPED_PERCENT } from '@soap-calc/core';
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
  'rapeseed-oil-canola',
  'mustard-oil-kachi-ghani',
  'pracaxi-seed-oil-hair-conditioner',
  'sea-buckthorn-oil-seed-and-berry',
  'soybean-27-5-hydrogenated',
  'macadamia-nut-oil',
  'monoi-de-tahiti-oil',
  'macadamia-nut-butter',
  'borage-oil',
  'tallow-sheep',
  'aloe-butter',
  'karanja-oil',
  'cupuacu-butter',
  'moringa-oil',
  'walnut-oil',
  'broccoli-seed-oil-brassica-oleracea',
  'coffee-bean-oil-roasted',
  'coconut-oil-76',
  'coconut-oil-92',
  'evening-primrose-oil',
  'saw-palmetto-oil',
  'saw-palmetto-extract',
  'tucuma-seed-butter',
  'tallow-bear',
  'avocado-oil',
  'avocado-butter',
  'sal-butter',
]);

function incompleteProfileIds(): string[] {
  const out: string[] = [];
  for (const oil of db.oils) {
    if (!oil.propertiesAvailable || !oil.fattyAcids) continue;
    const sum = Object.values(oil.fattyAcids).reduce((acc, pct) => acc + pct, 0);
    if (sum < COMPLETENESS_THRESHOLD_PCT) out.push(oil.id);
  }
  return out;
}

describe('fatty-acid profile completeness', () => {
  it('only the known SoapCalc-truncated oils have incomplete profiles', () => {
    expect(incompleteProfileIds().sort()).toEqual([...KNOWN_INCOMPLETE_PROFILES].sort());
  });

  it('every documented incomplete oil is still actually incomplete (no stale entries)', () => {
    const incomplete = new Set(incompleteProfileIds());
    for (const id of KNOWN_INCOMPLETE_PROFILES) {
      expect(incomplete.has(id)).toBe(true);
    }
  });
});
