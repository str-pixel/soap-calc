import { describe, expect, it } from 'vitest';
import { searchOils } from './oils';

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
});
