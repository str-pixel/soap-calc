import { describe, expect, test } from 'vitest';
import {
  LS_PRESERVATIVES,
  lsPreservativeById,
  lsPreservativeDoseTier,
  preservativeDoseGrams,
  type LsPreservative,
} from './ls-preservatives.js';

const byId = Object.fromEntries(LS_PRESERVATIVES.map((p) => [p.id, p])) as Record<
  string,
  LsPreservative
>;

describe('the preservative table', () => {
  test('offers exactly the four preservatives documented working at soap pH, anchor first', () => {
    expect(LS_PRESERVATIVES.map((p) => p.id)).toEqual([
      'suttocide-a',
      'liquid-germall-plus',
      'glydant-plus',
      'phenoxyethanol',
    ]);
  });

  // The ceilings are the load-bearing numbers: each is pinned to its verified figure AND
  // to which authority set it, so a drift in either direction (a "rounder" 0.5 → 1.0, or
  // an eu/supplier swap that would mislabel the clamp message) fails here.
  test('Suttocide A: EU ceiling 1.0% as supplied (0.5% active SHMG in a 50% solution), default at the ceiling', () => {
    const p = byId['suttocide-a'];
    expect(p.maxPct).toBe(1.0);
    expect(p.ceiling).toBe('eu');
    expect(p.defaultPct).toBe(1.0);
    expect(p.typicalPctRange).toEqual([0.5, 1.0]);
    expect(p.formaldehydeLabel).toBe('generally-required');
  });

  test('Liquid Germall Plus: the supplier maximum 0.5% binds before any EU active cap', () => {
    const p = byId['liquid-germall-plus'];
    expect(p.maxPct).toBe(0.5);
    expect(p.ceiling).toBe('supplier');
    expect(p.defaultPct).toBe(0.5);
    expect(p.addBelowC).toBe(50);
    // Diazolidinyl urea IS a formaldehyde releaser — Germall must never present as
    // formaldehyde-free. What is not asserted for it is the categorical "generally
    // required" (no verified released-formaldehyde figure at 0.5%), hence the
    // check-the-threshold status rather than silence.
    expect(p.formaldehydeLabel).toBe('check-threshold');
  });

  test('Glydant Plus: the supplier-recommended 0.36% binds before the EU DMDMH/IPBC caps', () => {
    const p = byId['glydant-plus'];
    expect(p.maxPct).toBe(0.36);
    expect(p.ceiling).toBe('supplier');
    expect(p.defaultPct).toBe(0.36);
    expect(p.typicalPctRange).toEqual([0.15, 0.36]);
    expect(p.formaldehydeLabel).toBe('generally-required');
  });

  test('Phenoxyethanol: EU ceiling 1.0%, default at the ceiling, no formaldehyde warning', () => {
    const p = byId['phenoxyethanol'];
    expect(p.maxPct).toBe(1.0);
    expect(p.ceiling).toBe('eu');
    expect(p.defaultPct).toBe(1.0);
    expect(p.formaldehydeLabel).toBe('not-a-releaser');
  });

  // The asymmetry guard: a composition naming a known formaldehyde releaser (SHMG, a
  // hydantoin, an imidazolidinyl/diazolidinyl urea) must carry SOME formaldehyde status —
  // de-flagging any releaser to 'not-a-releaser' fails here structurally, whatever its
  // per-product pin above says.
  test('no product whose composition names a known releaser is marked not-a-releaser', () => {
    const releaserPattern = /hydroxymethylglycinate|hydantoin|urea/i;
    for (const p of LS_PRESERVATIVES) {
      if (releaserPattern.test(p.composition)) {
        expect(p.formaldehydeLabel, p.id).not.toBe('not-a-releaser');
      }
    }
    // and the pattern itself must be live: it matches three of the four
    expect(LS_PRESERVATIVES.filter((p) => releaserPattern.test(p.composition))).toHaveLength(3);
  });

  test('every default is usable as-is: inside the typical range and never above the ceiling', () => {
    for (const p of LS_PRESERVATIVES) {
      expect(p.defaultPct, p.id).toBeGreaterThanOrEqual(p.typicalPctRange[0]);
      expect(p.defaultPct, p.id).toBeLessThanOrEqual(p.typicalPctRange[1]);
      expect(p.defaultPct, p.id).toBeLessThanOrEqual(p.maxPct);
      expect(p.typicalPctRange[0], p.id).toBeGreaterThan(0);
      expect(p.typicalPctRange[1], p.id).toBeLessThanOrEqual(p.maxPct);
    }
  });

  test('lsPreservativeById returns the table entry for every id', () => {
    for (const p of LS_PRESERVATIVES) {
      expect(lsPreservativeById(p.id)).toBe(p);
    }
  });
});

