import { describe, expect, it } from 'vitest';
import { estimateGelPhase } from './gel-phase.js';

describe('estimateGelPhase — the six-row decision table', () => {
  const at = (soapingTempF: number, waterLyeRatio: number) =>
    estimateGelPhase({ soapingTempF, waterLyeRatio });

  it('a true 1:1 solution is ruled out at any slider temperature', () => {
    expect(at(150, 1.1).likelihood).toBe('ruled_out');
    expect(at(125, 1.0).likelihood).toBe('ruled_out');
  });

  it('below 80 °F the risk is eliminated regardless of water', () => {
    expect(at(79, 3).likelihood).toBe('ruled_out');
  });

  it('below 100 °F gel is unlikely even at high water', () => {
    expect(at(95, 3).likelihood).toBe('unlikely');
  });

  it('100–119 °F is the partial-gel zone at high water only', () => {
    expect(at(110, 2.5).likelihood).toBe('possible');
    expect(at(110, 1.8).likelihood).toBe('unlikely');
  });

  it('120–139 °F: high water gels, 2:1 or less avoids it', () => {
    expect(at(125, 2.4).likelihood).toBe('likely');
    expect(at(125, 2.0).likelihood).toBe('unlikely');
  });

  it('140+ °F gels unless the water is 1:1 (caught above)', () => {
    expect(at(150, 1.5).likelihood).toBe('likely');
  });

  it('every likelihood carries a note; the partial-gel note names the ring', () => {
    expect(at(110, 2.5).note.toLowerCase()).toContain('ring');
    for (const [t, r] of [[150, 1.1], [79, 3], [95, 3], [125, 2.4]] as const) {
      expect(at(t, r).note.length).toBeGreaterThan(0);
    }
  });
});
