import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { CanonicalOilDatabase } from './schema.js';
import {
  classifyProfileSapDeviations,
  KNOWN_PROFILE_SAP_DEVIATIONS,
} from './profile-sap-deviations.js';

const dataPath = join(dirname(fileURLToPath(import.meta.url)), '../data/canonical-oils.json');
const db = JSON.parse(readFileSync(dataPath, 'utf8')) as CanonicalOilDatabase;

/**
 * Drift guard: the set of oils whose stored SAP contradicts their own complete profile must equal
 * the documented, human-reviewed acknowledgement list. A NEW entry means an oil's SAP disagrees
 * with its chemistry and needs review (the carrot/papaya class) — the same check the build
 * validator errors on, asserted here against the shipped data.
 */
describe('SAP-vs-profile consistency', () => {
  it('only the documented, reviewed oils deviate from their profile beyond threshold', () => {
    const deviatingIds = classifyProfileSapDeviations(db.oils)
      .map((d) => d.id)
      .sort();
    expect(deviatingIds).toEqual(Object.keys(KNOWN_PROFILE_SAP_DEVIATIONS).sort());
  });

  it('every shipped deviation is acknowledged (none reaches the error/warn tier today)', () => {
    for (const d of classifyProfileSapDeviations(db.oils)) {
      expect(d.tier).toBe('acknowledged');
    }
  });
});
