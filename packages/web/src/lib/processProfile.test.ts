import { describe, expect, it } from 'vitest';
import {
  processProfilesFor,
  processProfileById,
  defaultVariantFor,
  isProcessVariantId,
  allProcessVariantIds,
  soapingTempRangeFor,
  effectiveSoapingTempF,
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
  it('variant ids are unique across all process definitions', () => {
    const reachable = (['cp', 'hp', 'ls'] as const).flatMap((process) =>
      processProfilesFor(process).map((p) => p.variant),
    );
    // Not tautological: VARIANTS_BY_ID is keyed by id, so a duplicate would silently
    // overwrite — this catches it at the list level before the record collapses it.
    expect(new Set(reachable).size).toBe(reachable.length);
    expect(reachable.length).toBe(allProcessVariantIds().length);
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

describe('soaping-temperature ranges and clamp (2026-07-27)', () => {
  it('CP spans the source bands with warning headroom; HTHP spans its cook target to the ceiling', () => {
    expect(soapingTempRangeFor('cp')).toEqual({ minF: 60, maxF: 170, defaultF: 125 });
    expect(soapingTempRangeFor('hp-hthp')).toEqual({ minF: 205, maxF: 240, defaultF: 215 });
    expect(soapingTempRangeFor('hp-lthp')).toEqual({ minF: 110, maxF: 160, defaultF: 140 });
    // CPLS: ambient process — seeded below the CP gel-free line, not at CP's 125.
    expect(soapingTempRangeFor('ls-cpls')).toEqual({ minF: 60, maxF: 170, defaultF: 95 });
  });

  it('effectiveSoapingTempF clamps at read without touching the stored setting', () => {
    const settings = { soapingTempF: '140' };
    // An LTHP value viewed under HTHP clamps up to the floor…
    expect(effectiveSoapingTempF(settings, 'hp-hthp')).toBe(205);
    // …and reads back unchanged under its own variant (nothing was rewritten).
    expect(settings.soapingTempF).toBe('140');
    expect(effectiveSoapingTempF(settings, 'hp-lthp')).toBe(140);
  });

  it('falls back to the variant default on blank or junk', () => {
    expect(effectiveSoapingTempF({ soapingTempF: '' }, 'cp')).toBe(125);
    expect(effectiveSoapingTempF({ soapingTempF: 'abc' }, 'hp-hthp')).toBe(215);
  });
});

describe('HP water band matches the source', () => {
  it('uses the printed discount and high-water bands, not an interpolation', () => {
    // Source: a water discount is 25-30% in hot process; a high water concentration is
    // 32-40%; 40%+ is where the defects start. The old [28,32]/[34,40] split contradicted
    // all three and left 32-34% — inside the source's HIGH tier — in the inter-tier gap.
    for (const variant of ['hp-lthp', 'hp-hthp', 'hp-fluid'] as const) {
      const band = processProfileById(variant)!.waterBand!;
      expect(band.lowTier).toEqual([25, 30]);
      expect(band.highTier).toEqual([32, 40]);
      expect(band.riversAbove).toBe(40);
    }
  });

  it('leaves no gap between the tiers that the source treats as high water', () => {
    const band = processProfileById('hp-lthp')!.waterBand!;
    // 32% is the first high-tier value in the source and must be inside the high tier.
    expect(band.highTier[0]).toBeLessThanOrEqual(32);
  });
});
