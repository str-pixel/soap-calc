import { describe, expect, it } from 'vitest';
import { buildSlugByEmittedId, OIL_ID_OVERRIDES } from './oil-id-overrides.js';

describe('buildSlugByEmittedId', () => {
  it('resolves a RENAME back to the slug the build used', () => {
    // 'rapeseed-oil-canola' is still the build slug; only the emitted id changed.
    const map = buildSlugByEmittedId(['linseed-oil-flax']);
    expect(map.get('rapeseed-oil-high-erucic')).toBe('rapeseed-oil-canola');
  });

  it('leaves a DEDUP-MERGE survivor alone — it is built under its own slug', () => {
    // 'linseed-oil-flax' is EXCLUDED and never built; 'flax-oil-linseed' is a separate oil
    // built under its own baseSlug. Inverting that entry wholesale pointed the survivor at
    // the excluded slug, so every slug-keyed correction for it was looked up under a key
    // the build never uses — the assertion silently stops asserting.
    const map = buildSlugByEmittedId(['linseed-oil-flax']);
    expect(map.get('flax-oil-linseed')).toBeUndefined();
  });

  it('covers every override entry as either a rename or an excluded merge', () => {
    const excluded = ['linseed-oil-flax'];
    const map = buildSlugByEmittedId(excluded);
    for (const [slug, id] of Object.entries(OIL_ID_OVERRIDES)) {
      expect(map.get(id) ?? slug).toBe(slug);
    }
  });
});
