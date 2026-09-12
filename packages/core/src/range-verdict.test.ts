import { describe, expect, it } from 'vitest';
import { displayedValue, rangeVerdict } from './range-verdict.js';
import { formatPropertyScore, formatSoapPropertyPercent } from './property-display.js';

describe('displayedValue', () => {
  it('rounds to the precision the UI prints', () => {
    expect(displayedValue(22.4, 0)).toBe(22);
    expect(displayedValue(11.6, 0)).toBe(12);
    expect(displayedValue(22.04, 1)).toBe(22);
    expect(displayedValue(22.06, 1)).toBe(22.1);
  });

  it('agrees with the formatters that print these numbers', () => {
    for (const v of [0, 0.04, 0.5, 11.6, 22.4, 47.34, 99.5]) {
      expect(formatPropertyScore(v)).toBe(String(displayedValue(v, 0)));
      expect(formatSoapPropertyPercent(v)).toBe(`${displayedValue(v, 1)}%`);
    }
  });
});

describe('rangeVerdict', () => {
  it('judges the number the UI prints, not the raw one', () => {
    // THE BUG THIS EXISTS FOR: 22.4 prints "22" against a band ending at 22. Judged raw it
    // read "Too high" beside a figure that is plainly inside the range it names. The bands
    // here are the helper's own fixtures, not the shipped guide, which this does not import.
    expect(rangeVerdict(22.4, 12, 22, 0)).toBe('in');
    expect(rangeVerdict(11.6, 12, 22, 0)).toBe('in');
    // A score that still rounds outside the band is still flagged.
    expect(rangeVerdict(22.5, 12, 22, 0)).toBe('high');
    expect(rangeVerdict(11.4, 12, 22, 0)).toBe('low');
  });

  it('judges plainly inside and plainly outside values', () => {
    expect(rangeVerdict(17, 12, 22, 0)).toBe('in');
    expect(rangeVerdict(12, 12, 22, 0)).toBe('in');
    expect(rangeVerdict(22, 12, 22, 0)).toBe('in');
    expect(rangeVerdict(0, 12, 22, 0)).toBe('low');
    expect(rangeVerdict(100, 12, 22, 0)).toBe('high');
  });

  it('honours the display precision it is given', () => {
    // The fatty-acid panel prints one decimal, so its window is ten times narrower.
    expect(rangeVerdict(22.04, 20, 22, 1)).toBe('in');
    expect(rangeVerdict(22.06, 20, 22, 1)).toBe('high');
    // The same value, judged at integer precision, rounds into the band.
    expect(rangeVerdict(22.4, 20, 22, 0)).toBe('in');
  });

  it('never disagrees with the printed figure, across the whole scale', () => {
    const bands: Array<[number, number]> = [[12, 22], [29, 54], [0, 2], [0, 1], [32, 41]];
    for (const [low, high] of bands) {
      for (let raw = 0; raw <= 100; raw += 0.05) {
        for (const digits of [0, 1] as const) {
          const shown = displayedValue(raw, digits);
          const verdict = rangeVerdict(raw, low, high, digits);
          // The invariant: what the verdict claims is exactly what the printed number shows.
          if (verdict === 'in') expect(shown >= low && shown <= high).toBe(true);
          if (verdict === 'low') expect(shown < low).toBe(true);
          if (verdict === 'high') expect(shown > high).toBe(true);
        }
      }
    }
  });
});
