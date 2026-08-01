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
//
// PERMITTED EDIT LOG (each a deliberate, reviewed change — never edit to make a refactor pass):
// 1. Slice 4: import repointed './processProfile' -> './process' (facade retirement).
// 2. LS water-band deletion: the four ls variants' waterBand re-captured as null — a DATA
//    change removing unsourced dead constants (tier splits existed in no source), not a
//    refactor. The band was already excluded from LS insights at every read site.
// 3. HP per-variant bands: hp-hthp lowTier -> [20,30] (HP:9165-9168) and hp-fluid ->
//    [29,31]/[36,40] (HP:9081-9086, 9174-9178) — sourced DATA differentiating the shared
//    band, chosen by an executable evaluation over source-endorsed points (0 mis-coachings
//    vs 3); see hpWaterBands.test.ts for the permanent contract.
// 4. 2026-08-01 LS temperature-method redesign, task 3: the four ls-* variants collapsed
//    to a single 'ls' variant (temp: null, finish: null) — the hold temperature now
//    selects the method (core's lsMethodForTemp) instead of a fixed per-variant pick;
//    estimateCure takes the resulting window as an override. A DATA/shape change, not a
//    refactor — the four-variant ground is retired, not re-homed.
const GOLDEN_PROFILES = {
 "cp": {
  "variant": "cp",
  "process": "cp",
  "label": "Cold process",
  "waterBand": {
   "lowTier": [
    20,
    28
   ],
   "highTier": [
    32,
    40
   ],
   "riversAbove": 38
  },
  "temp": null,
  "finish": {
   "minWeeks": 4
  },
  "finishKind": "cure",
  "waterLossPercent": 0.15
 },
 "hp-lthp": {
  "variant": "hp-lthp",
  "process": "hp",
  "label": "Low-temp HP (LTHP)",
  "waterBand": {
   "lowTier": [
    25,
    30
   ],
   "highTier": [
    32,
    40
   ],
   "riversAbove": 40
  },
  "temp": {
   "lowF": 120,
   "highF": 160
  },
  "finish": {
   "minWeeks": 3,
   "maxWeeks": 8
  },
  "finishKind": "cure",
  "waterLossPercent": 0.09
 },
 "hp-hthp": {
  "variant": "hp-hthp",
  "process": "hp",
  "label": "High-temp HP (HTHP)",
  "waterBand": {
   "lowTier": [
    20,
    30
   ],
   "highTier": [
    32,
    40
   ],
   "riversAbove": 40
  },
  "temp": {
   "lowF": 215,
   "highF": 215,
   "ceilingF": 240
  },
  "finish": {
   "minWeeks": 3,
   "maxWeeks": 4
  },
  "finishKind": "cure",
  "waterLossPercent": 0.06
 },
 "hp-fluid": {
  "variant": "hp-fluid",
  "process": "hp",
  "label": "Fluid HP",
  "waterBand": {
   "lowTier": [
    29,
    31
   ],
   "highTier": [
    36,
    40
   ],
   "riversAbove": 40
  },
  "temp": {
   "lowF": 160,
   "highF": 215
  },
  "finish": {
   "minWeeks": 6
  },
  "finishKind": "cure",
  "waterLossPercent": 0.09
 },
 "ls": {
  "variant": "ls",
  "process": "ls",
  "label": "Liquid soap",
  "waterBand": null,
  "temp": null,
  "finish": null,
  "finishKind": "sequester",
  "waterLossPercent": 0
 }
} as const;

const GOLDEN_ORDER = {"cp":["cp"],"hp":["hp-lthp","hp-hthp","hp-fluid"],"ls":["ls"]} as const;

const GOLDEN_DEFAULTS = {"cp":"cp","hp":"hp-lthp","ls":"ls"} as const;

const GOLDEN_TEMPS = {"cp":{"minF":60,"maxF":170,"defaultF":125},"hp-lthp":{"minF":110,"maxF":160,"defaultF":140},"hp-hthp":{"minF":205,"maxF":240,"defaultF":215},"hp-fluid":{"minF":150,"maxF":215,"defaultF":188},"ls":{"minF":60,"maxF":220,"defaultF":150}} as const;

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
