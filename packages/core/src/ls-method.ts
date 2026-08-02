/**
 * Liquid-soap method derived from the SUSTAINED HOLD temperature (crockpot / heat-source
 * setting held through saponification and dilution) — NOT the oil-melt temperature (CPLS
 * melts oils at 120–130 °F yet applies no sustained heat). Zones, gap ownership, labels,
 * sequester windows and guide stages all live here and nowhere else.
 * Spec: docs/superpowers/specs/2026-08-01-ls-temperature-method-redesign-design.md.
 */
import { fToC } from './soaping-temperature.js';

export type LsMethod = 'cold' | 'lowtemp' | 'hightemp';

export type LsSequesterWindow = { minWeeks: number; maxWeeks?: number };

/** Structured hold figures for the panels to format themselves (dual-unit, their own
 * phrasing) instead of re-parsing prose notes. Null for cold (no sustained hold). */
export type LsMethodHold = {
  lowF: number;
  highF: number;
  recommendedLowF?: number;
  ceilingF?: number;
};

export type LsMethodInfo = {
  method: LsMethod;
  label: string;
  /** True in 100–120 (owned by low temp) and 160–215 (owned by high temp). */
  inGap: boolean;
  /** Honest gap copy; null inside a zone. */
  note: string | null;
  sequester: LsSequesterWindow;
  /** Structured hold range — see {@link LsMethodHold}. Null for cold. */
  hold: LsMethodHold | null;
};

export const LS_TEMP_MIN_F = 60;
export const LS_TEMP_MAX_F = 220; // sourced ceiling — "not advisable above 220F"
export const LS_TEMP_DEFAULT_F = 150; // inside low temp's recommended 140–160

/** Zone edges, °F. Membership is a >=/< cascade; each edge belongs to the region above it
 * (100 → gap, 120 → low, 160 → gap, 215 → high; 220 inclusive via clamp). */
export const LS_ZONES = {
  coldMaxF: 100, // unsourced convention — cold process is defined by NO sustained heat
  lowMinF: 120,
  lowRecommendedMinF: 140,
  lowMaxF: 160,
  highMinF: 215,
} as const;

const LABELS: Record<LsMethod, string> = {
  cold: 'Cold-process LS',
  lowtemp: 'Low-temp LS',
  hightemp: 'High-temp LS',
};

/** Per-method sequester windows (sourced; see spec). Low temp publishes only a floor. */
const SEQUESTER: Record<LsMethod, LsSequesterWindow> = {
  cold: { minWeeks: 1, maxWeeks: 4 },
  lowtemp: { minWeeks: 1 },
  hightemp: { minWeeks: 1, maxWeeks: 2 },
};

/** Temperatures in user-facing copy render °C-first with the stored °F in parentheses
 * ("102 °C (215 °F)"), matching the temperature panel's readout convention — the panel
 * edits in °C, and single-unit °F copy made users convert by hand. */
const dual = (f: number) => `${fToC(f)} °C (${f} °F)`;
const dualRange = (lowF: number, highF: number) =>
  `${fToC(lowF)}–${fToC(highF)} °C (${lowF}–${highF} °F)`;

/** Behavior-only method steps, rendered by the process guide. The ≥2× vessel line on high
 * temp is mandatory in the source; coconut-heavy recipes get the stricter 3× via the
 * ls_coconut_hot_cook insight. */
