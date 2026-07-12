import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { deriveChemistryFromProfile } from '@soap-calc/core';
import type { CanonicalOilDatabase } from './schema.js';

const dataPath = join(dirname(fileURLToPath(import.meta.url)), '../data/canonical-oils.json');
const db = JSON.parse(readFileSync(dataPath, 'utf8')) as CanonicalOilDatabase;

const SAP_DEVIATION_THRESHOLD_PCT = 8;

/**
 * Oils whose stored SAP disagrees with their own (complete) fatty-acid profile by more than
 * the threshold — each a deliberate, reviewed exception. A NEW entry appearing here means an
 * oil's stored SAP contradicts its profile and needs human review (the carrot/papaya class).
 * Keeping this list exact is the regression guard.
 */
const KNOWN_PROFILE_SAP_DEVIATIONS: Record<string, string> = {
  'nutmeg-butter': 'trimyristin + volatile unsaponifiables; profile over-estimates SAP',
  'buriti-oil': 'carotenoid unsaponifiables; profile over-estimates SAP',
  'cohune-oil': 'legacy_only lauric oil, low vs family; physically possible, no external source',
  'ucuuba-butter': 'legacy_only high-myristic butter; unresolved vs profile',
  'murumuru-butter': 'all charts ~0.275 but profile ~0.233 (>coconut is implausible) — human review',
  'tamanu-oil-kamani': 'conservative-blend estimate, ~8% above profile',
};

function deviatingOils() {
  const out: Record<string, number> = {};
  for (const oil of db.oils) {
    if (oil.category !== 'triglyceride' && oil.category !== 'blend') continue;
    if (!oil.fattyAcids) continue;
    const derived = deriveChemistryFromProfile(oil.fattyAcids);
    if (!derived) continue; // incomplete profile — not judgeable here
    const deltaPct = ((oil.sapKoh - derived.sapKoh) / derived.sapKoh) * 100;
    if (Math.abs(deltaPct) > SAP_DEVIATION_THRESHOLD_PCT) {
      out[oil.id] = Math.round(deltaPct * 10) / 10;
    }
  }
  return out;
}

describe('SAP-vs-profile consistency', () => {
  it('only the documented, reviewed oils deviate from their profile beyond threshold', () => {
    const deviating = deviatingOils();
    expect(Object.keys(deviating).sort()).toEqual(
      Object.keys(KNOWN_PROFILE_SAP_DEVIATIONS).sort(),
    );
  });
});
