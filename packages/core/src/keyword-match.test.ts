import { describe, expect, it } from 'vitest';
import { additiveMatches, recipeOilMatches, wordBoundaryMatch } from './keyword-match.js';

describe('keyword-match', () => {
  it('matches keywords on word boundaries only', () => {
    expect(wordBoundaryMatch('Golden jojoba oil', 'jojoba')).toBe(true);
    expect(wordBoundaryMatch('ojoba blend', 'jojoba')).toBe(false);
  });

  it('matches additives by catalog id or name', () => {
    expect(
      additiveMatches([{ catalogId: 'jojoba', name: 'Wax ester' }], 'jojoba', 'jojoba'),
    ).toBe(true);
    expect(
      additiveMatches([{ catalogId: '', name: 'Vanilla fragrance' }], 'jojoba', 'jojoba'),
    ).toBe(false);
  });

  it('ignores fragrance names for oatmeal and jojoba keyword matches', () => {
    expect(
      additiveMatches([{ catalogId: '', name: 'Oatmeal cookie fragrance' }], 'oatmeal', 'oatmeal'),
    ).toBe(false);
    expect(
      additiveMatches([{ catalogId: '', name: 'Jojoba essential oil blend' }], 'jojoba', 'jojoba'),
    ).toBe(false);
  });

  it('matches recipe oils by id or name', () => {
    expect(
      recipeOilMatches([{ oilId: 'jojoba-oil', name: 'Jojoba Oil' }], {
        oilIds: ['jojoba-oil'],
        nameKeyword: 'jojoba',
      }),
    ).toBe(true);
    expect(
      recipeOilMatches([{ oilId: 'olive-oil', name: 'Olive Oil' }], {
        nameKeyword: 'jojoba',
      }),
    ).toBe(false);
  });
});
