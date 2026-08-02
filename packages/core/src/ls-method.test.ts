import { describe, expect, it } from 'vitest';
import {
  LS_METHOD_STAGES,
  LS_TEMP_DEFAULT_F,
  LS_TEMP_MAX_F,
  LS_TEMP_MIN_F,
  LS_ZONES,
  lsMethodForTemp,
} from './ls-method.js';

describe('lsMethodForTemp', () => {
  it('maps each zone with >=/< edge semantics (spec zone table)', () => {
    expect(lsMethodForTemp(60).method).toBe('cold');
    expect(lsMethodForTemp(99).method).toBe('cold');
    // 100 belongs to the region above it (gap owned by low temp).
    expect(lsMethodForTemp(100)).toMatchObject({ method: 'lowtemp', inGap: true });
    expect(lsMethodForTemp(119)).toMatchObject({ method: 'lowtemp', inGap: true });
    expect(lsMethodForTemp(120)).toMatchObject({ method: 'lowtemp', inGap: false });
    expect(lsMethodForTemp(159)).toMatchObject({ method: 'lowtemp', inGap: false });
    // 160 falls in the gap OWNED BY HIGH TEMP (explicit ownership, no nearest-zone rule).
    expect(lsMethodForTemp(160)).toMatchObject({ method: 'hightemp', inGap: true });
    expect(lsMethodForTemp(180)).toMatchObject({ method: 'hightemp', inGap: true });
    expect(lsMethodForTemp(214)).toMatchObject({ method: 'hightemp', inGap: true });
    expect(lsMethodForTemp(215)).toMatchObject({ method: 'hightemp', inGap: false });
    expect(lsMethodForTemp(220)).toMatchObject({ method: 'hightemp', inGap: false });
  });

  it('is total: clamps out-of-range and falls back to the default on junk', () => {
    expect(lsMethodForTemp(-40).method).toBe('cold');
    expect(lsMethodForTemp(400).method).toBe('hightemp');
    expect(lsMethodForTemp(Number.NaN).method).toBe(lsMethodForTemp(LS_TEMP_DEFAULT_F).method);
  });

  it('labels the three methods and notes only the gaps', () => {
    expect(lsMethodForTemp(80).label).toBe('Cold-process LS');
    expect(lsMethodForTemp(150).label).toBe('Low-temp LS');
    expect(lsMethodForTemp(215).label).toBe('High-temp LS');
    expect(lsMethodForTemp(150).note).toBeNull();
    expect(lsMethodForTemp(110).note).toMatch(/below the low-temp band/i);
    // The 160–215 gap copy is first-class: names the method and the 215 start.
    expect(lsMethodForTemp(180).label).toBe('High-temp LS');
    expect(lsMethodForTemp(180).note).toMatch(/below its 102 °C \(215 °F\) start/);
    expect(lsMethodForTemp(180).note).toMatch(/slower/i);
  });

  it('carries the per-method sequester window (cold 1–4, low open-ended, high 1–2)', () => {
    expect(lsMethodForTemp(80).sequester).toEqual({ minWeeks: 1, maxWeeks: 4 });
    expect(lsMethodForTemp(150).sequester).toEqual({ minWeeks: 1 });
    expect(lsMethodForTemp(216).sequester).toEqual({ minWeeks: 1, maxWeeks: 2 });
    // Gap temps inherit their OWNER's window.
    expect(lsMethodForTemp(180).sequester).toEqual({ minWeeks: 1, maxWeeks: 2 });
  });

  it('exposes the slider constants and zone edges', () => {
    expect([LS_TEMP_MIN_F, LS_TEMP_MAX_F, LS_TEMP_DEFAULT_F]).toEqual([60, 220, 150]);
    expect(LS_ZONES).toEqual({ coldMaxF: 100, lowMinF: 120, lowRecommendedMinF: 140, lowMaxF: 160, highMinF: 215 });
  });

  it('ships guide stages per method, with the mandatory vessel line on high temp', () => {
    for (const method of ['cold', 'lowtemp', 'hightemp'] as const) {
      expect(LS_METHOD_STAGES[method].length).toBeGreaterThanOrEqual(4);
    }
    expect(LS_METHOD_STAGES.cold.join(' ')).toMatch(/clarity test/i);
    expect(LS_METHOD_STAGES.hightemp.join(' ')).toMatch(/2× the total recipe volume/);
  });

  it('cold dilutes without external heat — room-temperature or warm water, never hot', () => {
    // The source's CPLS dilution step is explicit: room temperature or warm water, no
    // additional external heat. "Hot" is the LTLS/HTLS instruction; a prior revision
    // wrongly carried it into the cold steps.
    const coldText = LS_METHOD_STAGES.cold.join(' ');
    expect(coldText).toMatch(/room-temperature or warm/i);
    expect(coldText).not.toMatch(/hot distilled water/i);
    // The heated methods keep their sourced hot-water dilution.
    expect(LS_METHOD_STAGES.lowtemp.join(' ')).toMatch(/hot distilled water/i);
  });

  it('returns an identity-stable result across calls within the same zone (React memo safety)', () => {
    // Only 5 possible outputs (cold, low-gap, low, high-gap, high) — frozen module-level
    // constants so a consumer's React.memo/useMemo keyed on this object never bursts just
    // because the user nudged the slider within a zone.
    expect(lsMethodForTemp(150)).toBe(lsMethodForTemp(155));
    expect(lsMethodForTemp(216)).toBe(lsMethodForTemp(220));
  });

  it('exposes a structured hold field for the panels to format themselves', () => {
    expect(lsMethodForTemp(80).hold).toBeNull();
    expect(lsMethodForTemp(150).hold).toEqual({
      lowF: LS_ZONES.lowMinF,
      highF: LS_ZONES.lowMaxF,
      recommendedLowF: LS_ZONES.lowRecommendedMinF,
    });
    expect(lsMethodForTemp(110).hold).toEqual({
      lowF: LS_ZONES.lowMinF,
      highF: LS_ZONES.lowMaxF,
      recommendedLowF: LS_ZONES.lowRecommendedMinF,
    });
    expect(lsMethodForTemp(215).hold).toEqual({
      lowF: LS_ZONES.highMinF,
      highF: LS_ZONES.highMinF,
      ceilingF: LS_TEMP_MAX_F,
    });
    expect(lsMethodForTemp(180).hold).toEqual({
      lowF: LS_ZONES.highMinF,
      highF: LS_ZONES.highMinF,
      ceilingF: LS_TEMP_MAX_F,
    });
  });
});
