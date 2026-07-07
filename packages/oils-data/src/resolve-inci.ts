import { readFileSync } from 'node:fs';
import type { CosingGlossaryIndex } from './cosing-glossary.js';
import { lookupInciInGlossary } from './cosing-glossary.js';
import { normalizeOilName } from './normalize.js';
import { isPlausibleInciName } from './normalize-inci.js';
import { z } from 'zod';

export const SupplementalInciEntry = z.object({
  inciName: z.string().min(1),
  source: z.enum(['manual', 'cosing', 'fnwl_product']),
  notes: z.string().optional(),
});

export type SupplementalInciEntry = z.infer<typeof SupplementalInciEntry>;

export const SupplementalInciDatabase = z.object({
  byOilId: z.record(SupplementalInciEntry).default({}),
  byFnwlProductId: z.record(SupplementalInciEntry).default({}),
  /** Normalized display-name keys → INCI (validated against CosIng glossary when available). */
  displayHints: z.record(z.string()).default({}),
});

export type SupplementalInciDatabase = z.infer<typeof SupplementalInciDatabase>;

export type ResolvedInci = {
  inciName: string;
  source: 'fnwl' | 'supplemental_id' | 'supplemental_product' | 'display_hint' | 'glossary';
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
