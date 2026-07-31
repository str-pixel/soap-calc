import { describe, expect, it } from 'vitest';
import {
  allProcessVariantIds,
  defaultVariantFor,
  processProfileById,
  processProfilesFor,
  soapingTempRangeFor,
} from './process';

// Machine-captured from the live implementation (2026-07-31), immediately before the
// Slice 2 re-homing. If this test ever needs editing to pass, the re-homing changed
// observable behaviour — which is the one thing it must not do.
const GOLDEN_PROFILES = {"cp":{"variant":"cp","process":"cp","label":"Cold process","waterBand":{"lowTier":[20,28],"highTier":[32,40],"riversAbove":38},"temp":null,"finish":{"minWeeks":4},"finishKind":"cure","waterLossPercent":0.15},"hp-lthp":{"variant":"hp-lthp","process":"hp","label":"Low-temp HP (LTHP)","waterBand":{"lowTier":[25,30],"highTier":[32,40],"riversAbove":40},"temp":{"lowF":120,"highF":160},"finish":{"minWeeks":3,"maxWeeks":8},"finishKind":"cure","waterLossPercent":0.09},"hp-hthp":{"variant":"hp-hthp","process":"hp","label":"High-temp HP (HTHP)","waterBand":{"lowTier":[25,30],"highTier":[32,40],"riversAbove":40},"temp":{"lowF":215,"highF":215,"ceilingF":240},"finish":{"minWeeks":3,"maxWeeks":4},"finishKind":"cure","waterLossPercent":0.06},"hp-fluid":{"variant":"hp-fluid","process":"hp","label":"Fluid HP","waterBand":{"lowTier":[25,30],"highTier":[32,40],"riversAbove":40},"temp":{"lowF":160,"highF":215},"finish":{"minWeeks":6},"finishKind":"cure","waterLossPercent":0.09},"ls-cpls":{"variant":"ls-cpls","process":"ls","label":"Cold-process LS (CPLS)","waterBand":{"lowTier":[25,35],"highTier":[40,60],"riversAbove":60},"temp":null,"finish":{"minWeeks":1,"maxWeeks":4},"finishKind":"sequester","waterLossPercent":0},"ls-lowtemp":{"variant":"ls-lowtemp","process":"ls","label":"Low-temp LS","waterBand":{"lowTier":[25,35],"highTier":[40,60],"riversAbove":60},"temp":{"lowF":160,"highF":180},"finish":{"minWeeks":1,"maxWeeks":4},"finishKind":"sequester","waterLossPercent":0},"ls-hightemp":{"variant":"ls-hightemp","process":"ls","label":"High-temp LS","waterBand":{"lowTier":[25,35],"highTier":[40,60],"riversAbove":60},"temp":{"lowF":180,"highF":215},"finish":{"minWeeks":1,"maxWeeks":4},"finishKind":"sequester","waterLossPercent":0},"ls-30min":{"variant":"ls-30min","process":"ls","label":"30-minute LS","waterBand":{"lowTier":[25,35],"highTier":[40,60],"riversAbove":60},"temp":{"lowF":180,"highF":215},"finish":{"minWeeks":1,"maxWeeks":4},"finishKind":"sequester","waterLossPercent":0}} as const;

const GOLDEN_ORDER = {"cp":["cp"],"hp":["hp-lthp","hp-hthp","hp-fluid"],"ls":["ls-cpls","ls-lowtemp","ls-hightemp","ls-30min"]} as const;

const GOLDEN_DEFAULTS = {"cp":"cp","hp":"hp-lthp","ls":"ls-cpls"} as const;

const GOLDEN_TEMPS = {"cp":{"minF":60,"maxF":170,"defaultF":125},"hp-lthp":{"minF":110,"maxF":160,"defaultF":140},"hp-hthp":{"minF":205,"maxF":240,"defaultF":215},"hp-fluid":{"minF":150,"maxF":215,"defaultF":188},"ls-cpls":{"minF":60,"maxF":170,"defaultF":95},"ls-lowtemp":{"minF":150,"maxF":180,"defaultF":170},"ls-hightemp":{"minF":170,"maxF":215,"defaultF":198},"ls-30min":{"minF":170,"maxF":215,"defaultF":198}} as const;

describe('variant layer golden master (slice 2 re-homing guard)', () => {
  it('every variant profile is byte-identical to the captured snapshot', () => {
    const ids = allProcessVariantIds().sort();
    expect(ids).toEqual(Object.keys(GOLDEN_PROFILES).sort());
    for (const id of ids) {
      expect(JSON.parse(JSON.stringify(processProfileById(id)))).toEqual(
        GOLDEN_PROFILES[id as keyof typeof GOLDEN_PROFILES],
      );
    }
  });

  it('per-process variant order and defaults are unchanged', () => {
    for (const p of ['cp', 'hp', 'ls'] as const) {
      expect(processProfilesFor(p).map((x) => x.variant)).toEqual([...GOLDEN_ORDER[p]]);
      expect(defaultVariantFor(p)).toBe(GOLDEN_DEFAULTS[p]);
    }
  });

  it('derived temperature ranges are unchanged', () => {
    for (const id of allProcessVariantIds()) {
      expect(soapingTempRangeFor(id)).toEqual(GOLDEN_TEMPS[id as keyof typeof GOLDEN_TEMPS]);
    }
  });
});
