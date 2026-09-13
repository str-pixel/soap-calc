import { describe, expect, it } from 'vitest';
import { isLowCoverage, LOW_COVERAGE_PERCENT } from './properties.js';

// Every panel prints coverage as a whole number ("based on 80% of recipe oils") and decided
// low coverage on that printed figure, while the insights compared the raw one. So between
// 79.5% and 80% a panel judged its readings under an "80%" caption while the insights treated
// the same recipe as an estimate. One helper now decides for every caller, on the printed
// figure.
describe('isLowCoverage', () => {
  it('decides on the whole-number percentage the panels print', () => {
    expect(isLowCoverage(79.4)).toBe(true); // prints "79%"
    expect(isLowCoverage(79.5)).toBe(false); // prints "80%"
    expect(isLowCoverage(79.9)).toBe(false);
    expect(isLowCoverage(LOW_COVERAGE_PERCENT)).toBe(false);
    expect(isLowCoverage(100)).toBe(false);
    expect(isLowCoverage(0)).toBe(true);
  });
});
