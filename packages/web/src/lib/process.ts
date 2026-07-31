import type { LyeType, WaterMode } from '@soap-calc/core';
import type { RecipeSettings } from './recipe';

export type ProcessId = 'cp' | 'hp' | 'ls';

export const PROCESS_IDS: readonly ProcessId[] = ['cp', 'hp', 'ls'];

export type PanelKey =
  | 'postCook'
  | 'dilution'
  | 'neutralize'
  | 'preserve'
  | 'cpExtras'
  | 'hpVessel';

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
// Verified against the HP source's own printed bands: a water discount is 25-30% in hot
// process, a high water concentration is 32-40%, and 40%+ is where the defects start. The
// previous [28,32]/[34,40] split was an interpolation and contradicted all three figures —
// it pushed the source's reduced-HTHP band (20-30%) and its swirl compromise (29-31%) below
// the low tier, and left 32-34% (inside the source's HIGH tier) in the inter-tier gap.
const HP_WATER_BAND: WaterBand = { lowTier: [25, 30], highTier: [32, 40], riversAbove: 40 };

// A shared two-tier water band for LS's four variants. The overall 25–60% range comes
// from the verified LS cook-water constant; the low/high split points (35/40) and the
// rivers threshold (60) are an interpolation, not independently verified. The gap between
// the tiers (35–40) is chosen so the LS default cook water (38%) falls in the neutral gap
// rather than on a tier boundary, mirroring CP's design (see WaterBand's "gap between").
// unverified
const LS_WATER_BAND: WaterBand = { lowTier: [25, 35], highTier: [40, 60], riversAbove: 60 };

// LS sequester duration: the roadmap gives a single "1–4 wk" range for liquid soap as a
// whole, not broken out per sub-variant. Applying that same window to each of the four LS
// variants individually is an interpolation, not a per-variant verified value.
// unverified
const LS_SEQUESTER: FinishDuration = { minWeeks: 1, maxWeeks: 4 };

export type ProcessDefinition = {
  id: ProcessId;
  label: string;
  defaultSettings: Partial<RecipeSettings>;
  lyeChoices: LyeType[];
  waterModeChoices: WaterMode[];
  panels: PanelKey[];
  finishing: 'cure' | 'sequester';
  terms: { finishingLabel: string };
  variants: readonly ProcessProfile[];
};

// Every process currently allows all three water modes — unlike lyeChoices, this list is
// not yet gating anything (waterModeChoicesFor/SettingsPanel just echo it back). It's
// infra-only for now: per-process water-mode restriction is deferred to a later spec.
const ALL_WATER_MODES: WaterMode[] = [
  'percent_of_oils',
  'lye_concentration',
  'lye_water_ratio',
];

