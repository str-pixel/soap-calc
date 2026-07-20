import { describe, expect, it } from 'vitest';
import {
  formatWeight,
  isWeightUnit,
  gramsStringToInputDisplay,
  isCompleteNumericInput,
  parseInputDisplayToGrams,
  parsePercentInput,
} from './weightUnits';

describe('weightUnits', () => {
  it('round-trips grams through ounces with 0.1 g precision', () => {
    expect(gramsStringToInputDisplay('454', 'oz')).toBe('16');
    expect(parseInputDisplayToGrams('16', 'oz')).toBe('453.6');
  });

  it('oz display round-trips lossily, so no-op commits must be suppressed upstream', () => {
    // 450 g -> "15.9" oz -> 450.8 g: committing an unedited display value would drift weights.
    expect(parseInputDisplayToGrams(gramsStringToInputDisplay('450', 'oz'), 'oz')).toBe('450.8');
  });

  it('formats pounds with a stable locale', () => {
    expect(formatWeight(453.59237, 'lb')).toBe('1 lb');
  });

  it('treats incomplete decimal input as not committable', () => {
    expect(isCompleteNumericInput('16.')).toBe(false);
    expect(parseInputDisplayToGrams('16.', 'oz')).toBeNull();
  });

  it('rejects invalid numeric input on commit', () => {
    expect(parseInputDisplayToGrams('abc', 'oz')).toBeNull();
  });

  it('returns empty string for zero', () => {
    expect(parseInputDisplayToGrams('0', 'g')).toBe('');
  });

  it('validates percent input range', () => {
    expect(parsePercentInput('50')).toBe('50');
    expect(parsePercentInput('101')).toBeNull();
    expect(parsePercentInput('abc')).toBeNull();
    expect(parsePercentInput('36.')).toBeNull();
  });
});

describe('isWeightUnit hardening', () => {
  it('rejects prototype-chain keys', () => {
    expect(isWeightUnit('toString')).toBe(false);
    expect(isWeightUnit('__proto__')).toBe(false);
    expect(isWeightUnit('constructor')).toBe(false);
    expect(isWeightUnit('hasOwnProperty')).toBe(false);
  });
  it('still accepts real units', () => {
    for (const u of ['g', 'kg', 'oz', 'lb']) expect(isWeightUnit(u)).toBe(true);
  });
});
