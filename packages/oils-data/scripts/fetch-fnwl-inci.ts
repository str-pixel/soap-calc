import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeInciName } from '../src/normalize-inci.js';
import { parseFnwlInciCsv } from '../src/parse-fnwl-inci.js';

const FNWL_INCI_URL = 'https://www.fromnaturewithlove.com/downloads/inci.txt';
const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '../sources');
const inciPath = join(outDir, 'fnwl-inci.txt');
const glossaryPath = join(outDir, 'cosing-glossary-index.json');

async function main() {
  const res = await fetch(FNWL_INCI_URL);
  if (!res.ok) throw new Error(`FNWL INCI fetch failed: ${res.status}`);
  const text = await res.text();

  if (!text.includes('PRODUCT\tINCI\tPRODUCT_ID') && !text.includes('PRODUCT\tINCI')) {
    throw new Error('FNWL INCI download does not look like inci.txt (missing header)');
  }

  const rows = parseFnwlInciCsv(text);
  if (rows.length < 100) {
    throw new Error(`FNWL INCI download suspiciously small (${rows.length} rows)`);
  }

  mkdirSync(outDir, { recursive: true });
  writeFileSync(inciPath, text, 'utf8');

  const byNormalized = new Map<string, string>();
  for (const row of rows) {
    byNormalized.set(normalizeInciName(row.inciName), row.inciName);
  }

  const glossary = {
    generatedAt: new Date().toISOString(),
    source: 'fnwl_inci_chart',
    note:
      'Proxy CosIng glossary index from FNWL public INCI chart. EU CosIng bulk export is not available via API; FNWL INCI names follow INCI/CosIng nomenclature.',
    referenceUrl: 'https://ec.europa.eu/growth/tools-databases/cosing/',
    inciNames: [...byNormalized.values()].sort(),
    normalizedIndex: Object.fromEntries(byNormalized),
  };

  writeFileSync(glossaryPath, JSON.stringify(glossary, null, 2) + '\n');
  console.log(`Fetched FNWL INCI chart → ${inciPath} (${rows.length} rows)`);
  console.log(`Built CosIng glossary index → ${glossaryPath} (${byNormalized.size} unique INCI names)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