describe('preservativeDoseGrams', () => {
  test('is % w/w of the finished mass: 1% of 1,000 g is 10 g', () => {
    expect(preservativeDoseGrams(1000, 1)).toBe(10);
  });

  test('0.5% of a 4,000 g diluted batch is 20 g', () => {
    expect(preservativeDoseGrams(4000, 0.5)).toBe(20);
  });

  test('refuses junk with 0, never NaN: non-finite or negative inputs', () => {
    expect(preservativeDoseGrams(NaN, 1)).toBe(0);
    expect(preservativeDoseGrams(1000, NaN)).toBe(0);
    expect(preservativeDoseGrams(-5, 1)).toBe(0);
    expect(preservativeDoseGrams(1000, -1)).toBe(0);
    expect(preservativeDoseGrams(Infinity, 1)).toBe(0);
  });
});

describe('lsPreservativeDoseTier', () => {
  const suttocide = byId['suttocide-a'];       // typical [0.5, 1.0], max 1.0 (eu)
  const germall = byId['liquid-germall-plus']; // typical [0.1, 0.5], max 0.5 (supplier)

  test('junk and empty-ish doses are none, so no note fires mid-keystroke', () => {
    expect(lsPreservativeDoseTier(NaN, suttocide)).toBe('none');
    expect(lsPreservativeDoseTier(0, suttocide)).toBe('none');
    expect(lsPreservativeDoseTier(-1, suttocide)).toBe('none');
    expect(lsPreservativeDoseTier(Infinity, suttocide)).toBe('none');
  });

  test('a dose inside the typical range is typical, boundaries included', () => {
    expect(lsPreservativeDoseTier(0.7, suttocide)).toBe('typical');
    expect(lsPreservativeDoseTier(0.5, suttocide)).toBe('typical'); // exactly typicalLow
    expect(lsPreservativeDoseTier(1.0, suttocide)).toBe('typical'); // exactly typicalHigh = maxPct
    expect(lsPreservativeDoseTier(0.1, germall)).toBe('typical');
    expect(lsPreservativeDoseTier(0.5, germall)).toBe('typical');
  });

  test('a dose under the typical range is below-typical', () => {
    expect(lsPreservativeDoseTier(0.4, suttocide)).toBe('below-typical');
    expect(lsPreservativeDoseTier(0.09, germall)).toBe('below-typical');
  });

  test('a dose over the ceiling is above-max — the figure is no longer clamped to it', () => {
    expect(lsPreservativeDoseTier(1.01, suttocide)).toBe('above-max');
    expect(lsPreservativeDoseTier(2, suttocide)).toBe('above-max');
    expect(lsPreservativeDoseTier(0.8, germall)).toBe('above-max');
  });

  test('over 100% is impossible, and outranks above-max: not a ceiling breach, not a dose', () => {
    expect(lsPreservativeDoseTier(101, suttocide)).toBe('impossible');
    // 150 is also far above suttocide's 1.0 ceiling; impossible still wins.
    expect(lsPreservativeDoseTier(150, suttocide)).toBe('impossible');
    expect(lsPreservativeDoseTier(100, suttocide)).toBe('above-max'); // exactly 100 is a dose
  });

  test('with no preservative (a custom entry) only the arithmetic tiers are reachable', () => {
    expect(lsPreservativeDoseTier(1)).toBe('unrated');
    expect(lsPreservativeDoseTier(0.001)).toBe('unrated');
    expect(lsPreservativeDoseTier(100)).toBe('unrated');
    expect(lsPreservativeDoseTier(101)).toBe('impossible');
    expect(lsPreservativeDoseTier(0)).toBe('none');
    expect(lsPreservativeDoseTier(NaN)).toBe('none');
  });

  test('no shipped entry can produce a dose that is above typical but under its ceiling', () => {
    // Why there is no 'above-typical' tier: every entry's typicalHigh IS its maxPct, so the
    // band between them is empty. If an entry with headroom is ever added, this test fails
    // and the tier (plus its UI note) must be added with it.
    for (const p of LS_PRESERVATIVES) {
      expect(p.typicalPctRange[1], p.id).toBe(p.maxPct);
    }
  });
});
