import {
  alternativeLiquidPreset,
  catalogEntryById,
  LS_PRESERVATIVES,
  lsPreservativeById,
} from '@soap-calc/core';
import type { AdditiveStage, DoseBasis, DoseUnit, GelMode, TarLyeTreatment, WaterMode } from '@soap-calc/core';
import { isWeightUnit, type WeightUnit } from './weightUnits';
import { defaultVariantFor, isProcessVariantId, processForLyeType, type ProcessVariantId } from './process';
import { formatInputNumber } from './format';

export type { WeightUnit };

export type RecipeLine = {
  key: string;
  oilId: string;
  weightGrams: string;
  weightPercent?: string;
  tarLyeTreatment?: TarLyeTreatment;
};

export type AdditiveLine = {
  key: string;
  catalogId: string;
  name: string;
  amount: string;
  basis: DoseBasis;
  unit: DoseUnit;
  addAt: AdditiveStage;
};

export type SplitLiquidSizeMode = 'percent_of_oils' | 'grams' | 'percent_of_liquid' | 'rest';

export type SplitLiquidSettings = {
  enabled: boolean;
  /** Key into ALTERNATIVE_LIQUID_GUIDE, or '' for a custom (free-text) liquid. */
  presetKey: string;
  name: string;
  /** For custom liquids only: how much of the liquid is water, as a % (input string).
   * Blank means "treat as pure water". Presets carry their own water fraction. */
  customWaterPercent: string;
  /** How the liquid is sized. The two budget modes (percent_of_liquid, rest) allocate the
   * liquid OUT of the recipe's total-liquid target; the other two are additive (legacy). */
  sizeMode: SplitLiquidSizeMode;
  /** The size input for the chosen mode (unused for 'rest'). */
  amount: string;
  addAt: 'lye' | 'oils' | 'trace';
};

/** One post-cook superfat oil: an oil id and its own % of oil weight (kept as an input
 * string, like every other numeric setting). */
export type PostCookSuperfatOil = {
  oilId: string;
  percent: string;
};

export type RecipeSettings = {
  weightUnit: WeightUnit;
  batchOilGrams: string;
  /** True only when the user typed the batch total (or applied a suggested one);
   * a total derived from line weights follows them instead of locking them. */
  batchSetByUser: boolean;
  superfatPercent: string;
  lyeType: 'naoh' | 'koh' | 'dual';
  kohBlendPercent: string;
  waterMode: WaterMode;
  waterPercentOfOils: string;
  lyeConcentrationPercent: string;
  lyeWaterRatio: string;
  naohPurityPercent: string;
  kohPurityPercent: string;
  splitLiquids: SplitLiquidRow[];
  batchNotes: string;
  /** Total post-cook superfat budget as a % of oil weight — the ceiling the per-oil rows
   * are allocated within (their percents may sum to less, never more). UI/constraint value;
   * the calc uses the actual per-oil sum. */
  postCookSuperfatTotalPercent: string;
  /** Post-cook superfat oils — one or more oils, each with its own % of oil weight, added
   * after the cook. Their percents sum to at most postCookSuperfatTotalPercent. Empty means
   * no post-cook superfat. */
  postCookSuperfatOils: PostCookSuperfatOil[];
  postCookSuperfatMethod: 'append' | 'subtract';
  soapConcentrationPercent: string;
  /** Starting temperature for oils + lye, °F (one figure — the sources pair them).
   * Stored raw; consumers clamp per variant via effectiveSoapingTempF. */
  soapingTempF: string;
  processVariant: ProcessVariantId;
  gelMode: GelMode;
  /** Which preservative the LS dose calculator is sizing. `''` = a custom entry, the same
   * sentinel as an additive's `catalogId`. Recipe state rather than session state because
   * a custom product name that vanishes on reload is worthless — but it is a SETTING, not
   * an ingredient: no preservative mass enters the oil, lye or batch arithmetic. */
  preservativeId: string;
  preservativeCustomName: string;
  preservativeDosePct: string;
  /** True only once the maker has actually touched the picker, the custom name or the
   * dose — mirrors `batchSetByUser`'s "did the maker touch it" idiom. The batch sheet
   * gates its Preservative row on this in addition to the dose tier: the three fields
   * above default to a real, legal Suttocide A dose so the snippet always opens showing
   * a complete worked example, but printing that unrequested choice onto every sheet
   * (including recipes saved before this flag existed) would name a specific commercial
   * product the maker never chose. An absent flag — any recipe saved or exported before
   * this field existed — must default to false, never to true. */
  preservativeSetByUser: boolean;
  /** Water actually poured in, in grams, recorded by a maker diluting gradually (LS:1531
   * — "record how much water you started with and how much additional water you added").
   * Recipe state, not a bench figure: it must survive a reload because it is always on
   * screen, and it is the basis of a preservative dose that is itself recipe state.
   * Blank means no gradual record — the default, and what every legacy recipe means. */
  gradualWaterGrams: string;
};

