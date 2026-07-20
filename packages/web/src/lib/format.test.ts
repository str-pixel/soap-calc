import { describe, expect, it, vi, afterEach } from 'vitest';
import { formatGrams } from './format';

afterEach(() => vi.restoreAllMocks());

describe('formatGrams', () => {
  it('formats with grouping and one decimal by default', () => {
    expect(formatGrams(1234.56)).toBe('1,234.6');
  });
  // The output must not float with the browser locale: sibling formatters
  // (formatWeight, formatMoney) pin en-US, and one printed sheet must not mix
  // "1.234,5" and "1,234.5". Environment locale can't be varied per-test, so we
  // pin the contract at the call boundary.
  it('pins the en-US locale like its sibling formatters', () => {
    const spy = vi.spyOn(Number.prototype, 'toLocaleString');
    formatGrams(1234.5);
    expect(spy).toHaveBeenCalledWith('en-US', expect.anything());
  });
});
