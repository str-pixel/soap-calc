import { describe, expect, it } from 'vitest';
import {
  formatPropertyScore,
  formatPropertyScoreRange,
  formatSoapPropertyPercent,
} from './property-display.js';

describe('formatPropertyScore', () => {
  it('rounds to a whole number with no unit', () => {
    expect(formatPropertyScore(40.9)).toBe('41');
    expect(formatPropertyScore(16.8)).toBe('17');
    expect(formatPropertyScore(0)).toBe('0');
  });
});

describe('formatPropertyScoreRange', () => {
  it('formats a range with an en dash and no unit', () => {
    expect(formatPropertyScoreRange(29, 54)).toBe('29–54');
  });
});

describe('formatSoapPropertyPercent (unchanged)', () => {
  it('still appends %', () => {
    expect(formatSoapPropertyPercent(16.8)).toBe('16.8%');
  });
});
