import { describe, expect, it } from 'vitest';
import { SOAP_PROPERTY_GUIDE, SOAP_PROPERTY_FATTY_ACIDS } from './properties.js';
import { FORMULATION_PREFERENCE_GUIDE } from './formulation-guide.js';

/**
 * The shipped suggested ranges ARE the books' "Standard" column, transcribed. This test is
 * the transcription itself, so a future edit that drifts from the source fails here with the
 * page it contradicts rather than passing quietly.
 *
 * CP:11636-11703 — "Ultimate Guide to Cold Process Soap / Common Soap Quality Ranges", p404
 * HP:4637-4664  — "Ultimate Guide to Hot Process Soap / Average Soap Quality Ranges", p133
 * The two printings carry identical Standard and Preference columns.
 */
describe('SOAP_PROPERTY_GUIDE matches the books Standard column', () => {
  const STANDARD = {
    hardness: { low: 30, high: 60 },
    cleansing: { low: 8, high: 20 },
    condition: { low: 44, high: 69 },
    bubbly: { low: 14, high: 46 },
    creamy: { low: 16, high: 48 },
  } as const;

  for (const [key, band] of Object.entries(STANDARD)) {
    it(`${key} is ${band.low}-${band.high}`, () => {
      expect(SOAP_PROPERTY_GUIDE[key as keyof typeof STANDARD]).toEqual(band);
    });
  }

  it('keeps longevity on the calculator range, the one property the books do not list', () => {
    // Neither printing has a longevity row, so there is no Standard value to adopt. 25–50 is
    // the calculator's, corrected from an unsourced 14–43 in commit 7812bc1 (#44).
    expect(SOAP_PROPERTY_GUIDE.longevity).toEqual({ low: 25, high: 50 });
    expect(Object.keys(STANDARD)).not.toContain('longevity');
  });
});

describe('the preference band against the suggested band', () => {
  // Both columns now come from the SAME table, so the preference band finally sits inside
  // the suggested one — except creamy, where the book's own Preference high (50) exceeds its
  // own Standard high (48).
  //
  // That is authorial, not a transcription slip, and it was checked hard before being left
  // alone: both printings carry it identically, both pages are vector text with no image to
  // mis-OCR, the two independent extractions of those pages agree word for word, and the
  // per-word coordinates put "16 to 48" under the Standard heading and "30-50" under
  // Preference. The table is printed once per book, so there is no third copy to break the
  // tie, and no body text anywhere proposes a creamy target above 48. Leave it.
  it('sits inside the suggested band for every property except creamy', () => {
    const spills: string[] = [];
    for (const [key, pref] of Object.entries(FORMULATION_PREFERENCE_GUIDE)) {
      const guide = SOAP_PROPERTY_GUIDE[key as keyof typeof SOAP_PROPERTY_GUIDE];
      if (pref!.low < guide.low || pref!.high > guide.high) spills.push(key);
    }
    expect(spills).toEqual(['creamy']);
  });

  it('has no preference value for longevity, as the source table has no such row', () => {
    expect(FORMULATION_PREFERENCE_GUIDE.longevity).toBeUndefined();
  });
});

describe('what the scores actually sum, against the books definitions', () => {
  // The books define each quality by the acids it sums (CP:11636-11703). This app counts
  // MORE acids than the book for four of the five, deliberately — the extras are documented
  // at SOAP_PROPERTY_FATTY_ACIDS. Pinning it here so the divergence stays a decision on the
  // record: the book's bands are applied to a slightly broader sum, which matters most for
  // cleansing, where C8–C10 adds several points to a coconut-heavy recipe.
  const BOOK = {
    hardness: ['palmitic', 'stearic', 'lauric', 'myristic'],
    cleansing: ['lauric', 'myristic'],
    condition: ['oleic', 'linoleic', 'linolenic', 'ricinoleic'],
    bubbly: ['lauric', 'myristic', 'ricinoleic'],
    creamy: ['palmitic', 'stearic', 'ricinoleic'],
  } as const;

  for (const [key, acids] of Object.entries(BOOK)) {
    it(`${key} is a superset of, or equal to, the book definition`, () => {
      const ours = new Set(SOAP_PROPERTY_FATTY_ACIDS[key as keyof typeof BOOK]);
      for (const acid of acids) expect(ours.has(acid)).toBe(true);
    });
  }

  it('counts C8–C10 in cleansing, which the book definition does not', () => {
    expect(SOAP_PROPERTY_FATTY_ACIDS.cleansing).toContain('caprylic');
    expect(SOAP_PROPERTY_FATTY_ACIDS.cleansing).toContain('capric');
    expect(BOOK.cleansing as readonly string[]).not.toContain('caprylic');
  });
});
