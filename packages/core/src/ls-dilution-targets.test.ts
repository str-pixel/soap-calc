import { describe, expect, it } from 'vitest';
import {
  LS_DILUTION_TARGETS,
  LS_MINIMUM_DILUTION_GUIDE,
  lsDilutionUsesFor,
  lsConcentrationAboveAllMinimums,
} from './ls-dilution-targets.js';

describe('LS_DILUTION_TARGETS', () => {
  it('has unique keys and coherent ranges', () => {
    const keys = LS_DILUTION_TARGETS.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const t of LS_DILUTION_TARGETS) {
      expect(t.low).toBeGreaterThan(0);
      expect(t.high).toBeGreaterThanOrEqual(t.low);
      expect(t.high).toBeLessThanOrEqual(100);
      expect(t.label.length).toBeGreaterThan(0);
    }
  });

  it('is ordered from most dilute to most concentrated', () => {
    const lows = LS_DILUTION_TARGETS.map((t) => t.low);
    expect([...lows].sort((a, b) => a - b)).toEqual(lows);
  });

  it('carries the sourced ranges for each use', () => {
    const range = (key: string) => {
      const t = LS_DILUTION_TARGETS.find((x) => x.key === key)!;
      return [t.low, t.high];
    };
    expect(range('baby')).toEqual([10, 15]);
    expect(range('face')).toEqual([10, 15]);
    expect(range('foaming')).toEqual([10, 15]);
    expect(range('body-wash')).toEqual([10, 35]);
    expect(range('hand')).toEqual([15, 30]);
    expect(range('mechanic')).toEqual([30, 35]);
    expect(range('dish')).toEqual([35, 45]);
    expect(range('laundry')).toEqual([35, 45]);
  });

  it('offers no shampoo target — liquid soap is not recommended for hair', () => {
    expect(LS_DILUTION_TARGETS.some((t) => /shampoo|hair/i.test(t.label))).toBe(false);
  });
});

describe('lsDilutionUsesFor', () => {
  it('names every use a concentration suits', () => {
    // 30% sits at the top of hand soap, the bottom of mechanic, and inside body wash.
    expect(lsDilutionUsesFor(30).map((t) => t.key).sort()).toEqual(
      ['body-wash', 'hand', 'mechanic'].sort(),
    );
  });

  it('matches the gentle uses at the dilute end', () => {
    expect(lsDilutionUsesFor(12).map((t) => t.key).sort()).toEqual(
      ['baby', 'body-wash', 'face', 'foaming'].sort(),
    );
  });

  it('matches dish and laundry at the thick end', () => {
    expect(lsDilutionUsesFor(40).map((t) => t.key).sort()).toEqual(['dish', 'laundry'].sort());
  });

  it('returns nothing above every listed range, or for invalid input', () => {
    expect(lsDilutionUsesFor(60)).toEqual([]);
    expect(lsDilutionUsesFor(0)).toEqual([]);
    expect(lsDilutionUsesFor(Number.NaN)).toEqual([]);
  });

  it('is inclusive at both ends of a range', () => {
    expect(lsDilutionUsesFor(35).map((t) => t.key)).toContain('dish');
    expect(lsDilutionUsesFor(45).map((t) => t.key)).toContain('dish');
    expect(lsDilutionUsesFor(46).map((t) => t.key)).not.toContain('dish');
  });
});

describe('minimum-dilution guide', () => {
  it('runs from the most tolerant recipe to the least', () => {
    const maxes = LS_MINIMUM_DILUTION_GUIDE.map((g) => g.maxSoapPercent);
    expect([...maxes].sort((a, b) => b - a)).toEqual(maxes);
    expect(maxes[0]).toBe(40);
  });

  it('flags a target no recipe type can fully dissolve', () => {
    // Dish/laundry's 35-45% band runs past the 40% ceiling of even a coconut-heavy soap,
    // so the top of that band is reachable only by the most tolerant recipes.
    expect(lsConcentrationAboveAllMinimums(45)).toBe(true);
    expect(lsConcentrationAboveAllMinimums(40)).toBe(false);
    expect(lsConcentrationAboveAllMinimums(30)).toBe(false);
  });

  it('caps the dish/laundry bands by what the recipe dissolves, never by thickness', () => {
    // LS:1690 reads "Dish Soap - Minimum dilution concentration or 35-45% soap": use the
    // band, or the recipe's own minimum if it cannot reach the band. The note used to say
    // "whichever is thicker" — but the minimum IS the thickest attainable point, so that
    // always resolved past every recipe class's ceiling, and for castile it pointed at
    // concentrations LS:2181 states outright would be "too high (your recipe would be
    // saturated and have remaining soap)". The below-minimum failure state is undissolved
    // soap (LS:1519, LS:1524, LS:1610, LS:2181), never a change of viscosity (LS:1657
    // contradicts "thickens" for coconut soaps even AT the minimum; LS:3585 names
    // minimum-water-for-thickness a "preconceived (and incorrect) notion") — so no note
    // may sell the minimum as the thicker option, in any wording.
    const noted = LS_DILUTION_TARGETS.filter((t) => t.note?.includes('minimum dilution'));
    expect(noted.map((t) => t.key).sort()).toEqual(['dish', 'laundry']);
    for (const t of noted) {
      expect(t.note).toMatch(/cannot dissolve/i);
      expect(t.note).not.toMatch(/thicker|thickest|thickens|sets/i);
    }
    // And no shipped string anywhere in the module claims a viscosity consequence for the
    // minimum: the failure is undissolved soap.
    for (const t of LS_DILUTION_TARGETS) {
      expect(`${t.label} ${t.note ?? ''}`).not.toMatch(/thickens|sets solid|stay liquid/i);
    }
  });
});
