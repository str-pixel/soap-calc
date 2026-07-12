import { describe, expect, it } from 'vitest';
import { resolveOilInci, type SupplementalInciDatabase } from './resolve-inci.js';
import { normalizeInciName } from './normalize-inci.js';
import type { CosingGlossaryIndex } from './cosing-glossary.js';

const supplemental: SupplementalInciDatabase = {
  byOilId: {
    'tallow-beef': {
      inciName: 'Tallow',
      source: 'manual',
      notes: 'CosIng #92469',
    },
  },
  byFnwlProductId: {
    canolaoil: {
      inciName: 'Brassica Napus (Rapeseed) Seed Oil',
      source: 'fnwl_product',
    },
  },
  displayHints: {},
  inciCorrections: {
    'palm-kernel-oil': {
      inciName: 'Elaeis Guineensis (Palm) Kernel Oil',
      source: 'cosing',
      notes: 'Corrects malformed FNWL value',
    },
  },
};

/** Glossary containing FNWL-style variants of the corrected name — both the malformed
 * original and a casing variant. A correction must survive both. */
function glossaryWith(...names: string[]): CosingGlossaryIndex {
  return {
    generatedAt: '2026-01-01T00:00:00.000Z',
    source: 'test',
    note: 'test fixture',
    referenceUrl: 'https://example.invalid',
    inciNames: names,
    normalizedIndex: Object.fromEntries(names.map((n) => [normalizeInciName(n), n])),
  };
}

describe('resolveOilInci', () => {
  it('applies an INCI correction over the FNWL chart value', () => {
    const resolved = resolveOilInci({
      oilId: 'palm-kernel-oil',
      displayName: 'Palm Kernel Oil',
      fnwlInci: 'Elaeis guineensis Palm kernel oil',
      supplemental,
      glossary: null,
    });
    expect(resolved?.source).toBe('correction');
    expect(resolved?.inciName).toBe('Elaeis Guineensis (Palm) Kernel Oil');
  });

  it('never lets the glossary rewrite a correction, even on a normalized-key collision', () => {
    const resolved = resolveOilInci({
      oilId: 'palm-kernel-oil',
      displayName: 'Palm Kernel Oil',
      fnwlInci: 'Elaeis guineensis Palm kernel oil',
      supplemental,
      // Same normalized key as the correction, but FNWL's lowercase-species casing:
      // pre-fix, canonicalizeInci would return this variant instead of the correction.
      glossary: glossaryWith('Elaeis guineensis (Palm) Kernel Oil'),
    });
    expect(resolved?.inciName).toBe('Elaeis Guineensis (Palm) Kernel Oil');
    expect(resolved?.cosingValidated).toBe(true);
  });

  it('reports cosingValidated=false for a correction absent from the glossary', () => {
    const resolved = resolveOilInci({
      oilId: 'palm-kernel-oil',
      displayName: 'Palm Kernel Oil',
      supplemental,
      glossary: glossaryWith('Cocos Nucifera (Coconut) Oil'),
    });
    expect(resolved?.inciName).toBe('Elaeis Guineensis (Palm) Kernel Oil');
    expect(resolved?.cosingValidated).toBe(false);
  });

  it('prefers FNWL product INCI over supplemental', () => {
    const resolved = resolveOilInci({
      oilId: 'sunflower-oil',
      displayName: 'Sunflower Oil',
      fnwlProductId: 'SUNFLOWER',
      fnwlInci: 'Helianthus Annuus (Sunflower) Seed Oil',
      supplemental,
      glossary: null,
    });
    expect(resolved?.source).toBe('fnwl');
    expect(resolved?.inciName).toContain('Helianthus');
  });

  it('uses supplemental product map when FNWL INCI row is missing', () => {
    const resolved = resolveOilInci({
      oilId: 'canola-oil',
      displayName: 'Canola Oil',
      fnwlProductId: 'CANOLAOIL',
      supplemental,
      glossary: null,
    });
    expect(resolved?.source).toBe('supplemental_product');
    expect(resolved?.inciName).toBe('Brassica Napus (Rapeseed) Seed Oil');
  });

  it('uses supplemental oil id map for legacy-only tallows', () => {
    const resolved = resolveOilInci({
      oilId: 'tallow-beef',
      displayName: 'Tallow Beef',
      supplemental,
      glossary: null,
    });
    expect(resolved?.source).toBe('supplemental_id');
    expect(resolved?.inciName).toBe('Tallow');
  });
});
