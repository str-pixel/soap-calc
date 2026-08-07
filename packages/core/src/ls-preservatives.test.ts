import { describe, expect, test } from 'vitest';
import {
  LS_PRESERVATIVES,
  clampLsPreservativePct,
  lsPreservativeById,
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
    expect(p.euFormaldehydeWarning).toBe(true);
  });

  test('Liquid Germall Plus: the supplier maximum 0.5% binds before any EU active cap', () => {
    const p = byId['liquid-germall-plus'];
    expect(p.maxPct).toBe(0.5);
    expect(p.ceiling).toBe('supplier');
    expect(p.defaultPct).toBe(0.5);
    expect(p.addBelowC).toBe(50);
    expect(p.euFormaldehydeWarning).toBe(false);
  });

  test('Glydant Plus: the supplier-recommended 0.36% binds before the EU DMDMH/IPBC caps', () => {
    const p = byId['glydant-plus'];
    expect(p.maxPct).toBe(0.36);
    expect(p.ceiling).toBe('supplier');
    expect(p.defaultPct).toBe(0.36);
    expect(p.typicalPctRange).toEqual([0.15, 0.36]);
    expect(p.euFormaldehydeWarning).toBe(true);
  });

  test('Phenoxyethanol: EU ceiling 1.0%, default at the ceiling, no formaldehyde warning', () => {
    const p = byId['phenoxyethanol'];
    expect(p.maxPct).toBe(1.0);
    expect(p.ceiling).toBe('eu');
    expect(p.defaultPct).toBe(1.0);
    expect(p.euFormaldehydeWarning).toBe(false);
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

describe('clampLsPreservativePct', () => {
  const suttocide = byId['suttocide-a'];
  const germall = byId['liquid-germall-plus'];

  test('a dose under the ceiling passes through unclamped', () => {
    expect(clampLsPreservativePct(0.7, suttocide)).toEqual({ pct: 0.7, clamped: false });
  });

  test('a dose AT the ceiling is legal, not clamped', () => {
    expect(clampLsPreservativePct(1.0, suttocide)).toEqual({ pct: 1.0, clamped: false });
    expect(clampLsPreservativePct(0.5, germall)).toEqual({ pct: 0.5, clamped: false });
  });

  test('a dose above the ceiling clamps to it and says so', () => {
    expect(clampLsPreservativePct(2, suttocide)).toEqual({ pct: 1.0, clamped: true });
    expect(clampLsPreservativePct(0.8, germall)).toEqual({ pct: 0.5, clamped: true });
  });

  test('junk (NaN, negative) resolves to a zero dose, not a clamp message', () => {
    expect(clampLsPreservativePct(NaN, suttocide)).toEqual({ pct: 0, clamped: false });
    expect(clampLsPreservativePct(-1, suttocide)).toEqual({ pct: 0, clamped: false });
  });
});
