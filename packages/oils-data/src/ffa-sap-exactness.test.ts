import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { CanonicalOilDatabase } from './schema.js';

const dataPath = join(dirname(fileURLToPath(import.meta.url)), '../data/canonical-oils.json');
const db = JSON.parse(readFileSync(dataPath, 'utf8')) as CanonicalOilDatabase;

/**
 * A pure free fatty acid neutralizes alkali 1:1 with no glycerol released, so its SAP is
 * *exactly* computable — `56.1056 / MW` (KOH coefficient), arithmetic, not a measurement. This
 * guards the free_acid rows against silently drifting back to a charted approximation (palmitic
 * and oleic were ~1.7% off before the Codex-audit fix). Molecular weights are physical constants.
 */
const KOH_MOLAR_MASS = 56.1056;
const FFA_MOLECULAR_WEIGHT: Record<string, number> = {
  'lauric-acid': 200.32,
  'myristic-acid': 228.37,
  'palmitic-acid': 256.42,
  'stearic-acid': 284.48,
  'oleic-acid': 282.46,
};

describe('free fatty acid SAP is exact (56.1056 / MW)', () => {
  it('every free_acid oil matches its first-principles SAP within 0.0002', () => {
    const freeAcids = db.oils.filter((o) => o.category === 'free_acid');
    expect(freeAcids.length).toBeGreaterThan(0);
    for (const oil of freeAcids) {
      const mw = FFA_MOLECULAR_WEIGHT[oil.id];
      expect(mw, `${oil.id}: add its MW to FFA_MOLECULAR_WEIGHT`).toBeDefined();
      const exact = KOH_MOLAR_MASS / mw;
      expect(
        Math.abs(oil.sapKoh - exact),
        `${oil.id}: sapKoh ${oil.sapKoh} should equal 56.1056/${mw} = ${exact.toFixed(5)}`,
      ).toBeLessThan(0.0002);
    }
  });
});