export function newLineKey(): string {
  return `line-${crypto.randomUUID()}`;
}

export function newAdditiveKey(): string {
  return `additive-${crypto.randomUUID()}`;
}

export const DEFAULT_SPLIT_LIQUID: SplitLiquidSettings = {
  enabled: false,
  presetKey: '',
  name: '',
  customWaterPercent: '',
  sizeMode: 'percent_of_oils',
  amount: '',
  addAt: 'trace',
};

const SPLIT_LIQUID_SIZE_MODES: readonly SplitLiquidSizeMode[] = [
  'percent_of_oils',
  'grams',
  'percent_of_liquid',
  'rest',
];

export const DEFAULT_SETTINGS: RecipeSettings = {
  weightUnit: 'g',
  batchOilGrams: '1000',
  batchSetByUser: false,
  superfatPercent: '5',
  lyeType: 'naoh',
  kohBlendPercent: '5',
  waterMode: 'percent_of_oils',
  waterPercentOfOils: '33',
  lyeConcentrationPercent: '33.33',
  lyeWaterRatio: '2',
  // NaOH is sold at ~97–99.8% (100% isn't attainable); 99% assumes fresh, high-purity lye.
  // KOH flake is ~90% (the rest is water + carbonates) — assuming higher silently builds a
  // hidden superfat that separates after dilution, so 90% is the safe default.
  naohPurityPercent: '99',
  kohPurityPercent: '90',
  splitLiquids: [],
  batchNotes: '',
  postCookSuperfatTotalPercent: '0',
  postCookSuperfatOils: [],
  // Subtract is the default: it reserves the superfat oils from the recipe (and reduces the
  // lye), keeping the batch at exactly the target oil weight and yielding a true superfat %.
  postCookSuperfatMethod: 'subtract',
  soapConcentrationPercent: '30',
  soapingTempF: '125', // CP default — mid of the most-recommended 120–130 °F band
  processVariant: 'cp',
  gelMode: 'natural',
  preservativeId: LS_PRESERVATIVES[0].id,
  preservativeCustomName: '',
  preservativeDosePct: String(LS_PRESERVATIVES[0].defaultPct),
  preservativeSetByUser: false,
  gradualWaterGrams: '',
};

/** One alternative liquid in a recipe: the singleton settings minus the global enable,
 * plus a stable row key. The list itself being non-empty is "enabled". */
export type SplitLiquidRow = Omit<SplitLiquidSettings, 'enabled'> & { key: string };

export function newSplitLiquidKey(): string {
  return `liquid-${crypto.randomUUID()}`;
}

export function normalizeSplitLiquidRow(
  partial: Partial<SplitLiquidRow> | null | undefined,
): SplitLiquidRow {
  const { enabled: _enabled, ...base } = normalizeSplitLiquid(partial ?? undefined);
  return {
    ...base,
    key: typeof partial?.key === 'string' && partial.key !== '' ? partial.key : newSplitLiquidKey(),
  };
}

/** Import/load cap on the settings-nested row-list arrays (split liquids here,
 * post-cook superfat oils below), mirroring recipeFile.ts's MAX_RECIPE_LINES: real recipes
 * carry a handful of extra liquids/oils, not thousands — without a cap, a malformed/hostile
 * settings blob builds an unbounded array + one React row each and hangs the tab. These
 * arrive a level down inside `settings`, so recipeFile.ts's own `lines`/`additives` caps
 * (which reject the whole file) never see them: every load path — file import, a corrupted
 * localStorage draft, and the in-app workspace load — funnels through normalizeSettings
 * instead, which is why the cap lives here rather than in the file parser. Truncated, not
 * rejected — same as MAX_FIELD_LENGTH's per-string truncation — so a recipe the app itself
 * exported still imports. 50, mirroring MAX_RECIPE_ADDITIVES: these lists are additive-like
 * (a handful of optional rows), not primary-ingredient-like (MAX_RECIPE_LINES' 100). */