export const PROCESS_DEFINITIONS: Record<ProcessId, ProcessDefinition> = {
  cp: {
    id: 'cp',
    label: 'Cold process',
    defaultSettings: {
      lyeType: 'naoh',
      superfatPercent: '5',
      waterMode: 'percent_of_oils',
      waterPercentOfOils: '33',
      soapingTempF: '125', // soapingTempRangeFor('cp').defaultF
      processVariant: 'cp', // = variants[0].variant; pinned literally because defaultSettings is part of the record that defines variants[0]
    },
    lyeChoices: ['naoh', 'dual'],
    waterModeChoices: ALL_WATER_MODES,
    panels: ['cpExtras'],
    finishing: 'cure',
    terms: { finishingLabel: 'Cure' },
    variants: [
      {
        variant: 'cp',
        process: 'cp',
        label: 'Cold process',
        // highTier[1]=40 intentionally extends past riversAbove=38 — both are verified source
        // constants, not a bug. 38–40% (nominally the top of the high tier) always trips the
        // rivers warning first: insights.ts checks water_band_rivers before the tier bands, so
        // the rivers coaching correctly takes precedence over "high tier" in that 38–40 overlap.
        waterBand: { lowTier: [20, 28], highTier: [32, 40], riversAbove: 38 }, // verified
        temp: null,
        finish: { minWeeks: 4 }, // verified
        finishKind: 'cure',
        waterLossPercent: 0.15, // verified
      },
    ],
  },
  hp: {
    id: 'hp',
    label: 'Hot process',
    defaultSettings: {
      lyeType: 'naoh',
      superfatPercent: '3',
      waterMode: 'percent_of_oils',
      waterPercentOfOils: '38',
      soapingTempF: '140', // soapingTempRangeFor('hp-lthp').defaultF — HP's default variant
      postCookSuperfatTotalPercent: '5',
      postCookSuperfatOils: [{ oilId: 'olive-oil', percent: '5' }],
      processVariant: 'hp-lthp', // = variants[0].variant; pinned literally because defaultSettings is part of the record that defines variants[0]
    },
    lyeChoices: ['naoh', 'dual'],
    waterModeChoices: ALL_WATER_MODES,
    panels: ['postCook', 'hpVessel'],
    finishing: 'cure',
    terms: { finishingLabel: 'Cure' },
    variants: [
      {
        variant: 'hp-lthp',
        process: 'hp',
        label: 'Low-temp HP (LTHP)',
        waterBand: HP_WATER_BAND, // verified (see HP_WATER_BAND)
        temp: { lowF: 120, highF: 160 }, // verified
        finish: { minWeeks: 3, maxWeeks: 8 }, // unverified: no LTHP cure window in the roadmap table
        finishKind: 'cure',
        waterLossPercent: 0.09, // verified
      },
      {
        variant: 'hp-hthp',
        process: 'hp',
        label: 'High-temp HP (HTHP)',
        waterBand: HP_WATER_BAND, // verified (see HP_WATER_BAND)
        temp: { lowF: 215, highF: 215, ceilingF: 240 }, // verified
        finish: { minWeeks: 3, maxWeeks: 4 }, // verified
        finishKind: 'cure',
        waterLossPercent: 0.06, // verified
      },
      {
        variant: 'hp-fluid',
        process: 'hp',
        label: 'Fluid HP',
        waterBand: HP_WATER_BAND, // verified (see HP_WATER_BAND)
        temp: { lowF: 160, highF: 215 }, // unverified: no fluid HP temp range in the roadmap table
        finish: { minWeeks: 6 }, // verified (~6 wk cure)
        finishKind: 'cure',
        waterLossPercent: 0.09, // unverified: no fluid-specific water loss in the roadmap table
      },
    ],
  },
  ls: {
    id: 'ls',
    label: 'Liquid soap',
    defaultSettings: {
      lyeType: 'koh',
      superfatPercent: '2',
      waterMode: 'lye_water_ratio',
      lyeWaterRatio: '2',
      soapingTempF: '95', // soapingTempRangeFor('ls-cpls').defaultF — LS's default variant
      postCookSuperfatTotalPercent: '2',
      postCookSuperfatOils: [{ oilId: 'olive-oil', percent: '2' }],
      processVariant: 'ls-cpls', // = variants[0].variant; pinned literally because defaultSettings is part of the record that defines variants[0]
    },
    lyeChoices: ['koh', 'dual'],
    waterModeChoices: ALL_WATER_MODES,
    panels: ['postCook', 'dilution', 'neutralize', 'preserve'],
    finishing: 'sequester',
    terms: { finishingLabel: 'Sequester' },
    variants: [
      {
        variant: 'ls-cpls',
        process: 'ls',
        label: 'Cold-process LS (CPLS)',
        waterBand: LS_WATER_BAND, // unverified (see LS_WATER_BAND)
        temp: null,
        finish: LS_SEQUESTER, // unverified (see LS_SEQUESTER)
        finishKind: 'sequester',
        waterLossPercent: 0, // unverified: no LS water-loss constant in the roadmap table
      },
      {
        variant: 'ls-lowtemp',
        process: 'ls',
        label: 'Low-temp LS',
        waterBand: LS_WATER_BAND, // unverified (see LS_WATER_BAND)
        temp: { lowF: 160, highF: 180 }, // unverified: no per-variant LS temp range in the roadmap table
        finish: LS_SEQUESTER, // unverified (see LS_SEQUESTER)
        finishKind: 'sequester',
        waterLossPercent: 0, // unverified: no LS water-loss constant in the roadmap table
      },
      {
        variant: 'ls-hightemp',
        process: 'ls',
        label: 'High-temp LS',
        waterBand: LS_WATER_BAND, // unverified (see LS_WATER_BAND)
        temp: { lowF: 180, highF: 215 }, // unverified: no per-variant LS temp range in the roadmap table
        finish: LS_SEQUESTER, // unverified (see LS_SEQUESTER)
        finishKind: 'sequester',
        waterLossPercent: 0, // unverified: no LS water-loss constant in the roadmap table
      },
      {
        variant: 'ls-30min',
        process: 'ls',
        label: '30-minute LS',
        waterBand: LS_WATER_BAND, // unverified (see LS_WATER_BAND)
        temp: { lowF: 180, highF: 215 }, // unverified: no per-variant LS temp range in the roadmap table
        finish: LS_SEQUESTER, // unverified (see LS_SEQUESTER)
        finishKind: 'sequester',
        waterLossPercent: 0, // unverified: no LS water-loss constant in the roadmap table
      },
    ],
  },
};