export const LS_METHOD_STAGES: Record<LsMethod, readonly string[]> = {
  cold: [
    `Melt the oils at ${dualRange(120, 130)} and let the lye solution cool — no sustained heat after this.`,
    'Blend oils and lye to a thick trace.',
    'Cover and insulate, and let the paste saponify on its own heat, 12–48 hours (slow recipes take longer).',
    'Run the clarity test: stir a little paste into hot water — clear means ready, milky means wait.',
    'Dilute with room-temperature or warm distilled water to the target soap concentration — no external heat here either.',
  ],
  lowtemp: [
    'Melt the oils in the cook vessel at the hold temperature.',
    'Add the lye solution and blend to trace.',
    `Hold ${dualRange(LS_ZONES.lowMinF, LS_ZONES.lowMaxF)}, stirring now and then, until the paste passes the clarity test.`,
    'Dilute with hot distilled water, keeping the low heat on until fully dissolved.',
  ],
  hightemp: [
    'Use a cook vessel at least 2× the total recipe volume — the hot cook expands.',
    `Heat the oils to the ${dual(LS_ZONES.highMinF)} hold and add the hot lye solution.`,
    'Blend continuously through the cook stages until the paste passes the clarity test.',
    'Dilute with hot water at heat, or portion off as paste for later dilution.',
  ],
};

const GAP_LOW_NOTE =
  `Below the low-temp band — bring the hold up to ${dualRange(LS_ZONES.lowMinF, LS_ZONES.lowMaxF)} — ${dualRange(LS_ZONES.lowRecommendedMinF, LS_ZONES.lowMaxF)} recommended — or drop the heat entirely for cold-process LS.`;
const GAP_HIGH_NOTE =
  `Running the high-temp method below its ${dual(LS_ZONES.highMinF)} start — the cook still works, but expect slower stage progression than at ${dual(LS_ZONES.highMinF)}.`;

const LOWTEMP_HOLD: LsMethodHold = {
  lowF: LS_ZONES.lowMinF,
  highF: LS_ZONES.lowMaxF,
  recommendedLowF: LS_ZONES.lowRecommendedMinF,
};
const HIGHTEMP_HOLD: LsMethodHold = {
  lowF: LS_ZONES.highMinF,
  highF: LS_ZONES.highMinF,
  ceilingF: LS_TEMP_MAX_F,
};

// The function has exactly 5 possible outputs (cold, low-gap, low, high-gap, high).
// Precomputed once and frozen so lsMethodForTemp returns an IDENTITY-STABLE object per
// zone across calls — a downstream React.memo/useMemo keyed on this value never busts
// just because the user nudged the slider within the same zone.
const RESULTS: Record<'cold' | 'lowGap' | 'low' | 'highGap' | 'high', LsMethodInfo> = {
  cold: Object.freeze({
    method: 'cold',
    label: LABELS.cold,
    inGap: false,
    note: null,
    sequester: SEQUESTER.cold,
    hold: null,
  }),
  lowGap: Object.freeze({
    method: 'lowtemp',
    label: LABELS.lowtemp,
    inGap: true,
    note: GAP_LOW_NOTE,
    sequester: SEQUESTER.lowtemp,
    hold: LOWTEMP_HOLD,
  }),
  low: Object.freeze({
    method: 'lowtemp',
    label: LABELS.lowtemp,
    inGap: false,
    note: null,
    sequester: SEQUESTER.lowtemp,
    hold: LOWTEMP_HOLD,
  }),
  highGap: Object.freeze({
    method: 'hightemp',
    label: LABELS.hightemp,
    inGap: true,
    note: GAP_HIGH_NOTE,
    sequester: SEQUESTER.hightemp,
    hold: HIGHTEMP_HOLD,
  }),
  high: Object.freeze({
    method: 'hightemp',
    label: LABELS.hightemp,
    inGap: false,
    note: null,
    sequester: SEQUESTER.hightemp,
    hold: HIGHTEMP_HOLD,
  }),
};

export function lsMethodForTemp(tempF: number): LsMethodInfo {
  const t = Number.isFinite(tempF)
    ? Math.min(LS_TEMP_MAX_F, Math.max(LS_TEMP_MIN_F, tempF))
    : LS_TEMP_DEFAULT_F;
  if (t < LS_ZONES.coldMaxF) return RESULTS.cold;
  if (t < LS_ZONES.lowMinF) return RESULTS.lowGap;
  if (t < LS_ZONES.lowMaxF) return RESULTS.low;
  if (t < LS_ZONES.highMinF) return RESULTS.highGap;
  return RESULTS.high;
}
