import { describe, expect, it } from 'vitest';
import {
  processProfilesFor,
  processProfileById,
  defaultVariantFor,
  isProcessVariantId,
  allProcessVariantIds,
} from './processProfile';
import { PROCESS_DEFINITIONS } from './process';

describe('processProfilesFor', () => {
  it('returns three HP variants with the verified temperature targets', () => {
    const hp = processProfilesFor('hp');
    expect(hp.map((p) => p.variant)).toEqual(['hp-lthp', 'hp-hthp', 'hp-fluid']);
    expect(processProfileById('hp-lthp').temp).toEqual({ lowF: 120, highF: 160 });
    expect(processProfileById('hp-hthp').temp).toEqual({ lowF: 215, highF: 215, ceilingF: 240 });
  });

  it('encodes CP two-tier water band and cure minimum', () => {
    const cp = processProfileById('cp');
    expect(cp.waterBand).toEqual({ lowTier: [20, 28], highTier: [32, 40], riversAbove: 38 });
    expect(cp.finish).toEqual({ minWeeks: 4 });
    expect(cp.waterLossPercent).toBeCloseTo(0.15);
  });

  it('defaults HP to LTHP and LS to CPLS', () => {
    expect(defaultVariantFor('hp')).toBe('hp-lthp');
    expect(defaultVariantFor('ls')).toBe('ls-cpls');
    expect(defaultVariantFor('cp')).toBe('cp');
  });

  it('returns the single CP variant', () => {
    expect(processProfilesFor('cp').map((p) => p.variant)).toEqual(['cp']);
  });

  it('returns four LS variants, in order, defaulting to CPLS', () => {
    const ls = processProfilesFor('ls');
    expect(ls.map((p) => p.variant)).toEqual([
      'ls-cpls',
      'ls-lowtemp',
      'ls-hightemp',
      'ls-30min',
    ]);
  });

  it('every profile carries a process consistent with its own registry list', () => {
    for (const process of ['cp', 'hp', 'ls'] as const) {
      for (const profile of processProfilesFor(process)) {
        expect(profile.process).toBe(process);
      }
    }
  });

  it('CPLS has no temperature target and sequesters rather than cures', () => {
    const cpls = processProfileById('ls-cpls');
    expect(cpls.temp).toBeNull();
    expect(cpls.finishKind).toBe('sequester');
  });

  it('CP has no temperature target (ambient) and cures', () => {
    const cp = processProfileById('cp');
    expect(cp.temp).toBeNull();
    expect(cp.finishKind).toBe('cure');
  });

  it('encodes the verified HTHP cure window and water loss', () => {
    const hthp = processProfileById('hp-hthp');
    expect(hthp.finish).toEqual({ minWeeks: 3, maxWeeks: 4 });
    expect(hthp.waterLossPercent).toBeCloseTo(0.06);
  });

  it('encodes the verified LTHP water loss', () => {
    expect(processProfileById('hp-lthp').waterLossPercent).toBeCloseTo(0.09);
  });

  it('encodes the verified fluid HP cure window (~6 wk)', () => {
    expect(processProfileById('hp-fluid').finish).toEqual({ minWeeks: 6 });
  });

  it('every water band has a genuine gap between its tiers, and well-formed tiers', () => {
    for (const process of ['cp', 'hp', 'ls'] as const) {
      for (const profile of processProfilesFor(process)) {
        const { lowTier, highTier } = profile.waterBand;
        expect(lowTier[0]).toBeLessThanOrEqual(lowTier[1]);
        expect(highTier[0]).toBeLessThanOrEqual(highTier[1]);
        expect(lowTier[1]).toBeLessThan(highTier[0]);
      }
    }
  });
});

describe('registry drift guards', () => {
  it('ORDER (via processProfilesFor) reaches exactly the variants in PROFILES, no omissions or duplicates', () => {
    const reachable = (['cp', 'hp', 'ls'] as const).flatMap((process) =>
      processProfilesFor(process).map((p) => p.variant),
    );
    const all = allProcessVariantIds();
    expect(reachable.length).toBe(all.length);
    expect(new Set(reachable)).toEqual(new Set(all));
  });

  it('every profile finishKind matches its process definition finishing', () => {
    for (const id of allProcessVariantIds()) {
      const profile = processProfileById(id);
      expect(profile.finishKind).toBe(PROCESS_DEFINITIONS[profile.process].finishing);
    }
  });
});

describe('isProcessVariantId', () => {
  const allVariants = [
    'cp',
    'hp-lthp',
    'hp-hthp',
    'hp-fluid',
    'ls-cpls',
    'ls-lowtemp',
    'ls-hightemp',
    'ls-30min',
  ] as const;

  it('accepts every known variant id', () => {
    for (const id of allVariants) {
      expect(isProcessVariantId(id)).toBe(true);
    }
  });

  it('rejects unknown strings and non-string values', () => {
    expect(isProcessVariantId('bogus')).toBe(false);
    expect(isProcessVariantId('')).toBe(false);
    expect(isProcessVariantId(undefined)).toBe(false);
    expect(isProcessVariantId(null)).toBe(false);
    expect(isProcessVariantId(42)).toBe(false);
  });
});
