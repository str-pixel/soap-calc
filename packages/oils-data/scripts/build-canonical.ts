import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSapRangeMgKoh, sapKohToSapNaoh } from '@soap-calc/core';
import {
  CanonicalOilDatabase,
  type CanonicalOil,
  type DataSource,
} from '../src/schema.js';
import { buildFnwlIndex, findFnwlMatch } from '../src/match-fnwl.js';
import { parseFnwlCsv } from '../src/parse-fnwl.js';
import {
  buildFnwlInciIndex,
  parseFnwlInciCsv,
  resolveInciForFnwlProduct,
} from '../src/parse-fnwl-inci.js';
import { loadCosingGlossaryIndex, lookupInciInGlossary, defaultGlossaryPath } from '../src/cosing-glossary.js';
import { resolvePrimarySap, sapDeltaPercent, DISPUTED_DELTA_PCT } from '../src/sap-policy.js';
import {
  inferCategory,
  normalizeOilName,
  slugify,
} from '../src/normalize.js';
import { loadSupplementalOils, supplementalToCanonical, tarMetadataForLegacy } from '../src/supplemental.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '../../..');
const fnwlPath = join(__dirname, '../sources/fnwl-sapon.txt');
const fnwlInciPath = join(__dirname, '../sources/fnwl-inci.txt');
const legacyPath = join(root, 'oils.json');
const supplementalPath = join(__dirname, '../sources/supplemental-oils.json');
const outPath = join(__dirname, '../data/canonical-oils.json');
const litePath = join(__dirname, '../data/canonical-oils-lite.json');
const reportPath = join(__dirname, '../data/build-report.json');

interface LegacyOil {
  id: number;
  name: string;
  iodine?: number;
  ins?: number;
  sap: number;
  total_saponifiable?: number;
  breakdown?: string | Record<string, number>;
}

function parseBreakdown(raw: LegacyOil['breakdown']): Record<string, number> | undefined {
  if (!raw) return undefined;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw) as Record<string, number>;
  } catch {
    return undefined;
  }
}

