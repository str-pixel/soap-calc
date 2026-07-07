import { describe, expect, it } from 'vitest';
import { formatInciSubtitle, oilPickerTag } from './oilDisplay';

describe('formatInciSubtitle', () => {
  it('removes redundant common name from INCI parentheses', () => {
    expect(
      formatInciSubtitle(
        'Sunflower Oil',
        'Helianthus Annuus (Sunflower) Seed Oil',
      ),
    ).toBe('Helianthus Annuus Seed Oil');
  });

  it('hides subtitle when INCI only repeats the display name', () => {
    expect(formatInciSubtitle('Tallow Beef', 'Tallow')).toBe('');
  });

  it('keeps INCI visible for free fatty acids when names match', () => {
    expect(formatInciSubtitle('Oleic Acid', 'Oleic Acid', { category: 'free_acid' })).toBe(
      'Oleic Acid',
    );
  });
});

describe('oilPickerTag', () => {
  it('returns animal type for tallow variants', () => {
    expect(
      oilPickerTag({ displayName: 'Tallow Bear', category: 'triglyceride' }),
    ).toBe('Bear');
  });

  it('returns category for non-triglyceride oils', () => {
    expect(oilPickerTag({ displayName: 'Beeswax', category: 'wax' })).toBe('Wax');
    expect(oilPickerTag({ displayName: 'Lauric Acid', category: 'free_acid' })).toBe('Fatty acid');
  });
});
