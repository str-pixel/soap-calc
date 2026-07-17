import type { ProcessId } from './process';

export type ProcessVariantId =
  | 'cp' // cold process (single)
  | 'hp-lthp'
  | 'hp-hthp'
  | 'hp-fluid' // hot-process variants
  | 'ls-cpls'
  | 'ls-lowtemp'
  | 'ls-hightemp'
  | 'ls-30min'; // liquid-soap variants

// Two-tier by design (roadmap item 12): a low tier and a high tier with a gap between,
// plus the rivers threshold. A flat {low,high} cannot express the 28–32 gap or drive
// Task 2's tiered coaching. Tiers are inclusive [min,max] % of oils.
export type WaterBand = {
  lowTier: [number, number]; // e.g. [20, 28]
  highTier: [number, number]; // e.g. [32, 40]
  riversAbove: number; // e.g. 38
};
export type TempTarget = { lowF: number; highF: number; ceilingF?: number };
export type FinishDuration = { minWeeks: number; maxWeeks?: number }; // cure or sequester

export type ProcessProfile = {
  variant: ProcessVariantId;
  process: ProcessId;
  label: string;
  waterBand: WaterBand;
  temp: TempTarget | null; // null for CP (ambient) and CPLS
  finish: FinishDuration;
  finishKind: 'cure' | 'sequester';
  waterLossPercent: number; // fraction lost over cure/sequester, for label weight
};

// A shared two-tier water band for HP's three variants. The overall 28–40% range comes
// from the verified LTHP water-band constant; the specific low/high split point (32/34)
// and the rivers threshold (40) are an interpolation, not independently verified.
// unverified
const HP_WATER_BAND: WaterBand = { lowTier: [28, 32], highTier: [34, 40], riversAbove: 40 };

// A shared two-tier water band for LS's four variants. The overall 25–60% range comes
// from the verified LS cook-water constant; the specific low/high split point (38) and
// the rivers threshold (60) are an interpolation, not independently verified.
// unverified
const LS_WATER_BAND: WaterBand = { lowTier: [25, 38], highTier: [38, 60], riversAbove: 60 };

// LS sequester duration: the roadmap gives a single "1–4 wk" range for liquid soap as a
// whole, not broken out per sub-variant. Applying that same window to each of the four LS
// variants individually is an interpolation, not a per-variant verified value.
// unverified
const LS_SEQUESTER: FinishDuration = { minWeeks: 1, maxWeeks: 4 };

const PROFILES: Record<ProcessVariantId, ProcessProfile> = {
  cp: {
    variant: 'cp',
    process: 'cp',
    label: 'Cold process',
    waterBand: { lowTier: [20, 28], highTier: [32, 40], riversAbove: 38 }, // verified
    temp: null,
    finish: { minWeeks: 4 }, // verified
    finishKind: 'cure',
    waterLossPercent: 0.15, // verified
  },
  'hp-lthp': {
    variant: 'hp-lthp',
    process: 'hp',
    label: 'Low-temp HP (LTHP)',
    waterBand: HP_WATER_BAND, // unverified (see HP_WATER_BAND)
    temp: { lowF: 120, highF: 160 }, // verified
    finish: { minWeeks: 3, maxWeeks: 8 }, // unverified: no LTHP cure window in the roadmap table
    finishKind: 'cure',
    waterLossPercent: 0.09, // verified
  },
  'hp-hthp': {
    variant: 'hp-hthp',
    process: 'hp',
    label: 'High-temp HP (HTHP)',
    waterBand: HP_WATER_BAND, // unverified (see HP_WATER_BAND)
    temp: { lowF: 215, highF: 215, ceilingF: 240 }, // verified
    finish: { minWeeks: 3, maxWeeks: 4 }, // verified
    finishKind: 'cure',
    waterLossPercent: 0.06, // verified
  },
  'hp-fluid': {
    variant: 'hp-fluid',
    process: 'hp',
    label: 'Fluid HP',
    waterBand: HP_WATER_BAND, // unverified (see HP_WATER_BAND)
    temp: { lowF: 160, highF: 215 }, // unverified: no fluid HP temp range in the roadmap table
    finish: { minWeeks: 6 }, // verified (~6 wk cure)
    finishKind: 'cure',
    waterLossPercent: 0.09, // unverified: no fluid-specific water loss in the roadmap table
  },
  'ls-cpls': {
    variant: 'ls-cpls',
    process: 'ls',
    label: 'Cold-process LS (CPLS)',
    waterBand: LS_WATER_BAND, // unverified (see LS_WATER_BAND)
    temp: null,
    finish: LS_SEQUESTER, // unverified (see LS_SEQUESTER)
    finishKind: 'sequester',
    waterLossPercent: 0, // unverified: no LS water-loss constant in the roadmap table
  },
  'ls-lowtemp': {
    variant: 'ls-lowtemp',
    process: 'ls',
    label: 'Low-temp LS',
    waterBand: LS_WATER_BAND, // unverified (see LS_WATER_BAND)
    temp: { lowF: 160, highF: 180 }, // unverified: no per-variant LS temp range in the roadmap table
    finish: LS_SEQUESTER, // unverified (see LS_SEQUESTER)
    finishKind: 'sequester',
    waterLossPercent: 0, // unverified: no LS water-loss constant in the roadmap table
  },
  'ls-hightemp': {
    variant: 'ls-hightemp',
    process: 'ls',
    label: 'High-temp LS',
    waterBand: LS_WATER_BAND, // unverified (see LS_WATER_BAND)
    temp: { lowF: 180, highF: 215 }, // unverified: no per-variant LS temp range in the roadmap table
    finish: LS_SEQUESTER, // unverified (see LS_SEQUESTER)
    finishKind: 'sequester',
    waterLossPercent: 0, // unverified: no LS water-loss constant in the roadmap table
  },
  'ls-30min': {
    variant: 'ls-30min',
    process: 'ls',
    label: '30-minute LS',
    waterBand: LS_WATER_BAND, // unverified (see LS_WATER_BAND)
    temp: { lowF: 180, highF: 215 }, // unverified: no per-variant LS temp range in the roadmap table
    finish: LS_SEQUESTER, // unverified (see LS_SEQUESTER)
    finishKind: 'sequester',
    waterLossPercent: 0, // unverified: no LS water-loss constant in the roadmap table
  },
};

const ORDER: Record<ProcessId, ProcessVariantId[]> = {
  cp: ['cp'],
  hp: ['hp-lthp', 'hp-hthp', 'hp-fluid'],
  ls: ['ls-cpls', 'ls-lowtemp', 'ls-hightemp', 'ls-30min'],
};

export function processProfilesFor(process: ProcessId): ProcessProfile[] {
  return ORDER[process].map((v) => PROFILES[v]);
}

export function processProfileById(variant: ProcessVariantId): ProcessProfile {
  return PROFILES[variant];
}

export function defaultVariantFor(process: ProcessId): ProcessVariantId {
  return ORDER[process][0];
}

export function isProcessVariantId(value: unknown): value is ProcessVariantId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(PROFILES, value);
}
