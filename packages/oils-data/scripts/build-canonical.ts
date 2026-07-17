import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deriveChemistryFromProfile, parseSapRangeMgKoh, sapKohToSapNaoh } from '@soap-calc/core';
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
import { resolvePrimarySap, sapDeltaPercent, VERIFIED_DELTA_PCT } from '../src/sap-policy.js';
import {
  inferCategory,
  normalizeOilName,
  slugify,
} from '../src/normalize.js';
import { loadSupplementalOils, supplementalToCanonical, tarMetadataForLegacy } from '../src/supplemental.js';
import { loadSupplementalInci, resolveOilInci } from '../src/resolve-inci.js';
import { isInciCorrectionRedundant } from '../src/inci-redundancy.js';
import { LEGACY_SAP_CORRECTIONS } from '../src/sap-corrections.js';
import { PROFILE_BACKFILL } from '../src/profile-backfill.js';
import { incompleteProfileOils } from '../src/profile-completeness.js';
import { OIL_ID_OVERRIDES } from '../src/oil-id-overrides.js';
import { OIL_DISPLAY_NAMES } from '../src/oil-display-names.js';
import { maxAbsShift, propertyShift, PROPERTY_SHIFT_THRESHOLD, type PropertyShift } from '../src/property-shift.js';
import { defaultInventoryPath, inciInInventory, loadCosingInventory } from '../src/cosing-inventory.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '../../..');
const fnwlPath = join(__dirname, '../sources/fnwl-sapon.txt');
const fnwlInciPath = join(__dirname, '../sources/fnwl-inci.txt');
const legacyPath = join(root, 'soap_oils.json');
const supplementalPath = join(__dirname, '../sources/supplemental-oils.json');
const supplementalInciPath = join(__dirname, '../sources/supplemental-inci.json');
const excludedOilsPath = join(__dirname, '../sources/excluded-oils.json');
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

/** Legacy source used the misspelling "docosenoid"; canonical data uses "docosenoic". */
const FATTY_ACID_KEY_ALIASES: Record<string, string> = {
  docosenoid: 'docosenoic',
};

function normalizeFattyAcidKeys(
  profile: Record<string, number>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(profile)) {
    out[FATTY_ACID_KEY_ALIASES[key] ?? key] = value;
  }
  return out;
}

