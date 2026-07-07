import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FNWL_URL = 'https://www.fromnaturewithlove.com/downloads/sapon.txt';
const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '../sources');
const outPath = join(outDir, 'fnwl-sapon.txt');

async function main() {
  const res = await fetch(FNWL_URL);
  if (!res.ok) throw new Error(`FNWL fetch failed: ${res.status}`);
  const text = await res.text();

  if (!text.includes('OIL,SAP,NAOH')) {
    throw new Error('FNWL download does not look like a SAP chart (missing header)');
  }

  const dataLines = text.split(/\r?\n/).filter(
    (l) => l && !l.startsWith('Last Updated') && !l.startsWith('OIL,'),
  );
  if (dataLines.length < 50) {
    throw new Error(`FNWL download suspiciously small (${dataLines.length} data rows)`);
  }

  mkdirSync(outDir, { recursive: true });
  writeFileSync(outPath, text, 'utf8');
  console.log(`Fetched FNWL SAP chart → ${outPath} (${dataLines.length} data rows)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
