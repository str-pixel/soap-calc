import { describe, expect, it } from 'vitest';
import { ls30MinPackagePresent } from './ls30Min';

const add = (catalogId: string, grams = 10, name = catalogId) => ({ catalogId, name, grams });

describe('ls30MinPackagePresent', () => {
  it('needs solvent-scale glycerin (>= 1x lye) AND (salt OR sodium lactate)', () => {
    expect(
      ls30MinPackagePresent({ glycerinGrams: 200, lyeGrams: 150, additives: [add('salt')] }),
    ).toBe(true);
    expect(
      ls30MinPackagePresent({
        glycerinGrams: 200,
        lyeGrams: 150,
        additives: [add('sodium-lactate')],
      }),
    ).toBe(true);
  });

  it('rejects a token glycerin dose below the 1x-lye solvent floor', () => {
    expect(
      ls30MinPackagePresent({ glycerinGrams: 10, lyeGrams: 150, additives: [add('salt')] }),
    ).toBe(false);
  });

  it('excludes magnesium-bearing salts (Epsom, Dead Sea) — sodium salts only', () => {
    expect(
      ls30MinPackagePresent({
        glycerinGrams: 200,
        lyeGrams: 150,
        additives: [add('', 10, 'Epsom salt')],
      }),
    ).toBe(false);
    expect(
      ls30MinPackagePresent({
        glycerinGrams: 200,
        lyeGrams: 150,
        additives: [add('', 10, 'Dead Sea salt')],
      }),
    ).toBe(false);
  });

  it('sodium lactate alone still completes the package', () => {
    expect(
      ls30MinPackagePresent({
        glycerinGrams: 200,
        lyeGrams: 150,
        additives: [add('sodium-lactate')],
      }),
    ).toBe(true);
  });

  it('lye 0 (no lye yet) is always false', () => {
    expect(
      ls30MinPackagePresent({ glycerinGrams: 200, lyeGrams: 0, additives: [add('salt')] }),
    ).toBe(false);
  });

  it('ignores a zero-gram salt line', () => {
    expect(
      ls30MinPackagePresent({ glycerinGrams: 200, lyeGrams: 150, additives: [add('salt', 0)] }),
    ).toBe(false);
  });

  it('no glycerin at all is false even with salt', () => {
    expect(
      ls30MinPackagePresent({ glycerinGrams: 0, lyeGrams: 150, additives: [add('salt')] }),
    ).toBe(false);
  });

  it('glycerin present but no sodium salt/lactate is false', () => {
    expect(ls30MinPackagePresent({ glycerinGrams: 200, lyeGrams: 150, additives: [] })).toBe(
      false,
    );
  });
});
