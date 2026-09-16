import { describe, expect, it } from 'vitest';
import * as core from './index.js';
import {
  LS_SOAP_QUALITY_FATTY_ACIDS,
  LS_SOAP_QUALITY_LABELS,
  LS_SOAP_QUALITY_ORDER,
  lsSoapQualities,
} from './ls-qualities.js';

// The liquid soap book's quality table (LS:5261-5303, p148) defines four qualities as sums of
// fatty acids: Body/Lather Stability = stearic + palmitic; Cleansing = myristic + lauric;
// Conditioning = oleic + linoleic + linolenic; Lather = ricinoleic + lauric + myristic. Decided
// 2026-09-14: follow that table exactly (castor's ricinoleic counts in lather, not conditioning),
// over the book's eight acids only.
describe('liquid soap qualities', () => {
  it('sum exactly the acids the table names, in the table order', () => {
    expect(LS_SOAP_QUALITY_ORDER).toEqual(['bodyLatherStability', 'cleansing', 'conditioning', 'lather']);
    expect(LS_SOAP_QUALITY_FATTY_ACIDS).toEqual({
      bodyLatherStability: ['stearic', 'palmitic'],
      cleansing: ['myristic', 'lauric'],
      conditioning: ['oleic', 'linoleic', 'linolenic'],
      lather: ['ricinoleic', 'lauric', 'myristic'],
    });
    expect(Object.keys(LS_SOAP_QUALITY_LABELS).sort()).toEqual([...LS_SOAP_QUALITY_ORDER].sort());
  });

  it('count only those acids: C8/C10, other monounsaturates and long-chain saturates stay out', () => {
    const q = lsSoapQualities({
      lauric: 45, myristic: 18, palmitic: 9, stearic: 3, oleic: 7, linoleic: 2, linolenic: 0.5,
      ricinoleic: 20, caprylic: 8, capric: 7, palmitoleic: 1, erucic: 2, behenic: 1, elaidic: 1,
    });
    expect(q.bodyLatherStability).toBeCloseTo(12, 10);
    expect(q.cleansing).toBeCloseTo(63, 10);
    expect(q.conditioning).toBeCloseTo(9.5, 10);
    expect(q.lather).toBeCloseTo(83, 10);
  });

  it('read a missing acid as zero', () => {
    expect(lsSoapQualities({})).toEqual({ bodyLatherStability: 0, cleansing: 0, conditioning: 0, lather: 0 });
  });

  it('are exported from the core entry point', () => {
    expect(core.lsSoapQualities).toBe(lsSoapQualities);
  });
});
