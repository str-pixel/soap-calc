import { describe, expect, it } from 'vitest';
import { isSpecialtyPickerOil, searchOils } from './oils';

describe('isSpecialtyPickerOil', () => {
  it('marks free acids, wax, and tar as specialty', () => {
    expect(isSpecialtyPickerOil({ category: 'free_acid' })).toBe(true);
    expect(isSpecialtyPickerOil({ category: 'wax' })).toBe(true);
    expect(isSpecialtyPickerOil({ category: 'tar' })).toBe(true);
    expect(isSpecialtyPickerOil({ category: 'triglyceride' })).toBe(false);
    expect(isSpecialtyPickerOil({ category: 'wax_ester' })).toBe(false);
  });
});

describe('searchOils', () => {
  it('hides specialty ingredients from empty-query browse by default', () => {
    const browse = searchOils('');
    expect(browse.some((oil) => oil.id === 'lauric-acid')).toBe(false);
    expect(browse.some((oil) => oil.id === 'olive-oil')).toBe(true);
  });

  it('includes specialty ingredients when browsing with includeSpecialty', () => {
    const browse = searchOils('', undefined, { includeSpecialty: true });
    expect(browse.some((oil) => oil.id === 'lauric-acid')).toBe(true);
  });

  it('finds specialty ingredients when the user searches explicitly', () => {
    const hits = searchOils('lauric acid');
    expect(hits.some((oil) => oil.id === 'lauric-acid')).toBe(true);
  });
});
