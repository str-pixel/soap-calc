import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { poolExternalReferences } from '../src/external-references.js';

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = join(here, '../reference/external-sources');
const outPath = join(here, '../data/external-property-references.json');

const ranges = JSON.parse(readFileSync(join(srcDir, 'oil-property-ranges.deidentified.json'), 'utf8')).oils;
const cc = JSON.parse(readFileSync(join(srcDir, 'research-papers-crosscheck.json'), 'utf8'));

const table = poolExternalReferences({
  ranges,
  giakoumis: cc.giakoumis2018_faProfileAndIodine,
  toscano: cc.toscano2012_iodineSaponificationPairs,
  warra: cc.warra2010_measuredSapIodine,
});

const doc = {
  _about:
    'Pooled external published iodine/SAP references per app oil id. GENERATED from reference/external-sources/ by scripts/build-external-references.ts — do not hand-edit. sap in mg KOH/g.',
  oils: Object.fromEntries(Object.entries(table).sort(([a], [b]) => a.localeCompare(b))),
};
writeFileSync(outPath, JSON.stringify(doc, null, 2) + '\n');
console.log(`Wrote ${Object.keys(table).length} oils to ${outPath}`);
