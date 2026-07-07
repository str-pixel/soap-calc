import { describe, expect, it } from 'vitest';
import { resolveOilInci, type SupplementalInciDatabase } from './resolve-inci.js';

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
};

describe('resolveOilInci', () => {
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