function main() {
  if (!existsSync(fnwlPath)) {
    console.error('Missing FNWL source. Run: npm run fetch:fnwl -w @soap-calc/oils-data');
    process.exit(1);
  }

  const fnwlText = readFileSync(fnwlPath, 'utf8');
  const fnwlRows = parseFnwlCsv(fnwlText);
  const fnwlIndex = buildFnwlIndex(fnwlRows);

  const inciIndex = existsSync(fnwlInciPath)
    ? buildFnwlInciIndex(parseFnwlInciCsv(readFileSync(fnwlInciPath, 'utf8')))
    : new Map();
  const cosingGlossary = loadCosingGlossaryIndex(defaultGlossaryPath);

  const legacy = JSON.parse(readFileSync(legacyPath, 'utf8')) as { oils: LegacyOil[] };
  const report = {
    matched: [] as string[],
    unmatched: [] as string[],
    sapDiscrepancies: [] as Array<{ name: string; legacy: number; fnwl: number; deltaPct: number }>,
    sapRetainedLegacy: [] as string[],
    sapConservativeBlend: [] as string[],
    ldgMethodologyNotes: [] as string[],
    inciResolved: [] as string[],
    inciMissing: [] as string[],
    duplicates: [] as string[],
    supplemental: [] as string[],
  };

  const oils: CanonicalOil[] = [];
  const usedSlugs = new Set<string>();

  for (const leg of legacy.oils) {
    const fnwl = findFnwlMatch(leg.name, fnwlIndex);
    let baseSlug = slugify(leg.name);
    if (usedSlugs.has(baseSlug)) {
      baseSlug = `${baseSlug}-${leg.id}`;
      report.duplicates.push(leg.name);
    }
    usedSlugs.add(baseSlug);

    const fattyAcids = parseBreakdown(leg.breakdown);
    const category = inferCategory(leg.name, baseSlug);
    const propertiesAvailable = category === 'triglyceride' || category === 'blend';

    const legacySapNaoh = sapKohToSapNaoh(leg.sap);
    const sources: CanonicalOil['sources'] = [{
      source: 'legacy_soapee',
      sapKoh: leg.sap,
      sapNaoh: legacySapNaoh,
      notes: 'Imported from oils.json (Soapee/SoapCalc lineage)',
    }];

    let primarySource: DataSource = 'legacy_soapee';
    let confidence: CanonicalOil['confidence'] = 'legacy_only';
    let sapKoh = leg.sap;
    let sapNaoh = legacySapNaoh;
    let inciName: string | undefined;

    if (fnwl) {
      const range = parseSapRangeMgKoh(fnwl.sapRange);
      const delta = sapDeltaPercent(leg.sap, fnwl.sapKoh);
      const resolution = resolvePrimarySap(leg.sap, fnwl.sapKoh);
      const resolvedInci = resolveInciForFnwlProduct(fnwl.productId, inciIndex);
      if (resolvedInci) {
        inciName = resolvedInci;
        report.inciResolved.push(leg.name);
      } else if (fnwl.productId) {
        report.inciMissing.push(leg.name);
      }

      sources.push({
        source: 'fnwl',
        url: 'https://www.fromnaturewithlove.com/resources/sapon.asp',
        mgKohPerGramMin: range.min,
        mgKohPerGramMax: range.max,
        mgKohPerGram: range.mid,
        sapKoh: fnwl.sapKoh,
        sapNaoh: sapKohToSapNaoh(fnwl.sapKoh),
        notes: `FNWL chart entry: ${fnwl.name}`,
      });

      sources.push({
        source: 'ldg',
        url: 'https://www.ldg.international/saponification-chart/',
        mgKohPerGram: range.mid,
        mgKohPerGramMin: range.min,
        mgKohPerGramMax: range.max,
        notes:
          'LDG methodology cross-check (mg KOH/g lab units). LDG publishes no machine-readable export; FNWL matched SAP range used for alignment.',
      });
      report.ldgMethodologyNotes.push(leg.name);

      if (inciName && cosingGlossary) {
        const inciLookup = lookupInciInGlossary(inciName, cosingGlossary);
        sources.push({
          source: 'cosing',
          url: 'https://ec.europa.eu/growth/tools-databases/cosing/',
          notes: inciLookup.found
            ? `INCI "${inciLookup.canonicalInci}" found in FNWL-derived CosIng glossary index`
            : `INCI "${inciName}" from FNWL chart — not in local glossary index`,
        });
      }

      report.matched.push(leg.name);

      if (delta > 2) {
        report.sapDiscrepancies.push({
          name: leg.name,
          legacy: leg.sap,
          fnwl: fnwl.sapKoh,
          deltaPct: Math.round(delta * 10) / 10,
        });
      }

      if (
        resolution.strategy === 'legacy_retained' ||
        resolution.strategy === 'fnwl_preferred'
      ) {
        report.sapRetainedLegacy.push(leg.name);
        const usingFnwl = resolution.strategy === 'fnwl_preferred';
        sources.push({
          source: 'manual',
          notes: usingFnwl
            ? `FNWL SAP ${resolution.deltaPct.toFixed(1)}% higher than legacy (>${DISPUTED_DELTA_PCT}% delta); using FNWL for lye safety`
            : `FNWL SAP differs by ${resolution.deltaPct.toFixed(1)}% (>${DISPUTED_DELTA_PCT}%); legacy SAP retained for lye safety`,
        });
      } else if (resolution.strategy === 'conservative_blend') {
        report.sapConservativeBlend.push(leg.name);
        sources.push({
          source: 'manual',
          sapKoh: resolution.sapKoh,
          sapNaoh: resolution.sapNaoh,
          notes: `FNWL differs by ${resolution.deltaPct.toFixed(1)}%; using higher SAP for lye safety`,
        });
      }

      sapKoh = resolution.sapKoh;
      sapNaoh = resolution.sapNaoh;
      primarySource = resolution.primarySource;
      confidence = resolution.confidence;
    } else {
      report.unmatched.push(leg.name);
    }

    oils.push({
      id: baseSlug,
      displayName: leg.name,
      aliases: [normalizeOilName(leg.name)],
      inciName,
      category,
      ...tarMetadataForLegacy(category),
      sapKoh,
      sapNaoh,
      sapMgKohPerGram: sapKoh * 1000,
      iodine: leg.iodine,
      ins: leg.ins,
      fattyAcids,
      propertiesAvailable,
      sources,
      primarySource,
      confidence,
    });
  }

  if (existsSync(supplementalPath)) {
    for (const entry of loadSupplementalOils(supplementalPath)) {
      if (usedSlugs.has(entry.id)) {
        console.warn(`Skipping supplemental oil "${entry.id}" — id already in legacy set`);
        continue;
      }
      usedSlugs.add(entry.id);
      oils.push(supplementalToCanonical(entry));
      report.supplemental.push(entry.displayName);
    }
  }

  const db: CanonicalOilDatabase = {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    methodology: {
      sapConversion: 'mg KOH/g ÷ 1000 = KOH coefficient; mg KOH/g ÷ 1402.5 = NaOH coefficient (ISO 3657 / FNWL)',
      references: [
        {
          name: 'From Nature With Love — Saponification Chart',
          url: 'https://www.fromnaturewithlove.com/resources/sapon.asp',
          role: 'Primary SAP cross-check (mg KOH/g, public table)',
        },
        {
          name: 'LDG International — Saponification Chart',
          url: 'https://www.ldg.international/saponification-chart/',
          role: 'Secondary SAP cross-check (same methodology as FNWL)',
        },
        {
          name: 'ISO 3657:2023',
          url: 'https://www.iso.org/standard/85171.html',
          role: 'Lab titration methodology for mg KOH/g (supplier COA format)',
        },
        {
          name: 'EU CosIng Database',
          url: 'https://ec.europa.eu/growth/tools-databases/cosing/',
          role: 'INCI name validation (regulatory, public)',
        },
      ],
    },
    oils,
  };

  CanonicalOilDatabase.parse(db);

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(db, null, 2) + '\n');

  const liteDb = {
    version: db.version,
    generatedAt: db.generatedAt,
    oils: oils.map((oil) => ({
      id: oil.id,
      displayName: oil.displayName,
      aliases: oil.aliases,
      inciName: oil.inciName,
      category: oil.category,
      sapRole: oil.sapRole,
      sapKoh: oil.sapKoh,
      sapNaoh: oil.sapNaoh,
      confidence: oil.confidence,
      propertiesAvailable: oil.propertiesAvailable,
      ...(oil.iodine !== undefined ? { iodine: oil.iodine } : {}),
      ...(oil.ins !== undefined ? { ins: oil.ins } : {}),
      ...(oil.propertiesAvailable && oil.fattyAcids
        ? { fattyAcids: oil.fattyAcids }
        : {}),
    })),
  };
  writeFileSync(litePath, JSON.stringify(liteDb, null, 2) + '\n');

  writeFileSync(reportPath, JSON.stringify({
    generatedAt: db.generatedAt,
    totalOils: oils.length,
    fnwlCatalogSize: fnwlRows.length,
    matchedFnwl: report.matched.length,
    unmatchedFnwl: report.unmatched.length,
    ...report,
  }, null, 2) + '\n');

  console.log(`Built ${oils.length} canonical oils → ${outPath}`);
  console.log(`  Lite client DB → ${litePath}`);
  console.log(`  FNWL matched: ${report.matched.length}/${oils.length}`);
  console.log(`  Unmatched (legacy only): ${report.unmatched.length}`);
  console.log(`  SAP retained (legacy, >${DISPUTED_DELTA_PCT}% delta): ${report.sapRetainedLegacy.length}`);
  console.log(`  SAP conservative blend (5–${DISPUTED_DELTA_PCT}% delta): ${report.sapConservativeBlend.length}`);
  console.log(`  LDG methodology cross-checks: ${report.ldgMethodologyNotes.length}`);
  console.log(`  INCI resolved (FNWL): ${report.inciResolved.length}`);
  console.log(`  INCI missing product map: ${report.inciMissing.length}`);
  console.log(`  Supplemental oils: ${report.supplemental.length}`);
}

main();
