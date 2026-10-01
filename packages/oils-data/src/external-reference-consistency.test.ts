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

describe('hazelnut iodine answers to two published ranges (book audit 2026-09-29)', () => {
  it('sits inside the Codex range and inside the external reference band', () => {
    const oil = db.oils.find((o) => o.id === 'hazelnut-oil');
    // The subject exists and carries an iodine value at all.
    expect(oil?.iodine).toBeTypeOf('number');
    // Codex CXS 210-1999 (revised 2019), Table 2: hazelnut oil, iodine value 81-95.
    expect(oil!.iodine!).toBeGreaterThanOrEqual(81);
    expect(oil!.iodine!).toBeLessThanOrEqual(95);
    // The independent AOCS-attributed band this repo already ships for it.
    const band = refs['hazelnut-oil']?.iodine;
    expect(band).toBeDefined();
    expect(oil!.iodine!).toBeGreaterThanOrEqual(band!.min);
    expect(oil!.iodine!).toBeLessThanOrEqual(band!.max);
  });
});
