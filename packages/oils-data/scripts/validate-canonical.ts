import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sapKohToSapNaoh } from '@soap-calc/core';
import { CanonicalOilDatabase } from '../src/schema.js';
import {
  defaultGlossaryPath,
  loadCosingGlossaryIndex,
  lookupInciInGlossary,
  validateInciName,
} from '../src/cosing-glossary.js';
import { loadSupplementalInci } from '../src/resolve-inci.js';
import { LEGACY_SAP_CORRECTIONS } from '../src/sap-corrections.js';
import { incompleteProfileOils } from '../src/profile-completeness.js';
import { classifyProfileSapDeviations } from '../src/profile-sap-deviations.js';
import { PROFILE_BACKFILL } from '../src/profile-backfill.js';
import { OIL_ID_OVERRIDES } from '../src/oil-id-overrides.js';
import { defaultInventoryPath, inciInInventory, loadCosingInventory } from '../src/cosing-inventory.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataPath = join(__dirname, '../data/canonical-oils.json');
const litePath = join(__dirname, '../data/canonical-oils-lite.json');
const supplementalInciPath = join(__dirname, '../sources/supplemental-inci.json');

/** Golden SAP values for high-risk oils (legacy catalog). */
const GOLDEN_SAP_KOH: Record<string, number> = {
  'palm-kernel-oil': 0.247,
  'coconut-oil-76': 0.257,
  'olive-oil': 0.19,
};

/** Proxy / corrected SAP values — estimated, not legacy-catalog-verified. birch-tar is a
 * pine-tar proxy; the corrected legacy oils are pulled from the shared LEGACY_SAP_CORRECTIONS
 * so the expected value lives in exactly one place (build applies it, validate asserts it). */
const ESTIMATED_SAP_KOH: Record<string, number> = {
  'birch-tar': 0.06,
  ...Object.fromEntries(
    Object.entries(LEGACY_SAP_CORRECTIONS).map(([id, c]) => [id, c.sapKoh]),
  ),
};

