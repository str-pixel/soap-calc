import { describe, expect, it } from 'vitest';
import { estimateTraceSpeed } from './trace-speed';

describe('estimateTraceSpeed', () => {
  it('returns null when the fatty-acid profile is unknown', () => {
    expect(estimateTraceSpeed({ fattyAcids: null, hasAcceleratingAdditive: false })).toBeNull();
  });
  it('rates a hard, saturated, sugared recipe as fast', () => {
    const r = estimateTraceSpeed({
      fattyAcids: { palmitic: 30, stearic: 20, lauric: 20 },
      hasAcceleratingAdditive: true,
    });
    expect(r?.label).toBe('fast');
  });
  it('rates an olive-dominant recipe as slow', () => {
    const r = estimateTraceSpeed({
      fattyAcids: { oleic: 72, linoleic: 10 },
      hasAcceleratingAdditive: false,
    });
    expect(r?.label).toBe('slow');
  });
  it('rates a balanced recipe as moderate', () => {
    const r = estimateTraceSpeed({
      fattyAcids: { oleic: 35, palmitic: 20, stearic: 10, lauric: 15, linoleic: 10 },
      hasAcceleratingAdditive: false,
    });
    expect(r?.label).toBe('moderate');
  });
});
