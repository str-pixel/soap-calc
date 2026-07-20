import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildExternalReferenceTable } from '../src/external-reference-table.js';

const outPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../data/external-property-references.json',
);

const table = buildExternalReferenceTable();
const doc = {
  _about:
    'Pooled external published iodine/SAP references per app oil id. GENERATED from reference/external-sources/ by scripts/build-external-references.ts — do not hand-edit. sap in mg KOH/g.',
  oils: Object.fromEntries(Object.entries(table).sort(([a], [b]) => a.localeCompare(b))),
};
writeFileSync(outPath, JSON.stringify(doc, null, 2) + '\n');
console.log(`Wrote ${Object.keys(table).length} oils to ${outPath}`);
