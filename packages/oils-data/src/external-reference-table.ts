import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { poolExternalReferences, type ExternalReferenceTable } from './external-references.js';

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '../reference/external-sources');

/**
 * Read the vendored external sources and pool them into the reference band table. The single
 * source of truth shared by the build script (which writes `data/external-property-references.json`)
 * and the drift guard (`external-references-drift.test.ts`, which asserts the committed file still
 * equals a fresh pool) — so the committed table can never silently drift from its sources or the
 * pooling logic.
 */
export function buildExternalReferenceTable(): ExternalReferenceTable {
  const ranges = JSON.parse(
    readFileSync(join(srcDir, 'oil-property-ranges.deidentified.json'), 'utf8'),
  ).oils;
  const cc = JSON.parse(readFileSync(join(srcDir, 'research-papers-crosscheck.json'), 'utf8'));
  return poolExternalReferences({
    ranges,
    giakoumis: cc.giakoumis2018_faProfileAndIodine,
    toscano: cc.toscano2012_iodineSaponificationPairs,
    warra: cc.warra2010_measuredSapIodine,
  });
}
