import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { CanonicalOilDatabase } from './schema.js';
import {
  classifyProfileIodineDeviations,
  KNOWN_PROFILE_IODINE_DEVIATIONS,
} from './profile-iodine-deviations.js';

const dataPath = join(dirname(fileURLToPath(import.meta.url)), '../data/canonical-oils.json');
const db = JSON.parse(readFileSync(dataPath, 'utf8')) as CanonicalOilDatabase;

describe('iodine-vs-profile consistency', () => {
  it('ships no error-tier oil (every gross contradiction is corrected or acknowledged)', () => {
    const errors = classifyProfileIodineDeviations(db.oils).filter((d) => d.tier === 'error');
    expect(errors).toEqual([]);
  });

  it('every acknowledged oil still actually deviates (no stale acknowledgment)', () => {
    const deviating = new Set(classifyProfileIodineDeviations(db.oils).map((d) => d.id));
    for (const id of Object.keys(KNOWN_PROFILE_IODINE_DEVIATIONS)) {
      expect(deviating.has(id)).toBe(true);
    }
  });
});
