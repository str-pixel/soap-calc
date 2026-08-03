import {
  LS_TEMP_DEFAULT_F,
  LS_TEMP_MAX_F,
  LS_TEMP_MIN_F,
  type LyeType,
  type WaterMode,
} from '@soap-calc/core';
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
  | 'ls'; // liquid soap (single — the method is derived from the hold temperature)

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
  /** Single acceptable water range as % of oils. LS only: the reference gives one envelope
   * rather than the two tiers CP/HP publish, so this cannot reuse WaterBand. */
  waterEnvelope: [number, number] | null;
  temp: TempTarget | null; // null for CP (ambient) and LS (hold temp IS the method selector)
  /** null = no fixed window; the LS window is temperature-derived (lsMethodForTemp) and
   * passed to estimateCure as an override — same "declare the absence" posture as
   * temp/waterBand. */
  finish: FinishDuration | null;
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
   * Legacy-draft policy — the line runs between DORMANT and ACTIVE blends:
   * - DORMANT (lyeType is not 'dual'): the stored blend is filler the user never chose
   *   (DEFAULT_SETTINGS seeded '5' invisibly under every pre-range LS draft). Left alone
   *   it would blank the recipe with a bounds error on the first switch to dual, so
   *   normalizeSettingsWithinProcess reseeds an out-of-range dormant blend to the
   *   process default on load. No recipe information is lost — the value never fed math.
   * - ACTIVE (lyeType IS 'dual'): the blend encoded a real alkali choice. No migration:
   *   it surfaces the validation error with the settings preserved, the same
   *   draft-safe-refusal shape as every other invalid setting. Silently clamping 5 → 50
   *   would multiply the recipe's KOH share tenfold behind the user's back. Pinned by the
   *   legacy-draft test in calculateRecipe.test.ts. (Process-less imports route by
   *   processForLyeType, which reads the blend: KOH-primary dual infers ls, else cp —
   *   either way the blend lands in a process whose range accepts it or errors honestly.) */
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
      // The bar 95/5 NaOH/KOH ratio (roadmap "Dual-lye ratios", confirmed). Declared
      // per-process (not left to DEFAULT_SETTINGS) so the dormant-blend reseed in
      // normalizeSettingsWithinProcess has a same-module source — recipe.ts imports this
      // module, so reaching back for DEFAULT_SETTINGS would be a cycle.
      kohBlendPercent: '5',
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
        waterEnvelope: null, // no sourced LS-style single envelope for CP — the two-tier band applies
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
      kohBlendPercent: '5', // bar 95/5 NaOH/KOH — see the CP comment
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
        waterEnvelope: null, // no sourced LS-style single envelope for HP — the two-tier band applies
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
        waterEnvelope: null, // no sourced LS-style single envelope for HP — the two-tier band applies
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
        waterEnvelope: null, // no sourced LS-style single envelope for HP — the two-tier band applies
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
      soapingTempF: '150', // lsMethodForTemp default — low temp's recommended band
      postCookSuperfatTotalPercent: '2',
      postCookSuperfatOils: [{ oilId: 'olive-oil', percent: '2' }],
      processVariant: 'ls', // = variants[0].variant; pinned literally because defaultSettings is part of the record that defines variants[0]
    },
    lyeChoices: ['koh', 'dual'],
    kohBlendRange: [50, 100],
    waterModeChoices: ALL_WATER_MODES,
    capabilities: ['postCook', 'dilution', 'neutralize', 'preserve', 'negativeSuperfat', 'solutionDosing', 'afterCookStage'],
    finishing: 'sequester',
    terms: { finishingLabel: 'Sequester' },
    variants: [
      {
        variant: 'ls',
        process: 'ls',
        label: 'Liquid soap',
        waterBand: null, // no sourced LS band exists — see the WaterBand field doc
        waterEnvelope: [25, 60], // LS:1505 — "25-60% water concentration", % of oils (LS:1491-1493)
        temp: null, // the hold temperature IS the method selector — see soapingTempRangeFor
        finish: null, // temperature-derived via lsMethodForTemp; estimateCure override
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

/** Only LTHP and HTHP cook temps are verified against the roadmap source (item 21, HP row
 * 326) — Fluid HP's temp is a Wave A `// unverified` interpolation and must render hedged
 * ("≈ ... (estimated)"), never presented as authoritative. LS no longer belongs here: its
 * zones (LS_ZONES) are source-verified and its method/hint is derived per-temperature by
 * lsMethodForTemp, not read off this set. Shared by SoapingTemperaturePanel and
 * ProcessGuidePanel so the two panels' verified/estimated hedging can never drift apart. */
export const VERIFIED_TEMP_VARIANTS: ReadonlySet<ProcessVariantId> = new Set([
  'hp-lthp',
  'hp-hthp',
]);

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

/** Slider range + default per variant. Ambient variants (temp: null — CP) span the
 * CP source bands (64–160 °F) with headroom on both sides; the 170 top deliberately lets
 * a user cross the 160 °F overflow line and see the warning fire. Heated variants derive
 * from their cook target: 10 °F of low-side headroom, ceiling (when one exists) as max.
 * LS spans 60–220 °F, default 150 — zones and method derivation live in core's
 * lsMethodForTemp. */
export function soapingTempRangeFor(variant: ProcessVariantId): SoapingTempRange {
  const profile = processProfileById(variant);
  if (profile.temp === null) {
    // LS: the full hold-temperature range — the slider doubles as the method map
    // (lsMethodForTemp). CP keeps its source-band span with overflow headroom.
    return profile.process === 'ls'
      ? { minF: LS_TEMP_MIN_F, maxF: LS_TEMP_MAX_F, defaultF: LS_TEMP_DEFAULT_F }
      : { minF: 60, maxF: 170, defaultF: 125 };
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


/** The process a legacy / process-less recipe belongs to, inferred from its alkali.
 * KOH → ls. Dual is ambiguous, so the blend disambiguates: a KOH-primary blend (> 50%)
 * only fits LS's [50,100] range and infers ls; at/below 50 — including the shave 50/50
 * edge, absent blends, and junk — the bar route stays, where those blends are valid.
 * Without this, a new-format LS dual file (blend 80) with a missing/foreign process tag
 * would park in the CP tab, whose [0,50] range refuses the blend with no fix possible. */
export function processForLyeType(lyeType: unknown, kohBlendPercent?: unknown): ProcessId {
  if (lyeType === 'koh') return 'ls';
  if (lyeType === 'dual') {
    const blend = Number(kohBlendPercent);
    if (Number.isFinite(blend) && blend > 50) return 'ls';
  }
  return 'cp';
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
  // `?? def.lyeChoices[0]` is unreachable today (every process sets an explicit
  // defaultSettings.lyeType) but defaultSettings is a Partial, so a future process that
  // omits it would otherwise fall through to `undefined`. Kept as a defensive default.
  const lyeType = lyeOk ? settings.lyeType : (def.defaultSettings.lyeType ?? def.lyeChoices[0]);
  // DORMANT blend repair (see kohBlendRange's legacy-draft policy): when the RESOLVED lye
  // type is not 'dual', the stored blend is filler that never fed math — an out-of-range
  // value (the pre-range '5' under every legacy LS draft) reseeds to the process default
  // so the first switch to dual starts legal instead of blanking the recipe. An ACTIVE
  // dual blend is a recipe decision and is never rewritten here; the parser owns it.
  const [blendMin, blendMax] = def.kohBlendRange;
  const blendNum = Number(settings.kohBlendPercent);
  const blendOk =
    lyeType === 'dual' ||
    (Number.isFinite(blendNum) && blendNum >= blendMin && blendNum <= blendMax);
  if (lyeOk && variantOk && blendOk) return settings;
  return {
    ...settings,
    lyeType,
    processVariant: variantOk ? settings.processVariant : defaultVariantFor(process),
    kohBlendPercent: blendOk
      ? settings.kohBlendPercent
      : (def.defaultSettings.kohBlendPercent ?? settings.kohBlendPercent),
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
