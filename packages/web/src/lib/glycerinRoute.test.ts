import { describe, expect, it } from 'vitest';
import { isCookGlycerin } from './glycerinRoute';

describe('isCookGlycerin', () => {
  it('counts glycerin entered before or during the cook — it dissolves the alkali there', () => {
    for (const addAt of ['lye', 'oils', 'trace'] as const) {
      expect(isCookGlycerin({ catalogId: 'glycerin', addAt })).toBe(true);
    }
  });

  it('refuses glycerin stirred into finished soap — there is no paste left to dissolve', () => {
    // The gates that ask this question are about the cook: the 30-minute package's
    // solvent floor and the advisory that the batch may reach its consistency before the
    // dilution water is all in. Neither is true of an emollient added at the end.
    expect(isCookGlycerin({ catalogId: 'glycerin', addAt: 'after_cook' })).toBe(false);
  });

  it('refuses everything that is not glycerin', () => {
    expect(isCookGlycerin({ catalogId: 'sorbitol', addAt: 'lye' })).toBe(false);
    expect(isCookGlycerin({ addAt: 'lye' })).toBe(false);
  });
});
