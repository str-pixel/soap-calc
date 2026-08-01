import { describe, expect, it } from 'vitest';
import { ls30MinPackagePresent } from './ls30Min';

const add = (catalogId: string, grams = 10) => ({ catalogId, name: catalogId, grams });

describe('ls30MinPackagePresent', () => {
  it('needs glycerin AND (salt OR sodium lactate); sugar never gates', () => {
    expect(ls30MinPackagePresent({ lsGlycerinPresent: true, additives: [add('salt')] })).toBe(true);
    expect(
      ls30MinPackagePresent({ lsGlycerinPresent: true, additives: [add('sodium-lactate')] }),
    ).toBe(true);
    expect(ls30MinPackagePresent({ lsGlycerinPresent: true, additives: [] })).toBe(false);
    expect(ls30MinPackagePresent({ lsGlycerinPresent: false, additives: [add('salt')] })).toBe(false);
    expect(
      ls30MinPackagePresent({ lsGlycerinPresent: false, additives: [add('sugar-sorbitol')] }),
    ).toBe(false);
  });
  it('ignores zero-gram lines', () => {
    expect(ls30MinPackagePresent({ lsGlycerinPresent: true, additives: [add('salt', 0)] })).toBe(false);
  });
});