function main() {
  const raw = JSON.parse(readFileSync(dataPath, 'utf8'));
  const db = CanonicalOilDatabase.parse(raw);
  const cosingGlossary = loadCosingGlossaryIndex(defaultGlossaryPath);
  // Guard the load, so a missing source file degrades to "no corrections" instead of
  // crashing the validator — but say so, since the drift check is disabled in that state.
  const supplementalInci = existsSync(supplementalInciPath)
    ? loadSupplementalInci(supplementalInciPath)
    : null;
  const inciCorrections = supplementalInci?.inciCorrections ?? {};
  const cosingInventory = loadCosingInventory(defaultInventoryPath);

  const errors: string[] = [];
  const warnings: string[] = [];
  if (!existsSync(supplementalInciPath)) {
    warnings.push('sources/supplemental-inci.json missing — INCI correction drift checks skipped');
  }
  if (!cosingInventory) {
    warnings.push('CosIng inventory snapshot missing — source:"cosing" claims cannot be machine-verified');
  }

  // Every source:"cosing" claim in the supplemental file — across ALL maps, not just the new
  // inciCorrections layer — must be falsifiable against the committed CosIng inventory snapshot.
  // Refresh the snapshot (or downgrade the claim to "manual") rather than shipping an unverifiable
  // "cosing" name.
  if (supplementalInci && cosingInventory) {
    const maps = { inciCorrections, byOilId: supplementalInci.byOilId, byFnwlProductId: supplementalInci.byFnwlProductId };
    for (const [mapName, map] of Object.entries(maps)) {
      for (const [key, entry] of Object.entries(map)) {
        if (entry.source === 'cosing' && !inciInInventory(entry.inciName, cosingInventory)) {
          errors.push(
            `${mapName}.${key}: source:"cosing" INCI "${entry.inciName}" is not in the CosIng inventory snapshot`,
          );
        }
      }
    }
  }

  for (const oil of db.oils) {
    const expectedNaoh = sapKohToSapNaoh(oil.sapKoh);
    if (Math.abs(expectedNaoh - oil.sapNaoh) > 0.001) {
      errors.push(`${oil.id}: sapNaoh ${oil.sapNaoh} != sapKoh/1.4025 (${expectedNaoh.toFixed(4)})`);
    }

    if (Math.abs(oil.sapMgKohPerGram - oil.sapKoh * 1000) > 0.5) {
      errors.push(`${oil.id}: sapMgKohPerGram inconsistent with sapKoh`);
    }

    const fnwlSource = oil.sources.find((s) => s.source === 'fnwl');
    const ldgSource = oil.sources.find((s) => s.source === 'ldg');
    const cosingSource = oil.sources.find((s) => s.source === 'cosing');
    const legacySource = oil.sources.find((s) => s.source === 'legacy_catalog');

    if (fnwlSource?.sapKoh && legacySource?.sapKoh) {
      // Disputed SAP resolves to whichever source is closest to the profile (or their
      // midpoint) — never the max, since higher SAP is not "safer". The only invariant
      // is that the result stays within the two sources' range.
      const lo = Math.min(legacySource.sapKoh, fnwlSource.sapKoh);
      const hi = Math.max(legacySource.sapKoh, fnwlSource.sapKoh);
      if (oil.sapKoh < lo - 1e-9 || oil.sapKoh > hi + 1e-9) {
        errors.push(
          `${oil.id}: resolved sapKoh ${oil.sapKoh} is outside the legacy/FNWL range [${lo}, ${hi}]`,
        );
      }
    }

    if (oil.sapKoh < 0.03 || oil.sapKoh > 0.35) {
      warnings.push(`${oil.id}: unusual sapKoh ${oil.sapKoh}`);
    }

    if (oil.propertiesAvailable && oil.fattyAcids) {
      const sum = Object.values(oil.fattyAcids).reduce((a, b) => a + b, 0);
      if (sum < 50 || sum > 105) {
        warnings.push(`${oil.id}: fatty acid sum ${sum.toFixed(1)}% (category: ${oil.category})`);
      }
    }

    if (!oil.propertiesAvailable && oil.category === 'triglyceride') {
      warnings.push(`${oil.id}: triglyceride marked propertiesAvailable=false`);
    }

    if (oil.sapRole === 'acid_neutralization') {
      if (oil.propertiesAvailable) {
        errors.push(`${oil.id}: acid_neutralization entry must have propertiesAvailable=false`);
      }
      if (oil.confidence === 'verified') {
        warnings.push(`${oil.id}: acid_neutralization SAP should not be marked verified`);
      }
    }

    if (oil.category === 'tar' && !oil.sapRole) {
      warnings.push(`${oil.id}: tar category without sapRole`);
    }

    if (fnwlSource && !ldgSource) {
      warnings.push(`${oil.id}: FNWL match without LDG methodology cross-check source`);
    }

    const correction = inciCorrections[oil.id];
    if (correction && oil.inciName !== correction.inciName) {
      // The correction layer is authoritative; any drift means something (e.g. the
      // FNWL-derived glossary) rewrote the corrected name during the build.
      errors.push(
        `${oil.id}: inciName "${oil.inciName}" does not match inciCorrections value "${correction.inciName}"`,
      );
    }
    // (source:"cosing" claims are verified once, globally, above — across every map.)

    if (oil.inciName) {
      for (const issue of validateInciName(oil.inciName)) {
        warnings.push(`${oil.id}: ${issue}`);
      }
      // The proxy glossary is FNWL-derived and incomplete; a name confirmed by the real
      // CosIng inventory snapshot needs no proxy-glossary warning.
      const inventoryConfirmed = cosingInventory ? inciInInventory(oil.inciName, cosingInventory) : false;
      if (cosingGlossary && !inventoryConfirmed) {
        const lookup = lookupInciInGlossary(oil.inciName, cosingGlossary);
        if (!lookup.found) {
          warnings.push(`${oil.id}: INCI not in local CosIng glossary index or inventory snapshot`);
        }
      }
      if (!cosingSource) {
        warnings.push(`${oil.id}: inciName set but no cosing source record`);
      }
    } else if (fnwlSource) {
      warnings.push(`${oil.id}: FNWL match but no INCI name resolved`);
    }

    if (oil.confidence === 'legacy_only' && fnwlSource?.sapKoh && legacySource?.sapKoh) {
      const usingLegacySap = Math.abs(oil.sapKoh - legacySource.sapKoh) < 0.0001;
      const fnwlDiffers = Math.abs(fnwlSource.sapKoh - legacySource.sapKoh) > 0.0001;
      if (usingLegacySap && fnwlDiffers) {
        warnings.push(`${oil.id}: FNWL reference present but legacy SAP used (disputed delta)`);
      }
    } else if (oil.confidence === 'legacy_only') {
      warnings.push(`${oil.id}: no FNWL match — legacy SAP only`);
    }

    if (oil.primarySource === 'fnwl' && legacySource?.sapKoh) {
      if (Math.abs(oil.sapKoh - legacySource.sapKoh) < 0.0001 && fnwlSource?.sapKoh) {
        if (Math.abs(fnwlSource.sapKoh - legacySource.sapKoh) > 0.0001) {
          errors.push(`${oil.id}: primarySource fnwl but sapKoh matches legacy, not FNWL`);
        }
      }
    }

    if (oil.primarySource === 'legacy_catalog' && fnwlSource?.sapKoh) {
      if (Math.abs(oil.sapKoh - fnwlSource.sapKoh) < 0.0001) {
        if (Math.abs(fnwlSource.sapKoh - legacySource!.sapKoh!) > 0.0001) {
          errors.push(`${oil.id}: primarySource legacy_catalog but sapKoh matches FNWL`);
        }
      }
    }

    const golden = GOLDEN_SAP_KOH[oil.id];
    if (golden !== undefined && Math.abs(oil.sapKoh - golden) > 0.005) {
      errors.push(`${oil.id}: sapKoh ${oil.sapKoh} differs from golden ${golden}`);
    }

    const estimated = ESTIMATED_SAP_KOH[oil.id];
    if (estimated !== undefined) {
      if (Math.abs(oil.sapKoh - estimated) > 0.005) {
        errors.push(`${oil.id}: sapKoh ${oil.sapKoh} differs from estimated proxy ${estimated}`);
      }
      if (oil.confidence === 'verified') {
        errors.push(`${oil.id}: estimated proxy SAP must not be marked verified`);
      }
    }
  }

  const ids = db.oils.map((o) => o.id);
  const dupeIds = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dupeIds.length) errors.push(`Duplicate ids: ${[...new Set(dupeIds)].join(', ')}`);

  for (const { id, sum } of incompleteProfileOils(db.oils)) {
    warnings.push(`${id}: fatty-acid profile only ${sum.toFixed(0)}% complete — properties are estimates`);
  }

  // Phase 5 backfill drift guard: the built profile must equal the curated table (which build
  // applies), so the sourced value lives in exactly one place. An id in the table with no oil,
  // or a mismatch, means the build and the table have diverged.
  for (const [id, backfill] of Object.entries(PROFILE_BACKFILL)) {
    // PROFILE_BACKFILL is keyed by the internal build slug; the emitted id may be overridden.
    const emittedId = OIL_ID_OVERRIDES[id] ?? id;
    const oil = db.oils.find((o) => o.id === emittedId);
    if (!oil) {
      errors.push(`PROFILE_BACKFILL["${id}"] has no matching oil in the built catalog`);
      continue;
    }
    const built = oil.fattyAcids ?? {};
    const expected = backfill.profile;
    const keys = new Set([...Object.keys(built), ...Object.keys(expected)]);
    const mismatch = [...keys].some((k) => built[k] !== expected[k]);
    if (mismatch) {
      errors.push(
        `${id}: built fatty-acid profile ${JSON.stringify(built)} does not match PROFILE_BACKFILL ${JSON.stringify(expected)}`,
      );
    }
  }

  // "Modeled" UI-signal drift guard: the lite DB must flag sourceType 'derived' on exactly the
  // backfills whose profile is a reconstruction, never on an fdc/literature one (those are measured).
  // A false positive defames measured data; a false negative ships a reconstruction as if measured.
  // This lives here, with the other build-output guards, rather than in a src unit test — it asserts
  // a property of generated data, so a stale build must read as "rebuild", not as a source bug.
  {
    const liteDb = JSON.parse(readFileSync(litePath, 'utf8')) as {
      oils: { id: string; sourceType?: string }[];
    };
    const expectedModeled = Object.entries(PROFILE_BACKFILL)
      .filter(([, backfill]) => backfill.sourceType === 'derived')
      .map(([slug]) => OIL_ID_OVERRIDES[slug] ?? slug)
      .sort();
    const flaggedModeled = liteDb.oils
      .filter((o) => o.sourceType === 'derived')
      .map((o) => o.id)
      .sort();
    if (flaggedModeled.join('|') !== expectedModeled.join('|')) {
      errors.push(
        `lite DB sourceType 'derived' drift: flagged [${flaggedModeled.join(', ')}] but PROFILE_BACKFILL expects [${expectedModeled.join(', ')}]`,
      );
    }
  }

  // Profile-consistency gate: the fatty-acid profile is the independent oracle for stored SAP.
  // A trusted (verified/estimated) SAP that contradicts its own chemistry is the carrot class —
  // block the build until it's reviewed and either corrected or added to the acknowledged list.
  for (const dev of classifyProfileSapDeviations(db.oils)) {
    const base = `${dev.id}: stored SAP deviates ${dev.deltaPct}% from its fatty-acid profile`;
    if (dev.tier === 'error') {
      errors.push(
        `${base} — a trusted (verified/estimated) value contradicting its own chemistry (the carrot class); correct it or add an acknowledged-deviation entry after human review`,
      );
    } else if (dev.tier === 'warn') {
      warnings.push(`${base} (legacy_only — low-confidence SAP, no external source to reconcile)`);
    } else {
      warnings.push(`${base} — acknowledged: ${dev.reason}`);
    }
  }

  console.log(`Validated ${db.oils.length} oils`);
  console.log(`  Errors: ${errors.length}`);
  console.log(`  Warnings: ${warnings.length}`);

  if (errors.length) {
    errors.forEach((e) => console.error(`  ERROR: ${e}`));
    process.exit(1);
  }

  // The standing expected-warning pool is large, so a flat list capped at 15 lines would
  // hide any new warning type below the fold. Group by type (message with the oil id and
  // numbers stripped) so a new or growing category is always visible.
  const byType = new Map<string, number>();
  for (const w of warnings) {
    const type = w.replace(/^[^:]+: /, '').replace(/"[^"]*"/g, '"…"').replace(/[\d.]+/g, '#');
    byType.set(type, (byType.get(type) ?? 0) + 1);
  }
  [...byType.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([type, count]) => console.warn(`  WARN ×${count}: ${type}`));
  warnings.slice(0, 15).forEach((w) => console.warn(`  WARN: ${w}`));
  if (warnings.length > 15) console.warn(`  ... and ${warnings.length - 15} more warnings`);
}

main();
