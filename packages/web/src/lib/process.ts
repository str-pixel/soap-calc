import type { LyeType, WaterMode } from '@soap-calc/core';
import type { RecipeSettings } from './recipe';

export type ProcessId = 'cp' | 'hp' | 'ls';

export const PROCESS_IDS: readonly ProcessId[] = ['cp', 'hp', 'ls'];

export type CapabilityKey =
  | 'postCook'
  | 'dilution'
  | 'neutralize'
  | 'preserve'
  | 'cpExtras'
  | 'hpVessel'
  // Not panels: declared process capabilities read by computation and offer gates alike.
  | 'negativeSuperfat'
  | 'solutionDosing'
  | 'afterCookStage';

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
  /** Two-tier water coaching band — null where no sourced band exists (LS: the research
   * sweep found tier splits for it in no source; carrying unsourced dead constants was
   * worse than declaring the absence). */
  waterBand: WaterBand | null;
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
  /** Accepted dual-lye KOH share of total alkali, [min, max] % by weight. Core accepts the
   * chemistry-valid 0–100; this narrows it to the process's practice (roadmap "Dual-lye
   * ratios", confirmed): bar soap runs KOH as a minor additive (95/5 NaOH/KOH, so 0–50),
   * LS dual is KOH-primary (80/20 KOH/NaOH, so 50–100). Parser and blend input both read
   * it via kohBlendRangeFor so the accepted range and the UI bound cannot drift.
   *
   * DELIBERATE: no migration for legacy LS dual drafts (saved under the old 0–50 cap, so
   * blend ≤ 50 — always out of range here). They surface the validation error with the
   * settings preserved, the same draft-safe-refusal shape as every other invalid setting.
   * Silently clamping 5 → 50 would multiply the recipe's KOH share tenfold behind the
   * user's back; those drafts encoded a NaOH-primary alkali that was never liquid soap,
   * and the honest outcome is an error naming the LS bounds. Pinned by the
   * legacy-draft test in calculateRecipe.test.ts. (Process-less imports are unaffected:
   * processForLyeType routes 'dual' to 'cp', where old blends stay valid.) */
  kohBlendRange: readonly [number, number];
  waterModeChoices: WaterMode[];
  capabilities: CapabilityKey[];
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
    kohBlendRange: [0, 50],
    waterModeChoices: ALL_WATER_MODES,
    capabilities: ['cpExtras'],
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
    kohBlendRange: [0, 50],
    waterModeChoices: ALL_WATER_MODES,
    capabilities: ['postCook', 'hpVessel', 'afterCookStage'],
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
        // HTHP's own low tier: the source's HTHP tips endorse an "average reduced water
        // concentration ... 20-30%" (HP:9165-9168) below the general 25-30 discount; the
        // shared band mis-coached 20-24% as "very low". High tier + rivers stay general.
        waterBand: { lowTier: [20, 30], highTier: [32, 40], riversAbove: 40 }, // verified
        temp: { lowF: 215, highF: 215, ceilingF: 240 }, // verified
        finish: { minWeeks: 3, maxWeeks: 4 }, // verified
        finishKind: 'cure',
        waterLossPercent: 0.06, // verified
      },
      {
        variant: 'hp-fluid',
        process: 'hp',
        label: 'Fluid HP',
        // Fluid HP's own band, both tiers variant-attached in the source: the swirl compromise
        // 29-31% ("thick custard ... spoon poured", HP:9081-9086) and HTFHP's "36-40% for
        // the best fluid results, I prefer 38%" (HP:9174-9178; recipe guide HP:9635).
        waterBand: { lowTier: [29, 31], highTier: [36, 40], riversAbove: 40 }, // verified
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
      // 0% in-cook: the whole 1–3% LS superfat budget is delivered post-cook (the 2%
      // olive reserve below). Main and post-cook superfat COMPOUND — seeding 2% + 2%
      // lands at ~3.96%, past the ~3% cloud/separation ceiling the app itself warns at.
      superfatPercent: '0',
      // Seeds a switch to dual lye at the documented LS ratio (80/20 KOH/NaOH) instead of
      // the bar default '5', which sits outside LS's kohBlendRange.
      kohBlendPercent: '80',
      waterMode: 'lye_water_ratio',
      lyeWaterRatio: '2',
      soapingTempF: '95', // soapingTempRangeFor('ls-cpls').defaultF — LS's default variant
      postCookSuperfatTotalPercent: '2',
      postCookSuperfatOils: [{ oilId: 'olive-oil', percent: '2' }],
      processVariant: 'ls-cpls', // = variants[0].variant; pinned literally because defaultSettings is part of the record that defines variants[0]
    },
    lyeChoices: ['koh', 'dual'],
    kohBlendRange: [50, 100],
    waterModeChoices: ALL_WATER_MODES,
    capabilities: ['postCook', 'dilution', 'neutralize', 'preserve', 'negativeSuperfat', 'solutionDosing', 'afterCookStage'],
    finishing: 'sequester',
    terms: { finishingLabel: 'Sequester' },
    variants: [
      {
        variant: 'ls-cpls',
        process: 'ls',
        label: 'Cold-process LS (CPLS)',
        waterBand: null, // no sourced LS band exists — see the WaterBand field doc
        temp: null,
        finish: LS_SEQUESTER, // unverified (see LS_SEQUESTER)
        finishKind: 'sequester',
        waterLossPercent: 0, // unverified: no LS water-loss constant in the roadmap table
      },
      {
        variant: 'ls-lowtemp',
        process: 'ls',
        label: 'Low-temp LS',
        waterBand: null, // no sourced LS band exists — see the WaterBand field doc
        temp: { lowF: 160, highF: 180 }, // unverified: no per-variant LS temp range in the roadmap table
        finish: LS_SEQUESTER, // unverified (see LS_SEQUESTER)
        finishKind: 'sequester',
        waterLossPercent: 0, // unverified: no LS water-loss constant in the roadmap table
      },
      {
        variant: 'ls-hightemp',
        process: 'ls',
        label: 'High-temp LS',
        waterBand: null, // no sourced LS band exists — see the WaterBand field doc
        temp: { lowF: 180, highF: 215 }, // unverified: no per-variant LS temp range in the roadmap table
        finish: LS_SEQUESTER, // unverified (see LS_SEQUESTER)
        finishKind: 'sequester',
        waterLossPercent: 0, // unverified: no LS water-loss constant in the roadmap table
      },
      {
        variant: 'ls-30min',
        process: 'ls',
        label: '30-minute LS',
        waterBand: null, // no sourced LS band exists — see the WaterBand field doc
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

/** The single gate for process-conditional mounting, computation and OFFERS of a declared
 * capability. Readers use this instead of `process === 'x'` so the offer (the definition)
 * and the behaviour (mount/memo) cannot diverge — the arc's founding invariant. */
export function processOffers(process: ProcessId, capability: CapabilityKey): boolean {
  return PROCESS_DEFINITIONS[process].capabilities.includes(capability);
}


/** The process a legacy / process-less recipe belongs to, inferred from its alkali. */
export function processForLyeType(lyeType: unknown): ProcessId {
  return lyeType === 'koh' ? 'ls' : 'cp';
}

export function defaultsForProcess(process: ProcessId): Partial<RecipeSettings> {
  return PROCESS_DEFINITIONS[process].defaultSettings;
}

/** The process's accepted dual-lye KOH share, [min, max] % of total alkali by weight.
 * See ProcessDefinition.kohBlendRange for the grounding. */
export function kohBlendRangeFor(process: ProcessId): readonly [number, number] {
  return PROCESS_DEFINITIONS[process].kohBlendRange;
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
