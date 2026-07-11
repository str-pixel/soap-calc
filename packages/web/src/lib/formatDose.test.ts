import { describe, expect, it } from 'vitest';
import { formatDose } from './formatDose';

describe('formatDose', () => {
  it('formats the four basis/unit combinations', () => {
    expect(formatDose(5, 'percent', 'oil')).toBe('5% of oil');
    expect(formatDose(1, 'percent', 'batch')).toBe('1% of batch');
    expect(formatDose(3, 'ppt', 'oil')).toBe('3 ppt of oil');
    expect(formatDose(2, 'ppt', 'batch')).toBe('2 ppt of batch');
  });
  it('rounds to one decimal like the rest of the UI', () => {
    expect(formatDose(0.25, 'percent', 'oil')).toBe('0.3% of oil');
  });
});