/** Flat variant index derived ONCE from the definitions — the definitions are the source
 * of truth (spec 2026-07-30 slice 2); this map exists so by-id lookup stays O(1) without
 * a second hand-maintained record that could drift. */
const VARIANTS_BY_ID: Record<ProcessVariantId, ProcessProfile> = Object.fromEntries(
  (['cp', 'hp', 'ls'] as const).flatMap((p) => PROCESS_DEFINITIONS[p].variants.map((v) => [v.variant, v])),
) as Record<ProcessVariantId, ProcessProfile>;

export function processProfilesFor(process: ProcessId): ProcessProfile[] {
  return [...PROCESS_DEFINITIONS[process].variants];
}
export function processProfileById(variant: ProcessVariantId): ProcessProfile {
  return VARIANTS_BY_ID[variant];
}
export function defaultVariantFor(process: ProcessId): ProcessVariantId {
  return PROCESS_DEFINITIONS[process].variants[0].variant;
}
export function isProcessVariantId(value: unknown): value is ProcessVariantId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(VARIANTS_BY_ID, value);
}
export function allProcessVariantIds(): ProcessVariantId[] {
  return Object.keys(VARIANTS_BY_ID) as ProcessVariantId[];
}

export type SoapingTempRange = { minF: number; maxF: number; defaultF: number };

/** Slider range + default per variant. Ambient variants (temp: null — CP, CPLS) span the
 * CP source bands (64–160 °F) with headroom on both sides; the 170 top deliberately lets
 * a user cross the 160 °F overflow line and see the warning fire. Heated variants derive
 * from their cook target: 10 °F of low-side headroom, ceiling (when one exists) as max.
 * CPLS seeds at 95 °F — an ambient no-external-heat process, below the CP gel-free line —
 * rather than CP's 125 (behavior-only choice; the source gives CPLS no starting figure). */
export function soapingTempRangeFor(variant: ProcessVariantId): SoapingTempRange {
  const profile = processProfileById(variant);
  if (profile.temp === null) {
    return { minF: 60, maxF: 170, defaultF: variant === 'ls-cpls' ? 95 : 125 };
  }
  const { lowF, highF, ceilingF } = profile.temp;
  return {
    minF: lowF - 10,
    maxF: ceilingF ?? highF,
    defaultF: lowF === highF ? lowF : Math.round((lowF + highF) / 2),
  };
}

