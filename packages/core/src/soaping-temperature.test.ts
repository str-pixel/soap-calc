import { describe, expect, it } from 'vitest';
import {
  cToF,
  CP_OVERFLOW_RISK_F,
  CP_SOAPING_TEMP_BANDS,
  fToC,
  soapingTempBand,
} from './soaping-temperature.js';

describe('CP soaping-temperature bands', () => {
  it('carries the four source bands, highest first', () => {
    expect(CP_SOAPING_TEMP_BANDS.map((b) => [b.lowF, b.highF, b.effect])).toEqual([
      [140, 160, 'accelerated'],
      [120, 130, 'average'],
      [80, 100, 'slowed'],
      [64, 86, 'slowed'],
    ]);
    for (const band of CP_SOAPING_TEMP_BANDS) expect(band.note.length).toBeGreaterThan(0);
  });

  it('resolves by threshold and is total — overlaps and both open ends included', () => {
    expect(soapingTempBand(130).effect).toBe('average'); // in 120–130
    expect(soapingTempBand(100).effect).toBe('slowed'); // overlap zone → the 80–100 band
    expect(soapingTempBand(100)).toBe(CP_SOAPING_TEMP_BANDS[2]);
    expect(soapingTempBand(165)).toBe(CP_SOAPING_TEMP_BANDS[0]); // above every high — still accelerated
    expect(soapingTempBand(55)).toBe(CP_SOAPING_TEMP_BANDS[3]); // "or lower" — bottom band catches it
    expect(soapingTempBand(90)).toBe(CP_SOAPING_TEMP_BANDS[2]); // 86–100 overlap → higher band
  });

  it('pins the overflow threshold at 160 °F', () => {
    expect(CP_OVERFLOW_RISK_F).toBe(160);
  });

  it('converts °F to rounded °C', () => {
    expect(fToC(125)).toBe(52);
    expect(fToC(215)).toBe(102);
    expect(fToC(32)).toBe(0);
    expect(fToC(160)).toBe(71);
  });

  it('converts °C to °F and round-trips stably at 1 °C steps', () => {
    expect(cToF(52)).toBe(126);
    expect(cToF(0)).toBe(32);
    expect(cToF(102)).toBe(216);
    // Round-trip stability is what lets the UI edit in °C over °F storage.
    for (let c = 10; c <= 120; c++) expect(fToC(cToF(c))).toBe(c);
  });
});
