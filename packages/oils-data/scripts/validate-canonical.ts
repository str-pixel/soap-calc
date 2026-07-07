import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sapKohToSapNaoh } from '@soap-calc/core';
import { CanonicalOilDatabase } from '../src/schema.js';
import { DISPUTED_DELTA_PCT, sapDeltaPercent } from '../src/sap-policy.js';
import {
  defaultGlossaryPath,
  loadCosingGlossaryIndex,
  lookupInciInGlossary,
  validateInciName,
} from '../src/cosing-glossary.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataPath = join(__dirname, '../data/canonical-oils.json');

/** Golden SAP values for high-risk oils (SoapCalc lineage). */
const GOLDEN_SAP_KOH: Record<string, number> = {
  'palm-kernel-oil': 0.247,
  'coconut-oil-76': 0.257,
  'olive-oil': 0.19,
};

/** Proxy SAP values — estimated, not SoapCalc-verified. */
const ESTIMATED_SAP_KOH: Record<string, number> = {
  'birch-tar': 0.06,
};

function main() {
  const raw = JSON.parse(readFileSync(dataPath, 'utf8'));
  const db = CanonicalOilDatabase.parse(raw);
  const cosingGlossary = loadCosingGlossaryIndex(defaultGlossaryPath);

  const errors: string[] = [];
  const warnings: string[] = [];

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
    const legacySource = oil.sources.find((s) => s.source === 'legacy_soapee');

    if (fnwlSource?.sapKoh && legacySource?.sapKoh) {
      const delta = sapDeltaPercent(legacySource.sapKoh, fnwlSource.sapKoh);

      if (
        delta > DISPUTED_DELTA_PCT &&
        oil.primarySource === 'fnwl' &&
        fnwlSource.sapKoh < legacySource.sapKoh
      ) {
        errors.push(
          `${oil.id}: FNWL primary but SAP delta ${delta.toFixed(1)}% exceeds ${DISPUTED_DELTA_PCT}%`,
        );
      }

      // Using FNWL when it is lower than legacy risks under-lye; higher FNWL is allowed for safety.
      if (
        delta > DISPUTED_DELTA_PCT &&
        oil.sapKoh === fnwlSource.sapKoh &&
        fnwlSource.sapKoh < legacySource.sapKoh
      ) {
        errors.push(
          `${oil.id}: using lower FNWL SAP despite ${delta.toFixed(1)}% delta from legacy`,
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

    if (oil.inciName) {
      for (const issue of validateInciName(oil.inciName)) {
        warnings.push(`${oil.id}: ${issue}`);
      }
      if (cosingGlossary) {
        const lookup = lookupInciInGlossary(oil.inciName, cosingGlossary);
        if (!lookup.found) {
          warnings.push(`${oil.id}: INCI not in local CosIng glossary index`);
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

    if (oil.primarySource === 'legacy_soapee' && fnwlSource?.sapKoh) {
      if (Math.abs(oil.sapKoh - fnwlSource.sapKoh) < 0.0001) {
        if (Math.abs(fnwlSource.sapKoh - legacySource!.sapKoh!) > 0.0001) {
          errors.push(`${oil.id}: primarySource legacy_soapee but sapKoh matches FNWL`);
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

  console.log(`Validated ${db.oils.length} oils`);
  console.log(`  Errors: ${errors.length}`);
  console.log(`  Warnings: ${warnings.length}`);

  if (errors.length) {
    errors.forEach((e) => console.error(`  ERROR: ${e}`));
    process.exit(1);
  }

  warnings.slice(0, 15).forEach((w) => console.warn(`  WARN: ${w}`));
  if (warnings.length > 15) console.warn(`  ... and ${warnings.length - 15} more warnings`);
}

main();
