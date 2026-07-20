import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { CanonicalOilDatabase } from './schema.js';
import type { ExternalReferenceTable } from './external-references.js';
import {
  classifyExternalReferenceDeviations,
  KNOWN_EXTERNAL_REFERENCE_DEVIATIONS,
} from './external-reference-deviations.js';

const dir = dirname(fileURLToPath(import.meta.url));
const db = JSON.parse(readFileSync(join(dir, '../data/canonical-oils.json'), 'utf8')) as CanonicalOilDatabase;
const refs = JSON.parse(
  readFileSync(join(dir, '../data/external-property-references.json'), 'utf8'),
).oils as ExternalReferenceTable;

describe('external-reference consistency', () => {
  it('every acknowledged id:property still actually deviates (no stale acknowledgment)', () => {
    const keys = new Set(
      classifyExternalReferenceDeviations(db.oils, refs).map((d) => `${d.id}:${d.property}`),
    );
    for (const key of Object.keys(KNOWN_EXTERNAL_REFERENCE_DEVIATIONS)) {
      expect(keys.has(key)).toBe(true);
    }
  });
});
