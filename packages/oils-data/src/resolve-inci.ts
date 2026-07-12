import { readFileSync } from 'node:fs';
import type { CosingGlossaryIndex } from './cosing-glossary.js';
import { lookupInciInGlossary } from './cosing-glossary.js';
import { normalizeOilName } from './normalize.js';
import { isPlausibleInciName } from './normalize-inci.js';
import { z } from 'zod';

export const SupplementalInciEntry = z.object({
  // Corrections bypass canonicalizeInci (they are authoritative), so the plausibility
  // check must happen at load time or a garbage name would ship unchecked.
  inciName: z.string().min(1).refine(isPlausibleInciName, { message: 'implausible INCI name' }),
  source: z.enum(['manual', 'cosing', 'fnwl_product']),
  notes: z.string().optional(),
});

export type SupplementalInciEntry = z.infer<typeof SupplementalInciEntry>;

export const SupplementalInciDatabase = z.object({
  /**
   * Highest-priority overrides, keyed by oil id. Used to correct known-malformed INCI names
   * in the FNWL snapshot (e.g. misspellings or non-INCI syntax) without editing the reproducible
   * `fnwl-inci.txt` source. Takes precedence over the FNWL chart value.
   */
  inciCorrections: z.record(SupplementalInciEntry).default({}),
  byOilId: z.record(SupplementalInciEntry).default({}),
  byFnwlProductId: z.record(SupplementalInciEntry).default({}),
  /** Normalized display-name keys → INCI (validated against CosIng glossary when available). */
  displayHints: z.record(z.string()).default({}),
});

export type SupplementalInciDatabase = z.infer<typeof SupplementalInciDatabase>;

export type ResolvedInci = {
  inciName: string;
  source: 'correction' | 'fnwl' | 'supplemental_id' | 'supplemental_product' | 'display_hint' | 'glossary';
  notes?: string;
  cosingValidated: boolean;
};

export function loadSupplementalInci(path: string): SupplementalInciDatabase {
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  return SupplementalInciDatabase.parse(raw);
}

function canonicalizeInci(
  inciName: string,
  glossary: CosingGlossaryIndex | null,
): { inciName: string; cosingValidated: boolean } {
  if (!isPlausibleInciName(inciName)) {
    return { inciName, cosingValidated: false };
  }
  if (!glossary) return { inciName, cosingValidated: false };
  const lookup = lookupInciInGlossary(inciName, glossary);
  if (lookup.found && lookup.canonicalInci) {
    return { inciName: lookup.canonicalInci, cosingValidated: true };
  }
  return { inciName, cosingValidated: false };
}

export function resolveOilInci(input: {
  oilId: string;
  displayName: string;
  fnwlProductId?: string;
  fnwlInci?: string;
  supplemental: SupplementalInciDatabase;
  glossary: CosingGlossaryIndex | null;
}): ResolvedInci | undefined {
  const { oilId, displayName, fnwlProductId, fnwlInci, supplemental, glossary } = input;

  const correction = supplemental.inciCorrections[oilId];
  if (correction) {
    // Corrections are authoritative: the glossary is derived from the same FNWL chart the
    // correction overrides (and still contains the malformed variants), so it must never
    // rewrite the corrected name — it is consulted only to report validation status.
    const cosingValidated = glossary
      ? lookupInciInGlossary(correction.inciName, glossary).found
      : false;
    return {
      inciName: correction.inciName,
      source: 'correction',
      notes: correction.notes,
      cosingValidated,
    };
  }

  if (fnwlInci) {
    const { inciName, cosingValidated } = canonicalizeInci(fnwlInci, glossary);
    return { inciName, source: 'fnwl', cosingValidated };
  }

  const byId = supplemental.byOilId[oilId];
  if (byId) {
    const { inciName, cosingValidated } = canonicalizeInci(byId.inciName, glossary);
    return {
      inciName,
      source: 'supplemental_id',
      notes: byId.notes,
      cosingValidated,
    };
  }

  if (fnwlProductId) {
    const byProduct = supplemental.byFnwlProductId[fnwlProductId.toLowerCase()];
    if (byProduct) {
      const { inciName, cosingValidated } = canonicalizeInci(byProduct.inciName, glossary);
      return {
        inciName,
        source: 'supplemental_product',
        notes: byProduct.notes,
        cosingValidated,
      };
    }
  }

  const displayKey = normalizeOilName(displayName);
  const hintInci = supplemental.displayHints[displayKey];
  if (hintInci) {
    const { inciName, cosingValidated } = canonicalizeInci(hintInci, glossary);
    return {
      inciName,
      source: 'display_hint',
      cosingValidated,
    };
  }

  return undefined;
}
