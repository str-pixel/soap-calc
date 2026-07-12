import { describe, expect, it } from 'vitest';
import { isInciCorrectionRedundant } from './inci-redundancy.js';

describe('isInciCorrectionRedundant', () => {
  it('flags an exact match as redundant', () => {
    expect(
      isInciCorrectionRedundant(
        'Carthamus Tinctorius (Safflower) Seed Oil',
        'Carthamus Tinctorius (Safflower) Seed Oil',
      ),
    ).toBe(true);
  });

  it('flags a case/whitespace-only difference as redundant', () => {
    // This is the bug: the FNWL chart has "caught up" to the correction, differing only
    // by case (and, here, doubled internal whitespace), but a raw `===` comparison misses it.
    expect(
      isInciCorrectionRedundant(
        'carthamus tinctorius  (safflower) seed oil',
        'Carthamus Tinctorius (Safflower) Seed Oil',
      ),
    ).toBe(true);
  });

  it('does not flag a genuinely different INCI name', () => {
    expect(
      isInciCorrectionRedundant(
        'Elaeis Guineensis Oil',
        'Elaeis Guineensis (Palm) Kernel Oil',
      ),
    ).toBe(false);
  });

  it('does not flag when the FNWL chart has no INCI value (undefined)', () => {
    expect(isInciCorrectionRedundant(undefined, 'Elaeis Guineensis (Palm) Kernel Oil')).toBe(
      false,
    );
  });

  it('does not flag when the FNWL chart INCI is an empty string', () => {
    expect(isInciCorrectionRedundant('', 'Elaeis Guineensis (Palm) Kernel Oil')).toBe(false);
  });
});