const MAX_SPLIT_LIQUID_ROWS = 50;

/** Normalize the alternative-liquid rows, migrating the singleton `splitLiquid` shape
 * (enabled → one row, disabled → none). A stored list wins over the legacy field. Only one
 * 'rest' row can exist (it consumes the remainder); later ones demote to percent_of_oils.
 * The list is capped at MAX_SPLIT_LIQUID_ROWS rows (see its doc comment). */
export function normalizeSplitLiquids(
  partial:
    | (Partial<RecipeSettings> & { splitLiquids?: unknown; splitLiquid?: unknown })
    | null
    | undefined,
): SplitLiquidRow[] {
  const list = (partial as { splitLiquids?: unknown } | null | undefined)?.splitLiquids;
  let rows: SplitLiquidRow[];
  if (Array.isArray(list)) {
    rows = list
      .slice(0, MAX_SPLIT_LIQUID_ROWS)
      .filter(isRecord)
      .map((row) => normalizeSplitLiquidRow(row as Partial<SplitLiquidRow>));
  } else {
    const legacy = (partial as { splitLiquid?: unknown } | null | undefined)?.splitLiquid;
    if (isRecord(legacy) && legacy.enabled === true) {
      rows = [normalizeSplitLiquidRow(legacy as Partial<SplitLiquidRow>)];
    } else {
      rows = [];
    }
  }
  let restSeen = false;
  return rows.map((row) => {
    if (row.sizeMode !== 'rest') return row;
    if (!restSeen) {
      restSeen = true;
      return row;
    }
    return { ...row, sizeMode: 'percent_of_oils' as const };
  });
}

