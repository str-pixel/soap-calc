import { describe, expect, it } from 'vitest';
import { formatDose } from './formatDose';

describe('formatDose', () => {
  it('formats the four basis/unit combinations', () => {
    expect(formatDose(5, 'oil', 'percent')).toBe('5% of oil');
    expect(formatDose(1, 'batch', 'percent')).toBe('1% of batch');
    expect(formatDose(3, 'oil', 'ppt')).toBe('3 ppt of oil');
    expect(formatDose(2, 'batch', 'ppt')).toBe('2 ppt of batch');
  });
  it('rounds to one decimal like the rest of the UI', () => {
    expect(formatDose(0.25, 'oil', 'percent')).toBe('0.3% of oil');
  });
});
