import { describe, expect, it } from 'vitest';
import { OIL_LOOKUP, PROPERTIES_LOOKUP, oilById, searchOils } from './oils';

describe('searchOils', () => {
  it('includes all ingredients when browsing with an empty query', () => {
    const browse = searchOils('');
    expect(browse.some((oil) => oil.id === 'lauric-acid')).toBe(true);
    expect(browse.some((oil) => oil.id === 'olive-oil')).toBe(true);
  });

  it('finds ingredients by display name, id, alias, or INCI', () => {
    expect(searchOils('lauric acid').some((oil) => oil.id === 'lauric-acid')).toBe(true);
    expect(searchOils('helianthus').length).toBeGreaterThan(0);
  });

  it('does not surface high-erucic rapeseed under a "canola" search (renamed id)', () => {
    const ids = searchOils('canola').map((o) => o.id);
    expect(ids).toContain('canola-oil');
    expect(ids).not.toContain('rapeseed-oil-high-erucic');
    expect(ids).not.toContain('rapeseed-oil-canola');
  });
});

describe('oilById', () => {
  it('resolves a renamed oil by its old id (recipe migration shim)', () => {
    // A recipe saved before the rename references the old id.
    const migrated = oilById('rapeseed-oil-canola');
    expect(migrated?.id).toBe('rapeseed-oil-high-erucic');
  });

  it('returns undefined for a genuinely unknown id', () => {
    expect(oilById('not-a-real-oil')).toBeUndefined();
  });
});

describe('oil-id migration coverage', () => {
  it('resolves a renamed oil old id in the lye/property lookups the calc reads directly', () => {
    // The core lye/fatty-acid calc indexes these maps with the recipe line's oilId, bypassing
    // oilById — so a recipe saved with the old id must resolve here too, not just in oilById.
    expect(OIL_LOOKUP['rapeseed-oil-canola']?.id).toBe('rapeseed-oil-high-erucic');
    expect(PROPERTIES_LOOKUP['rapeseed-oil-canola']?.id).toBe('rapeseed-oil-high-erucic');
  });

  it('resolves a deduped oil old id to the surviving duplicate (flax/linseed merge)', () => {
    expect(oilById('linseed-oil-flax')?.id).toBe('flax-oil-linseed');
    expect(OIL_LOOKUP['linseed-oil-flax']?.id).toBe('flax-oil-linseed');
  });
});