export function normalizeSplitLiquid(
  partial: Partial<SplitLiquidSettings> | null | undefined,
): SplitLiquidSettings {
  const addAt =
    partial?.addAt === 'lye' || partial?.addAt === 'oils' || partial?.addAt === 'trace'
      ? partial.addAt
      : DEFAULT_SPLIT_LIQUID.addAt;
  const presetKey =
    typeof partial?.presetKey === 'string' && alternativeLiquidPreset(partial.presetKey)
      ? partial.presetKey
      : '';
  const sizeMode = SPLIT_LIQUID_SIZE_MODES.includes(partial?.sizeMode as SplitLiquidSizeMode)
    ? (partial!.sizeMode as SplitLiquidSizeMode)
    : 'percent_of_oils';
  // Pre-sizeMode recipes carried the size in percentOfOil; migrate it into amount.
  const legacyPercent = (partial as { percentOfOil?: unknown } | null | undefined)?.percentOfOil;
  const amount =
    typeof partial?.amount === 'string'
      ? partial.amount
      : typeof legacyPercent === 'string'
        ? legacyPercent
        : '';
  return {
    enabled: partial?.enabled === true,
    presetKey,
    name: typeof partial?.name === 'string' ? partial.name : '',
    customWaterPercent:
      typeof partial?.customWaterPercent === 'string' ? partial.customWaterPercent : '',
    sizeMode,
    amount,
    addAt,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// A row's percent, clamped into [0, 100] — a recipe file (hand-edited, imported, or from a
// stale save) can carry any string, so this is the load-time half of the guard. It is the
// only half that clamps BOTH sides: live typing goes through SuperfatWaterPanel's
// updatePcsfOil, whose headroom bounds a row from above and lets a negative stand as typed
// (see there). Blank/non-numeric text passes through unclamped (nothing to clamp; downstream
// parsing already treats it as absent). A finite number outside the range snaps to the
// nearest bound: parsePercentOfOil (core) REJECTS — returns null, not a clamped value — for
// anything over 100, so an unclamped '200' row would silently contribute 0 to the
// subtract-mode lye reserve instead of the (visibly clamped) percent the panel shows as
// allocated.
function clampPostCookSuperfatPercent(percent: string): string {
  const n = Number(percent);
  if (!Number.isFinite(n)) return percent;
  if (n > 100) return '100';
  if (n < 0) return '0';
  return percent;
}

/** Import/load cap on the post-cook superfat oil list — same reasoning as
 * MAX_SPLIT_LIQUID_ROWS above (see its doc comment): a settings-nested array that
 * recipeFile.ts's own caps never see, truncated rather than rejected, capped at 50 to match
 * MAX_RECIPE_ADDITIVES' "handful of optional rows" magnitude. */
const MAX_POST_COOK_SUPERFAT_OILS = 50;

// clampPostCookSuperfatPercent bounds each row into [0, 100] but says nothing about the
// RUNNING SUM across rows — an imported file's rows can each be individually legal yet sum
// past 100. That is not just cosmetic: SuperfatWaterPanel's setPcsfTotal only trims the oil
// rows when the typed total is BELOW the allocated sum (see its own comment), so an
// allocated sum already over 100 lets a typed total anywhere up to 100 slip past without
// ever trimming the oils back down — a self-correction gap that normal in-app editing can
// never trigger, because updatePcsfOil's headroom already keeps the running sum at or under
// 100 on every keystroke. Capping the sum here at load time closes the gap by keeping that
// state unreachable in the first place. Later rows lose ground first (order-preserving,
// same rule as normalizeSplitLiquids' one-rest-row demotion).
function capAllocatedSum(oils: PostCookSuperfatOil[]): PostCookSuperfatOil[] {
  let runningSum = 0;
  return oils.map((oil) => {
    const n = Number(oil.percent);
    if (!Number.isFinite(n) || n <= 0) return oil;
    const headroom = Math.max(0, 100 - runningSum);
    if (n <= headroom) {
      runningSum += n;
      return oil;
    }
    runningSum = 100;
    return { ...oil, percent: String(headroom) };
  });
}

/** Normalize the post-cook superfat oils, migrating the pre-multi-oil single-field shape
 * (`postCookSuperfatPercent` + `postCookSuperfatOilId`) into a one-row list. A stored list
 * wins over the legacy fields; each row keeps its raw input string percent, clamped into
 * [0, 100] — see clampPostCookSuperfatPercent — the list itself is capped at
 * MAX_POST_COOK_SUPERFAT_OILS rows, and the running sum of percents is capped at 100 — see
 * capAllocatedSum. */
export function normalizePostCookSuperfatOils(
  partial: Partial<RecipeSettings> & {
    postCookSuperfatPercent?: unknown;
    postCookSuperfatOilId?: unknown;
  },
): PostCookSuperfatOil[] {
  const list = (partial as { postCookSuperfatOils?: unknown }).postCookSuperfatOils;
  if (Array.isArray(list)) {
    const rows = list
      .slice(0, MAX_POST_COOK_SUPERFAT_OILS)
      .filter(
        (row): row is Record<string, unknown> =>
          isRecord(row) && typeof row.oilId === 'string' && row.oilId !== '',
      )
      .map((row) => ({
        oilId: row.oilId as string,
        percent: clampPostCookSuperfatPercent(typeof row.percent === 'string' ? row.percent : ''),
      }));
    return capAllocatedSum(rows);
  }
  // Legacy single-oil shape → one row, only when it carried a real, non-zero percent.
  const legacyOilId = partial.postCookSuperfatOilId;
  const legacyPercent = partial.postCookSuperfatPercent;
  if (
    typeof legacyOilId === 'string' &&
    legacyOilId !== '' &&
    typeof legacyPercent === 'string' &&
    Number(legacyPercent) > 0
  ) {
    return [{ oilId: legacyOilId, percent: clampPostCookSuperfatPercent(legacyPercent) }];
  }
  return [];
}

/** Sum of a post-cook superfat oil list's positive percents. */
export function postCookSuperfatAllocated(oils: PostCookSuperfatOil[]): number {
  return oils.reduce((sum, o) => {
    const n = Number(o.percent);
    return sum + (Number.isFinite(n) && n > 0 ? n : 0);
  }, 0);
}

// The resolved total is bound STRAIGHT into an <input type="number"> (SuperfatWaterPanel's
// budget field), and that element renders NOTHING for a value outside the input's own number
// form: a stored ' 12.34 ' or '+12.34' — reachable from a hand-edited or foreign recipe file
// — left the field empty while the allocation note beside it still printed "12.3%", the
// two-figures-for-one-quantity shape this codebase keeps paying for. Verified in Chromium
// and jsdom alike. So the string is trimmed, and anything still not in that form is replaced
// by the parsed number's own canonical text. Deliberately NOT rounded: a renderable '12.34'
// passes through digit for digit — preserving what the maker typed is the whole point of
// keeping this a passthrough (see the doc comment below).
//
// The pattern is HTML's own "valid floating-point number" production, which is what the
// value-sanitization step tests the field against. Engines are inconsistent at the edges
// (Chromium shows '.5', the production does not admit it), so the stricter production is the
// one worth canonicalizing to: '.5' becomes '0.5', which every engine renders and which
// stands for the same figure.
const INPUT_NUMBER_FORM = /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/;
function inputRenderableTotal(raw: string): string {
  const trimmed = raw.trim().slice(0, MAX_SETTING_FIELD_LENGTH);
  return INPUT_NUMBER_FORM.test(trimmed) ? trimmed : String(Number(trimmed));
}

/** Normalize the post-cook superfat total (the budget/ceiling the oils allocate within).
 * Resolution order: an explicit stored total → the legacy single `postCookSuperfatPercent`
 * → the allocated sum (pre-total recipes from the multi-oil era), then clamped into [0, 100]
 * — the same range SuperfatWaterPanel's setPcsfTotal enforces on a TYPED total, because a
 * clamp is only worth what the loosest way in respects. A budget over 100 is not merely
 * cosmetic: the per-row headroom is `Math.min(100, total − others)`, so a loaded 500% budget
 * hands EVERY row a full 100 to spend, two rows of 100 read "200% of 500% allocated · 300%
 * left", and the next save/load rewrites row 2 to '0' (capAllocatedSum) — the app accepting
 * a number and then losing it. Negatives have no typed string worth keeping and fall to the
 * allocated-sum branch below, which floors them at 0.
 *
 * The floor at the allocated sum is a FLOOR ON THE FIGURE, printed at one decimal: rows of
 * 6.17 + 6.17 with no stored total yield '12.3', a hair under the 12.34 they allocate. Both
 * round to the same 12.3 in the panel's readout, so nothing on screen contradicts itself,
 * but the stored budget can sit a rounding step below the allocation — do not read this as
 * an exact budget-≥-allocation invariant.
 *
 * A winning stored/legacy total keeps its own digits — only length-capped (same as
 * settingString's other fields) and put in a form the budget field can render (see
 * inputRenderableTotal above) — this runs on every draft load, export and import, so it is
 * stored state, not a printed readout, and must not reshape what the maker typed (a typed
 * '12.34' silently becoming '12.3' on the next reload). Nothing downstream needs it
 * pre-rounded: SuperfatWaterPanel binds this string straight into an editable number input
 * (exact fidelity is what that field wants), and separately derives its own rounded "X% of
 * Y% allocated" readout from a parsed Number via its own formatTotal/roundPct — display
 * rounding that already lives at the display, per format.ts's convention.
 *
 * Only the allocated-sum fallback below has no typed string to preserve — it's a number
 * derived from summing the oils' own percents — so formatting it (via format.ts, the shared
 * home for this kind of rounding) is fair game, and also flushes summing float noise (e.g.
 * 0.1 + 0.2) out of what gets stored. */
function normalizePostCookSuperfatTotal(
  partial: (Partial<RecipeSettings> & { postCookSuperfatPercent?: unknown }) | undefined,
  oils: PostCookSuperfatOil[],
): string {
  const allocated = postCookSuperfatAllocated(oils);
  const raw = (partial as { postCookSuperfatTotalPercent?: unknown } | undefined)
    ?.postCookSuperfatTotalPercent;
  const legacy = partial?.postCookSuperfatPercent;
  let stored: string;
  if (typeof raw === 'string' && raw.trim() !== '' && Number.isFinite(Number(raw)) && Number(raw) >= 0) {
    stored = inputRenderableTotal(raw);
  } else if (typeof legacy === 'string' && Number.isFinite(Number(legacy)) && Number(legacy) > 0) {
    stored = inputRenderableTotal(legacy);
  } else {
    stored = formatInputNumber(allocated, 1);
  }
  // Read back off the resolved string, not the raw one, so the ceiling and the floor both
  // judge the value that will actually be stored (the length cap can shorten a long one).
  const total = Number(stored);
  if (total > 100) return '100';
  return total < allocated ? formatInputNumber(allocated, 1) : stored;
}

const WATER_MODES = ['percent_of_oils', 'lye_concentration', 'lye_water_ratio'] as const;
const LYE_TYPES = ['naoh', 'koh', 'dual'] as const;
const GEL_MODES = ['none', 'natural', 'forced'] as const;

function isWaterMode(value: unknown): value is WaterMode {
  return typeof value === 'string' && (WATER_MODES as readonly string[]).includes(value);
}

function isLyeType(value: unknown): value is RecipeSettings['lyeType'] {
  return typeof value === 'string' && (LYE_TYPES as readonly string[]).includes(value);
}

function isGelMode(value: unknown): value is GelMode {
  return typeof value === 'string' && (GEL_MODES as readonly string[]).includes(value);
}

/**
 * Batch provenance for a loaded or imported recipe. An explicit flag wins in both
 * directions. A recipe saved or exported before provenance existed carries no flag, but
 * its total was one the user typed — so infer the lock from the total it actually saved.
 * Defaulting those to derived would silently grow the batch on the next percent edit,
 * overflowing the mold the recipe was sized for.
 *
 * Reads the SAVED total (`partial`), deliberately, not the resolved one: a partial with
 * no total at all resolves to the 1000 g default, which no user typed and must not be
 * locked. Such a recipe stays derived even though the total it returns with is non-empty,
 * so a derived total is not always the sum of the line weights — `syncPercentEdit` treats
 * the total as a fallback rather than assuming that invariant.
 */
function resolveBatchProvenance(partial: Partial<RecipeSettings> | null | undefined): boolean {
  if (partial?.batchSetByUser !== undefined) return partial.batchSetByUser === true;
  const savedBatch = Number(partial?.batchOilGrams ?? '');
  return Number.isFinite(savedBatch) && savedBatch > 0;
}

/** Drop keys an imported/parsed object should never carry into a settings spread.
 * Object spread already defines own props (so it can't pollute Object.prototype the
 * way Object.assign can), but stripping these makes the intent explicit and keeps a
 * hostile recipe file from smuggling a literal "__proto__"/"constructor" own-key into
 * persisted + re-exported settings. Legit settings fields are unaffected. */
const MAX_SETTING_FIELD_LENGTH = 200;
/** Shared with the notes textarea's maxLength so entry and load agree on the cap. */
export const MAX_NOTES_LENGTH = 20_000;

const KNOWN_SETTING_KEYS = new Set(Object.keys(DEFAULT_SETTINGS));
// Legacy fields folded into postCookSuperfatOils by normalizePostCookSuperfatOils — drop
// them so they don't survive as stale "unknown" keys (and get re-exported) after migration.
const MIGRATED_LEGACY_KEYS = new Set(['postCookSuperfatPercent', 'postCookSuperfatOilId']);
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const MAX_UNKNOWN_KEYS = 32;
const MAX_UNKNOWN_VALUE_JSON = 2_000;
const UNKNOWN_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

/** Forward-compat: preserve unknown-but-plausible settings keys (a newer build's
 * fields surviving a rollback) without reopening the junk/prototype hole the
 * whitelist closed — identifier-like names only, no prototype keys, JSON-bounded
 * values, hard key cap. Known fields are spread AFTER this, so they always win. */
function preserveUnknownSettings(
  partial: Partial<RecipeSettings> | undefined,
): Record<string, unknown> {
  if (!partial) return {};
  const pairs: Array<[string, unknown]> = [];
  for (const [key, value] of Object.entries(partial)) {
    if (pairs.length >= MAX_UNKNOWN_KEYS) break;
    if (KNOWN_SETTING_KEYS.has(key) || MIGRATED_LEGACY_KEYS.has(key) || DANGEROUS_KEYS.has(key)) continue;
    if (!UNKNOWN_KEY_PATTERN.test(key)) continue;
    let json: string;
    try {
      json = JSON.stringify(value) ?? '';
    } catch {
      continue;
    }
    if (json === '' || json.length > MAX_UNKNOWN_VALUE_JSON) continue;
    pairs.push([key, value]);
  }
  // fromEntries creates own data properties (prototype-safe by construction).
  return Object.fromEntries(pairs);
}

/** Whitelist coercion for one free-text settings field: strings pass (length-capped),
 * finite numbers coerce losslessly (hand-edited files), anything else falls back.
 * Building settings from known keys only replaces the old blocklist spread, which let
 * arbitrary junk (including `Object.entries('abc')` index keys) into state and storage. */
function settingString(value: unknown, fallback: string, maxLength = MAX_SETTING_FIELD_LENGTH): string {
  if (typeof value === 'string') return value.slice(0, maxLength);
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return fallback;
}

export function normalizeSettings(
  rawPartial: Partial<RecipeSettings> | null | undefined,
): RecipeSettings {
  // A corrupted draft/import can hand us any JSON value here; only a plain object
  // carries usable fields (a string would spread index keys via Object semantics).
  const partial =
    typeof rawPartial === 'object' && rawPartial !== null && !Array.isArray(rawPartial)
      ? rawPartial
      : undefined;
  const weightUnit = isWeightUnit(partial?.weightUnit)
    ? partial.weightUnit
    : DEFAULT_SETTINGS.weightUnit;
  const waterMode = isWaterMode(partial?.waterMode)
    ? partial.waterMode
    : DEFAULT_SETTINGS.waterMode;
  const lyeType = isLyeType(partial?.lyeType) ? partial.lyeType : DEFAULT_SETTINGS.lyeType;
  // Subtract is the default (true superfat %, exact batch total); only an explicit 'append'
  // opts out.
  const postCookSuperfatMethod =
    partial?.postCookSuperfatMethod === 'append' ? 'append' : 'subtract';
  // A recipe saved or exported before sub-variants existed has no processVariant at all,
  // and a hand-edited or corrupted one may carry a stale/invalid string. Either way, fall
  // back to the variant the recipe's own alkali implies (KOH → an LS variant, else CP) —
  // not a fixed constant — so a legacy liquid-soap recipe doesn't silently normalize to CP.
  //
  // This fallback is a best-effort PRE-COERCE default, not an authoritative process/variant
  // pairing: `processForLyeType` routes dual-lye by its KOH blend (KOH-primary → ls, else
  // 'cp'), so a dual-lye liquid-soap recipe with no saved variant and no legible blend
  // lands here as a CP variant even
  // though its true process may be LS. A stale-but-structurally-valid variant string is
  // also trusted as-is and not cross-checked against the recipe's process. Any caller that
  // needs an authoritative variant MUST run the result through `normalizeSettingsWithinProcess`
  // with the recipe's actual (known) process — that is what reconciles variant vs. process
  // everywhere in the app (loadWorkspace uses the draft's own process key; import uses the
  // file's process). Do not read `processVariant` off a freshly normalized recipe as
  // ground truth before that coercion has run.
  const processVariant = isProcessVariantId(partial?.processVariant)
    ? partial.processVariant
    : defaultVariantFor(processForLyeType(lyeType));
  const d = DEFAULT_SETTINGS;
  // Bound once, the way normalizeAdditiveLine's rawCatalogId is, rather than calling
  // settingString twice for the same value.
  const rawPreservativeId = settingString(partial?.preservativeId, d.preservativeId);
  return {
    ...preserveUnknownSettings(partial),
    weightUnit,
    waterMode,
    lyeType,
    postCookSuperfatMethod,
    processVariant,
    gelMode: isGelMode(partial?.gelMode) ? partial.gelMode : DEFAULT_SETTINGS.gelMode,
    batchSetByUser: resolveBatchProvenance(partial),
    splitLiquids: normalizeSplitLiquids(partial),
    batchOilGrams: settingString(partial?.batchOilGrams, d.batchOilGrams),
    superfatPercent: settingString(partial?.superfatPercent, d.superfatPercent),
    kohBlendPercent: settingString(partial?.kohBlendPercent, d.kohBlendPercent),
    waterPercentOfOils: settingString(partial?.waterPercentOfOils, d.waterPercentOfOils),
    lyeConcentrationPercent: settingString(partial?.lyeConcentrationPercent, d.lyeConcentrationPercent),
    lyeWaterRatio: settingString(partial?.lyeWaterRatio, d.lyeWaterRatio),
    naohPurityPercent: settingString(partial?.naohPurityPercent, d.naohPurityPercent),
    kohPurityPercent: settingString(partial?.kohPurityPercent, d.kohPurityPercent),
    batchNotes: settingString(partial?.batchNotes, d.batchNotes, MAX_NOTES_LENGTH),
    postCookSuperfatTotalPercent: normalizePostCookSuperfatTotal(
      partial ?? {},
      normalizePostCookSuperfatOils(partial ?? {}),
    ),
    postCookSuperfatOils: normalizePostCookSuperfatOils(partial ?? {}),
    soapConcentrationPercent: settingString(partial?.soapConcentrationPercent, d.soapConcentrationPercent),
    soapingTempF: settingString(partial?.soapingTempF, d.soapingTempF),
    // An id the table no longer resolves becomes a custom entry KEEPING the typed name —
    // the same degradation normalizeAdditiveLine applies to a stale catalogId. '' is
    // already a custom entry and passes through untouched.
    preservativeId: lsPreservativeById(rawPreservativeId) ? rawPreservativeId : '',
    preservativeCustomName: settingString(partial?.preservativeCustomName, d.preservativeCustomName),
    preservativeDosePct: settingString(partial?.preservativeDosePct, d.preservativeDosePct),
    // Mirrors resolveBatchProvenance's "explicit flag or false" half — but with no total to
    // infer from, an absent flag (every recipe saved before this field existed) must mean
    // false outright, never true. See the field's own doc for why that direction matters.
    preservativeSetByUser: partial?.preservativeSetByUser === true,
    gradualWaterGrams: settingString(partial?.gradualWaterGrams, d.gradualWaterGrams),
  };
}

export function createEmptyAdditives(): AdditiveLine[] {
  return [];
}

export function normalizeAdditiveLine(
  partial: Partial<AdditiveLine> & { percentOfOil?: string } & Pick<AdditiveLine, 'key'>,
): AdditiveLine {
  const addAt =
    partial.addAt === 'lye' ||
    partial.addAt === 'oils' ||
    partial.addAt === 'trace' ||
    partial.addAt === 'top' ||
    partial.addAt === 'after_cook'
      ? partial.addAt
      : 'trace';
  const basis = partial.basis === 'batch' ? 'batch' : partial.basis === 'solution' ? 'solution' : 'oil';
  const unit = partial.unit === 'ppt' ? 'ppt' : 'percent';
  const amount =
    typeof partial.amount === 'string'
      ? partial.amount
      : typeof partial.percentOfOil === 'string'
        ? partial.percentOfOil
        : '';
  // A catalogId that no longer resolves (e.g. the removed 'jojoba' entry in a saved recipe)
  // becomes a custom row — the name is kept, so the line survives as free text rather than a
  // broken catalog pick whose <select> has no matching <option>.
  const rawCatalogId = typeof partial.catalogId === 'string' ? partial.catalogId : '';
  const catalogId = rawCatalogId !== '' && catalogEntryById(rawCatalogId) ? rawCatalogId : '';
  return {
    key: partial.key,
    catalogId,
    name: typeof partial.name === 'string' ? partial.name : '',
    amount,
    basis,
    unit,
    addAt,
  };
}

export function additivesFromSaved(
  saved: Array<Omit<AdditiveLine, 'key'>> | undefined,
): AdditiveLine[] {
  if (!saved?.length) return createEmptyAdditives();
  return saved.map((line) => normalizeAdditiveLine({ key: newAdditiveKey(), ...line }));
}

export function migrateRecipeLines(
  lines: RecipeLine[],
  settings: Pick<RecipeSettings, 'batchOilGrams'>,
): RecipeLine[] {
  const batch = Number(settings.batchOilGrams);
  if (!Number.isFinite(batch) || batch <= 0) return lines;
  return lines.map((line) => {
    if (line.weightGrams !== '' || !line.weightPercent) return line;
    const pct = Number(line.weightPercent);
    if (!Number.isFinite(pct) || pct <= 0) return line;
    return { ...line, weightGrams: String(Math.round((batch * pct) / 100)) };
  });
}

export function createStarterLines(): RecipeLine[] {
  return [
    { key: newLineKey(), oilId: 'olive-oil', weightGrams: '450', weightPercent: '45' },
    { key: newLineKey(), oilId: 'coconut-oil-76', weightGrams: '250', weightPercent: '25' },
    { key: newLineKey(), oilId: 'shea-butter', weightGrams: '300', weightPercent: '30' },
  ];
}

