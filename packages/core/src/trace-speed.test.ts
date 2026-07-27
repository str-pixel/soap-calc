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

describe('soaping-temperature term (CP calibration, 2026-07-27)', () => {
  const FA = { palmitic: 20, stearic: 10, oleic: 30, linoleic: 10 };
  const at = (soapingTempF?: number) =>
    estimateTraceSpeed({ fattyAcids: FA, hasAcceleratingAdditive: false, soapingTempF })!;

  it('omitting the argument leaves the score exactly as before (regression pin)', () => {
    // 30 saturated − 40 soft = −10 with no temp term.
    expect(at(undefined).score).toBe(-10);
    expect(at(undefined).drivers).not.toContain('warm soaping temperature');
  });

  it('the average band (120–130) is neutral', () => {
    expect(at(125).score).toBe(at(undefined).score);
    expect(at(125).drivers).toEqual(at(undefined).drivers);
  });

  it('warm soaping (>=140) adds 15 and names the driver', () => {
    expect(at(150).score).toBe(at(125).score + 15);
    expect(at(150).drivers).toContain('warm soaping temperature');
  });

  it('cool soaping steps down: −7 at 100–119 (no driver), −15 at 80–99, −20 below 80', () => {
    expect(at(110).score).toBe(at(125).score - 7);
    expect(at(110).drivers).not.toContain('cool soaping temperature');
    expect(at(90).score).toBe(at(125).score - 15);
    expect(at(90).drivers).toContain('cool soaping temperature');
    expect(at(70).score).toBe(at(125).score - 20);
    expect(at(70).drivers).toContain('cool soaping temperature');
  });
});
