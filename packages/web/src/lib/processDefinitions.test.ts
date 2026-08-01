import { describe, expect, it } from 'vitest';
import {
  processProfilesFor,
  processProfileById,
  defaultVariantFor,
  isProcessVariantId,
  allProcessVariantIds,
  soapingTempRangeFor,
  effectiveSoapingTempF,
  PROCESS_DEFINITIONS,
} from './process';

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

  it('defaults HP to LTHP and LS to its single variant', () => {
    expect(defaultVariantFor('hp')).toBe('hp-lthp');
    expect(defaultVariantFor('ls')).toBe('ls');
    expect(defaultVariantFor('cp')).toBe('cp');
  });

  it('returns the single CP variant', () => {
    expect(processProfilesFor('cp').map((p) => p.variant)).toEqual(['cp']);
  });

  it('returns the single LS variant', () => {
    expect(processProfilesFor('ls').map((p) => p.variant)).toEqual(['ls']);
  });

  it('every profile carries a process consistent with its own registry list', () => {
    for (const process of ['cp', 'hp', 'ls'] as const) {
      for (const profile of processProfilesFor(process)) {
        expect(profile.process).toBe(process);
      }
    }
  });

  it('LS has no temperature target (the hold temp is the method selector) and sequesters rather than cures', () => {
    const ls = processProfileById('ls');
    expect(ls.temp).toBeNull();
    expect(ls.finishKind).toBe('sequester');
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

  it('every DECLARED water band is well-formed; LS declares none (no sourced band exists)', () => {
    for (const process of ['cp', 'hp', 'ls'] as const) {
      for (const profile of processProfilesFor(process)) {
        if (profile.waterBand === null) {
          // Only LS may decline a band — its tier splits existed in no source, and dead
          // unsourced constants are worse than a declared absence.
          expect(process).toBe('ls');
          continue;
        }
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
  const allVariants = ['cp', 'hp-lthp', 'hp-hthp', 'hp-fluid', 'ls'] as const;

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
    // LS: the full hold-temperature range — the slider doubles as the method map
    // (core's lsMethodForTemp owns the zone/default ground; see ls-method.test.ts).
    expect(soapingTempRangeFor('ls')).toEqual({ minF: 60, maxF: 220, defaultF: 150 });
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
  it('uses the printed per-variant bands, not an interpolation', () => {
    // Deliberate supersession of the #143-era shared-band pin. That fix put the printed
    // GENERAL bands (discount 25-30, high 32-40, defects 40+) on all three variants; the
    // source additionally attaches figures to specific variants, adopted after an
    // executable evaluation over source-endorsed points (0 mis-coachings vs the shared
    // band's 3 — see hpWaterBands.test.ts, which holds the endorsed-point contract):
    //   hp-hthp lowTier [20,30] — "average reduced water concentration ... 20-30%" in the
    //     HTHP tips; the shared discount floor mis-coached 20-24% as "very low".
    //   hp-fluid [29,31]/[36,40] — the swirl compromise and HTFHP's "36-40% for the best
    //     fluid results, I prefer 38%".
    // LTHP keeps the general bands: the source gives it no distinct figure.
    expect(processProfileById('hp-lthp')!.waterBand).toEqual({ lowTier: [25, 30], highTier: [32, 40], riversAbove: 40 });
    expect(processProfileById('hp-hthp')!.waterBand).toEqual({ lowTier: [20, 30], highTier: [32, 40], riversAbove: 40 });
    expect(processProfileById('hp-fluid')!.waterBand).toEqual({ lowTier: [29, 31], highTier: [36, 40], riversAbove: 40 });
  });

  it('leaves no gap between the tiers that the source treats as high water', () => {
    const band = processProfileById('hp-lthp')!.waterBand!;
    // 32% is the first high-tier value in the source and must be inside the high tier.
    expect(band.highTier[0]).toBeLessThanOrEqual(32);
  });
});