function parseBreakdown(raw: LegacyOil['breakdown']): Record<string, number> | undefined {
  if (!raw) return undefined;
  if (typeof raw === 'object') return normalizeFattyAcidKeys(raw);
  try {
    return normalizeFattyAcidKeys(JSON.parse(raw) as Record<string, number>);
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
  // parseFnwlCsv silently skips unparseable rows, so a quoting/format change in the
  // snapshot would otherwise degrade most of the catalog to legacy_only without any
  // error. Mirror fetch-fnwl's < 50 raw-line floor here, after parsing.
  if (fnwlRows.length < 50) {
    console.error(
      `FNWL snapshot parsed to only ${fnwlRows.length} rows — source format likely changed. Aborting build.`,
    );
    process.exit(1);
  }
  const fnwlIndex = buildFnwlIndex(fnwlRows);

  // Missing entirely is the same silent-degradation the row-floor below guards against
  // (most of the catalog loses its FNWL INCI name), so treat it as fatal like the SAP snapshot.
  if (!existsSync(fnwlInciPath)) {
    console.error('Missing FNWL INCI source. Run: npm run fetch:fnwl-inci -w @soap-calc/oils-data');
    process.exit(1);
  }
  const inciRows = parseFnwlInciCsv(readFileSync(fnwlInciPath, 'utf8'));
  // Same failure mode as the SAP snapshot: a truncated or format-changed INCI chart
  // parses to few rows and silently strips INCI names from most of the catalog.
  if (inciRows.length < 50) {
    console.error(
      `FNWL INCI snapshot parsed to only ${inciRows.length} rows — source format likely changed or file truncated. Aborting build.`,
    );
    process.exit(1);
  }
  const inciIndex = buildFnwlInciIndex(inciRows);
  const cosingGlossary = loadCosingGlossaryIndex(defaultGlossaryPath);
  // Required: a silent fallback here would drop every INCI correction and supplemental
  // name and ship the malformed FNWL values they exist to fix.
  if (!existsSync(supplementalInciPath)) {
    console.error('Missing sources/supplemental-inci.json — INCI corrections would be silently dropped. Aborting build.');
    process.exit(1);
  }
  const supplementalInci = loadSupplementalInci(supplementalInciPath);
  const cosingInventory = loadCosingInventory(defaultInventoryPath);
  if (!cosingInventory) {
    console.warn('CosIng inventory snapshot missing — source:"cosing" claims cannot be machine-verified this build.');
  }

  const legacy = JSON.parse(readFileSync(legacyPath, 'utf8')) as { oils: LegacyOil[] };
  const report = {
    matched: [] as string[],
    unmatched: [] as string[],
    sapDiscrepancies: [] as Array<{ name: string; legacy: number; fnwl: number; deltaPct: number }>,
    sapProfileClosest: [] as string[],
    sapMidpoint: [] as string[],
    sapCorrected: [] as string[],
    ldgMethodologyNotes: [] as string[],
    inciResolved: [] as string[],
    inciMissing: [] as string[],
    inciSupplemental: [] as string[],
    inciCorrected: [] as string[],
    inciCorrectionRedundant: [] as string[],
    duplicates: [] as string[],
    supplemental: [] as string[],
    excluded: [] as string[],
    profileBackfill: [] as Array<{ name: string; shifts: PropertyShift[]; flagged: boolean; acknowledged: boolean }>,
  };

  const excludedOilIds = new Set<string>(
    existsSync(excludedOilsPath)
      ? ((JSON.parse(readFileSync(excludedOilsPath, 'utf8')) as { oilIds: string[] }).oilIds ?? [])
      : [],
  );

  const oils: CanonicalOil[] = [];
  const usedSlugs = new Set<string>();
  const appliedSapCorrections = new Set<string>();

  for (const leg of legacy.oils) {
    const canonicalSlug = slugify(leg.name);
    if (excludedOilIds.has(canonicalSlug)) {
      report.excluded.push(leg.name);
      continue;
    }

    const fnwl = findFnwlMatch(leg.name, fnwlIndex);
    let baseSlug = canonicalSlug;
    if (usedSlugs.has(baseSlug)) {
      baseSlug = `${baseSlug}-${leg.id}`;
      report.duplicates.push(leg.name);
    }
    usedSlugs.add(baseSlug);

    // Phase 5: a curated backfill REPLACES the (truncated/wrong) legacy profile with a single-
    // provenance, cited one. The legacy raw breakdown stays in the legacy source file; the
    // citation is recorded as an `fdc`/provenance source record below.
    const backfill = PROFILE_BACKFILL[baseSlug];
    const legacyProfile = parseBreakdown(leg.breakdown);
    const fattyAcids = backfill ? { ...backfill.profile } : legacyProfile;
    const category = inferCategory(leg.name, baseSlug);
    const propertiesAvailable = category === 'triglyceride' || category === 'blend';

    const legacySapNaoh = sapKohToSapNaoh(leg.sap);
    const sources: CanonicalOil['sources'] = [{
      source: 'legacy_catalog',
      sapKoh: leg.sap,
      sapNaoh: legacySapNaoh,
      notes: 'Imported from soap_oils.json (legacy calculator catalog)',
    }];

    if (backfill) {
      // Strip a trailing period from `source` so the ". " joiner doesn't yield ".." in the emitted notes.
      sources.push({ source: backfill.sourceType, url: backfill.url, notes: `Fatty-acid profile: ${backfill.source.replace(/\.$/, '')}. ${backfill.note}` });
      // Property-shift guard: a backfill can be SAP-consistent yet move the property bars a lot
      // (SAP is ~invariant to a palmitic↔oleic swap; the bars are not). Surface the deltas so a
      // large, single-source-outlier shift is loud, not silent — and ERROR below on a large,
      // unacknowledged one so it can't ship without a deliberate, explained decision.
      const shifts = propertyShift(legacyProfile, backfill.profile);
      const flagged = maxAbsShift(shifts) >= PROPERTY_SHIFT_THRESHOLD;
      report.profileBackfill.push({
        name: backfill.displayName ?? leg.name,
        shifts,
        flagged,
        acknowledged: backfill.acknowledgedShift === true,
      });
    }

    let primarySource: DataSource = 'legacy_catalog';
    let confidence: CanonicalOil['confidence'] = 'legacy_only';
    let sapKoh = leg.sap;
    let sapNaoh = legacySapNaoh;
    let ins = leg.ins;
    let iodine = leg.iodine;
    let inciName: string | undefined;

    if (fnwl) {
      const range = parseSapRangeMgKoh(fnwl.sapRange);
      const delta = sapDeltaPercent(leg.sap, fnwl.sapKoh);
      // The profile is the independent tiebreaker for disputed SAP (null when <93% mapped).
      // Gate on category: deriveChemistryFromProfile assumes a triglyceride backbone, so its
      // SAP is only valid for glycerides. A free acid or wax with a ≥93%-mapped acid list
      // (lauric-acid, stearic-acid, …) would otherwise get a bogus triglyceride SAP as the
      // tiebreaker — under-stating the true (higher, glycerol-free) value by ~4–6%.
      const profileDerivedSapKoh =
        fattyAcids && (category === 'triglyceride' || category === 'blend')
          ? deriveChemistryFromProfile(fattyAcids)?.sapKoh
          : undefined;
      const resolution = resolvePrimarySap(leg.sap, fnwl.sapKoh, profileDerivedSapKoh);
      const resolvedInci = resolveInciForFnwlProduct(fnwl.productId, inciIndex);
      if (resolvedInci) {
        inciName = resolvedInci;
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

      report.matched.push(leg.name);

      if (delta > 2) {
        report.sapDiscrepancies.push({
          name: leg.name,
          legacy: leg.sap,
          fnwl: fnwl.sapKoh,
          deltaPct: Math.round(delta * 10) / 10,
        });
      }

      if (resolution.strategy === 'profile_closest') {
        report.sapProfileClosest.push(leg.name);
        sources.push({
          source: 'manual',
          sapKoh: resolution.sapKoh,
          sapNaoh: resolution.sapNaoh,
          notes: `legacy/FNWL differ by ${resolution.deltaPct.toFixed(1)}% (>${VERIFIED_DELTA_PCT}%); kept the source closest to the profile-derived SAP`,
        });
      } else if (resolution.strategy === 'midpoint') {
        report.sapMidpoint.push(leg.name);
        sources.push({
          source: 'manual',
          sapKoh: resolution.sapKoh,
          sapNaoh: resolution.sapNaoh,
          notes: `legacy/FNWL differ by ${resolution.deltaPct.toFixed(1)}% (>${VERIFIED_DELTA_PCT}%); profile can't judge (incomplete), used the midpoint`,
        });
      }

      sapKoh = resolution.sapKoh;
      sapNaoh = resolution.sapNaoh;
      primarySource = resolution.primarySource;
      confidence = resolution.confidence;
    } else {
      report.unmatched.push(leg.name);
      const correction = LEGACY_SAP_CORRECTIONS[baseSlug];
      if (correction) {
        sapKoh = correction.sapKoh;
        sapNaoh = sapKohToSapNaoh(correction.sapKoh);
        confidence = 'estimated';
        primarySource = 'manual';
        // Some legacy iodine values are themselves inconsistent with the profile; use the
        // corrected one when supplied so the INS below isn't rebuilt on a bad input.
        if (correction.iodine !== undefined) {
          iodine = correction.iodine;
        }
        // The legacy INS was derived from the discredited legacy SAP (INS = SAP mg KOH/g
        // − iodine); recompute it from the corrected SAP (and iodine) so the two do not
        // contradict. Without an iodine value the formula can't run, so drop the stale INS
        // rather than ship a value derived from the SAP we just discredited.
        ins = iodine !== undefined ? Math.round(sapKoh * 1000 - iodine) : undefined;
        sources.push({
          source: 'manual',
          sapKoh,
          sapNaoh,
          notes: correction.note,
        });
        report.sapCorrected.push(leg.name);
        appliedSapCorrections.add(baseSlug);
      }
    }

    const fnwlChartInci = inciName;
    const inciResolution = resolveOilInci({
      oilId: baseSlug,
      displayName: leg.name,
      fnwlProductId: fnwl?.productId,
      fnwlInci: inciName,
      supplemental: supplementalInci,
      glossary: cosingGlossary,
    });

    if (inciResolution) {
      inciName = inciResolution.inciName;
      if (
        inciResolution.source === 'correction' &&
        isInciCorrectionRedundant(fnwlChartInci, inciResolution.inciName)
      ) {
        // The FNWL chart caught up with the correction — it no longer overrides anything.
        console.warn(`Redundant INCI correction for ${baseSlug}: FNWL chart now matches "${inciName}"`);
        report.inciCorrectionRedundant.push(baseSlug);
      }
      if (inciResolution.source === 'fnwl') {
        report.inciResolved.push(leg.name);
        if (cosingGlossary) {
          const inciLookup = lookupInciInGlossary(inciName, cosingGlossary);
          const inInventory = cosingInventory ? inciInInventory(inciName, cosingInventory) : false;
          sources.push({
            source: 'cosing',
            url: 'https://ec.europa.eu/growth/tools-databases/cosing/',
            notes: inInventory
              ? `INCI "${inciName}" verified against the EU CosIng Ingredients Inventory snapshot`
              : inciLookup.found
                ? `INCI "${inciLookup.canonicalInci}" found in FNWL-derived CosIng glossary index`
                : `INCI "${inciName}" from FNWL chart — not in local glossary index`,
          });
        }
      } else {
        (inciResolution.source === 'correction'
          ? report.inciCorrected
          : report.inciSupplemental
        ).push(leg.name);
        sources.push({
          source: 'manual',
          notes: [`INCI via ${inciResolution.source.replace('_', ' ')}`, inciResolution.notes]
            .filter(Boolean)
            .join(' — '),
        });
        // A cosing record is earned by machine verification, never by a self-declared
        // source claim: either the name is in the committed EU CosIng inventory extract
        // (independent of FNWL), or it is at least in the FNWL-derived proxy glossary.
        const inInventory = cosingInventory ? inciInInventory(inciName, cosingInventory) : false;
        if (inInventory || inciResolution.cosingValidated) {
          sources.push({
            source: 'cosing',
            url: 'https://ec.europa.eu/growth/tools-databases/cosing/',
            notes: inInventory
              ? `INCI "${inciName}" verified against the EU CosIng Ingredients Inventory snapshot`
              : `INCI "${inciName}" present in local FNWL-derived CosIng glossary index`,
          });
        }
      }
    } else if (fnwl?.productId) {
      report.inciMissing.push(leg.name);
    }

    // A backfill may override the user-facing name when the legacy name is wrong/misleading
    // (e.g. a high-erucic rapeseed mislabeled "unrefined canola"). Aliases follow the shown name
    // so search no longer matches the wrong identity; the stable id (baseSlug) is unchanged.
    const displayName = OIL_DISPLAY_NAMES[baseSlug] ?? backfill?.displayName ?? leg.name;
    // The emitted public id may be overridden (e.g. a mislabeled slug); internal lookups above
    // still use baseSlug, and the web oilById migration resolves the old id for saved recipes.
    const id = OIL_ID_OVERRIDES[baseSlug] ?? baseSlug;
    oils.push({
      id,
      displayName,
      aliases: [normalizeOilName(displayName)],
      inciName,
      category,
      ...tarMetadataForLegacy(category),
      sapKoh,
      sapNaoh,
      sapMgKohPerGram: sapKoh * 1000,
      iodine,
      ins,
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

  // A correction keyed to a non-existent oil id would otherwise be silently ignored,
  // shipping the very value it was written to fix. An excluded oil id is a legitimate
  // target (the correction is simply inert), so it is not a typo.
  // A backfill id-override must not collide with another oil's (emitted) id. usedSlugs only
  // dedups the internal build slugs, so an override → existing-id collision would otherwise slip
  // past here and produce two oils with the same public id.
  const emittedIdCounts = new Map<string, number>();
  for (const o of oils) emittedIdCounts.set(o.id, (emittedIdCounts.get(o.id) ?? 0) + 1);
  const collidingIds = [...emittedIdCounts].filter(([, n]) => n > 1).map(([id]) => id);
  if (collidingIds.length) {
    console.error(`Duplicate emitted oil id(s) (an OIL_ID_OVERRIDES collision?): ${collidingIds.join(', ')}`);
    process.exit(1);
  }

  // A backfill whose property-score shift is large (≥ threshold) must be explicitly acknowledged
  // (acknowledgedShift), so a big — possibly wrong — move can't ship silently. The SAP gate errors
  // on chemistry contradictions; this is its property-score counterpart.
  const unacknowledgedShifts = report.profileBackfill.filter((b) => b.flagged && !b.acknowledged);
  if (unacknowledgedShifts.length) {
    for (const b of unacknowledgedShifts) {
      const top = b.shifts.slice(0, 3).map((s) => `${s.property} ${s.delta > 0 ? '+' : ''}${s.delta}`).join(', ');
      console.error(`Unacknowledged property shift ≥${PROPERTY_SHIFT_THRESHOLD}pt for ${b.name} [${top}] — set acknowledgedShift:true (with a note) if intended.`);
    }
    process.exit(1);
  }

  const oilIds = new Set(oils.map((o) => o.id));
  const staleCorrectionKeys = [
    ...Object.keys(supplementalInci.inciCorrections),
    ...Object.keys(LEGACY_SAP_CORRECTIONS),
  ].filter((id) => !oilIds.has(id) && !excludedOilIds.has(id));
  if (staleCorrectionKeys.length) {
    console.error(
      `Correction keys match no built or excluded oil id (typo or renamed oil?): ${staleCorrectionKeys.join(', ')}`,
    );
    process.exit(1);
  }

  // A SAP correction only applies when the oil has no FNWL match. If a built oil carries a
  // correction that never fired, an FNWL match now shadows it — surface that instead of
  // silently shipping the FNWL value the correction was meant to override.
  const shadowedSapCorrections = Object.keys(LEGACY_SAP_CORRECTIONS).filter(
    (id) => oilIds.has(id) && !appliedSapCorrections.has(id),
  );
  if (shadowedSapCorrections.length) {
    console.error(
      `SAP correction not applied — oil now has an FNWL match that shadows it; remove the correction or confirm FNWL: ${shadowedSapCorrections.join(', ')}`,
    );
    process.exit(1);
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

  // Oils whose fatty-acid profile is truncated (sums < MIN_MAPPED_PERCENT) carry unreliable
  // bar-property scores, so the web hides them from the oil picker. They still resolve by id
  // (OIL_LOOKUP / oilById), so a saved recipe referencing one keeps calculating.
  const insufficientDataIds = new Set(incompleteProfileOils(oils).map((o) => o.id));

  // Oils whose backfilled profile is DERIVED — a modeled reconstruction (a hydrogenation transform
  // of a sourced base oil), not a measured composition. The web surfaces these as "modeled" so their
  // bar-property scores read as estimates rather than measured facts. Keyed by the emitted id
  // (post OIL_ID_OVERRIDES), mirroring the validate-canonical backfill drift guard.
  const modeledProfileIds = new Set(
    Object.entries(PROFILE_BACKFILL)
      .filter(([, backfill]) => backfill.sourceType === 'derived')
      .map(([slug]) => OIL_ID_OVERRIDES[slug] ?? slug),
  );

  const liteDb = {
    version: db.version,
    generatedAt: db.generatedAt,
    // Old→new oil-id renames, emitted so the web resolves saved recipes referencing an old id.
    // Single source of truth (OIL_ID_OVERRIDES); the web reads this rather than duplicating it.
    idMigrations: OIL_ID_OVERRIDES,
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
      ...(insufficientDataIds.has(oil.id) ? { insufficientData: true } : {}),
      ...(modeledProfileIds.has(oil.id) ? { sourceType: 'derived' as const } : {}),
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
  console.log(`  SAP profile-closest (disputed >${VERIFIED_DELTA_PCT}%, profile judged): ${report.sapProfileClosest.length}`);
  console.log(`  SAP midpoint (disputed >${VERIFIED_DELTA_PCT}%, no profile): ${report.sapMidpoint.length}`);
  console.log(`  SAP corrected (legacy value vs profile): ${report.sapCorrected.length}`);
  console.log(`  LDG methodology cross-checks: ${report.ldgMethodologyNotes.length}`);
  console.log(`  INCI resolved (FNWL): ${report.inciResolved.length}`);
  console.log(`  INCI supplemental/fallback: ${report.inciSupplemental.length}`);
  console.log(`  INCI corrected (malformed FNWL value): ${report.inciCorrected.length}`);
  if (report.inciCorrectionRedundant.length) {
    console.log(`  INCI corrections now redundant (FNWL caught up): ${report.inciCorrectionRedundant.length}`);
  }
  console.log(`  INCI missing product map: ${report.inciMissing.length}`);
  console.log(`  Supplemental oils: ${report.supplemental.length}`);
  console.log(`  Profile backfilled (Phase 5): ${report.profileBackfill.length}`);
  for (const b of report.profileBackfill) {
    const top = b.shifts.slice(0, 3).map((s) => `${s.property} ${s.delta > 0 ? '+' : ''}${s.delta}`).join(', ');
    console.log(`    ${b.flagged ? '⚠ ' : ''}${b.name}: property shift [${top}]${b.flagged ? ` — ≥${PROPERTY_SHIFT_THRESHOLD}pt, review` : ''}`);
  }
  console.log(`  Excluded from catalog: ${report.excluded.length}`);
}

main();