/** The soaping temperature consumers act on: the stored setting clamped into the
 * variant's slider range, never rewritten. Staleness (an LTHP 140 viewed under HTHP's
 * 205 floor) clamps at read and un-clamps the moment the variant fits again — a
 * tab/variant detour loses nothing. Blank/junk falls back to the variant default. */
export function effectiveSoapingTempF(
  settings: { soapingTempF: string },
  variant: ProcessVariantId,
): number {
  const range = soapingTempRangeFor(variant);
  const raw = Number(settings.soapingTempF);
  if (settings.soapingTempF.trim() === '' || !Number.isFinite(raw)) return range.defaultF;
  return Math.min(range.maxF, Math.max(range.minF, raw));
}

export function isProcessId(value: unknown): value is ProcessId {
  return value === 'cp' || value === 'hp' || value === 'ls';
}

/** The single gate for process-conditional mounting/computation of a declared panel
 * capability. Readers use this instead of `process === 'x'` so the offer (the definition)
 * and the behaviour (mount/memo) cannot diverge — the arc's founding invariant. */
export function processOffersPanel(process: ProcessId, panel: PanelKey): boolean {
  return PROCESS_DEFINITIONS[process].panels.includes(panel);
}

/** The process a legacy / process-less recipe belongs to, inferred from its alkali. */
export function processForLyeType(lyeType: unknown): ProcessId {
  return lyeType === 'koh' ? 'ls' : 'cp';
}

export function defaultsForProcess(process: ProcessId): Partial<RecipeSettings> {
  return PROCESS_DEFINITIONS[process].defaultSettings;
}

/**
 * Normalize a record WITHIN its own process: reset a stale/foreign variant to the
 * process's default, clamp a lye type the process no longer offers (legacy drafts from
 * before a gate existed). Callers must already have established that `settings` belongs
 * to `process` — per-process workspaces guarantee it for drafts, and import routing
 * (recipeFile: declared/inferred/refused) guarantees it for imports. This is NOT a
 * cross-process converter; there is deliberately no bridge (spec 2026-07-30).
 */
export function normalizeSettingsWithinProcess(
  settings: RecipeSettings,
  process: ProcessId,
): RecipeSettings {
  const def = PROCESS_DEFINITIONS[process];
  const lyeOk = def.lyeChoices.includes(settings.lyeType);
  // A variant belongs to exactly one process (e.g. 'hp-hthp' → 'hp'); once that no longer
  // matches the target process — switching HP→CP while processVariant is still 'hp-hthp',
  // or the string is garbage/missing — reset to that process's own default variant.
  const variantOk =
    isProcessVariantId(settings.processVariant) &&
    processProfileById(settings.processVariant).process === process;
  if (lyeOk && variantOk) return settings;
  return {
    ...settings,
    // `?? def.lyeChoices[0]` is unreachable today (every process sets an explicit
    // defaultSettings.lyeType) but defaultSettings is a Partial, so a future process that
    // omits it would otherwise fall through to `undefined`. Kept as a defensive default.
    lyeType: lyeOk ? settings.lyeType : (def.defaultSettings.lyeType ?? def.lyeChoices[0]),
    processVariant: variantOk ? settings.processVariant : defaultVariantFor(process),
  };
}

/** Suffix for the import flash. Every import names which kind of recipe it is (cp / hp /
 * ls — user ruling 2026-07-31); an inferred one additionally explains why the app had to
 * guess, since inference is the one guess path left and it is wrong for legacy NaOH
 * hot-process files. */
export function importRoutingSuffix(
  source: 'declared' | 'inferred',
  process: ProcessId,
): string {
  const kind = ` as ${PROCESS_DEFINITIONS[process].label.toLowerCase()}`;
  return source === 'inferred' ? `${kind} — this file predates process tags` : kind;
}
