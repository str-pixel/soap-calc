/**
 * Liquid-soap method derived from the SUSTAINED HOLD temperature (crockpot / heat-source
 * setting held through saponification and dilution) — NOT the oil-melt temperature (CPLS
 * melts oils at 120–130 °F yet applies no sustained heat). Zones, gap ownership, labels,
 * sequester windows and guide stages all live here and nowhere else.
 * Spec: docs/superpowers/specs/2026-08-01-ls-temperature-method-redesign-design.md.
 */
export type LsMethod = 'cold' | 'lowtemp' | 'hightemp';

export type LsSequesterWindow = { minWeeks: number; maxWeeks?: number };

export type LsMethodInfo = {
  method: LsMethod;
  label: string;
  /** True in 100–120 (owned by low temp) and 160–215 (owned by high temp). */
  inGap: boolean;
  /** Honest gap copy; null inside a zone. */
  note: string | null;
  sequester: LsSequesterWindow;
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

/** Behavior-only method steps, rendered by the process guide. The ≥2× vessel line on high
 * temp is mandatory in the source; coconut-heavy recipes get the stricter 3× via the
 * ls_coconut_hot_cook insight. */
export const LS_METHOD_STAGES: Record<LsMethod, readonly string[]> = {
  cold: [
    'Melt the oils at 120–130 °F and let the lye solution cool — no sustained heat after this.',
    'Blend oils and lye to a thick trace.',
    'Cover and let the paste saponify on its own heat, 12–48 hours (slow recipes take longer).',
    'Run the clarity test: stir a little paste into hot water — clear means ready, milky means wait.',
    'Dilute with hot distilled water to the target soap concentration.',
  ],
  lowtemp: [
    'Melt the oils in the cook vessel at the hold temperature.',
    'Add the lye solution and blend to trace.',
    'Hold 120–160 °F, stirring now and then, until the paste passes the clarity test.',
    'Dilute with hot distilled water, keeping the low heat on until fully dissolved.',
  ],
  hightemp: [
    'Use a cook vessel at least 2× the total recipe volume — the hot cook expands.',
    'Heat the oils to the 215 °F hold and add the hot lye solution.',
    'Blend continuously through the cook stages until the paste passes the clarity test.',
    'Dilute with hot water at heat, or portion off as paste for later dilution.',
  ],
};

const GAP_LOW_NOTE =
  'Below the low-temp band — bring the hold up to 120–160 °F (140–160 recommended), or drop the heat entirely for cold-process LS.';
const GAP_HIGH_NOTE =
  'Running the high-temp method below its 215 °F start — the cook still works, but expect slower stage progression than at 215 °F.';

export function lsMethodForTemp(tempF: number): LsMethodInfo {
  const t = Number.isFinite(tempF)
    ? Math.min(LS_TEMP_MAX_F, Math.max(LS_TEMP_MIN_F, tempF))
    : LS_TEMP_DEFAULT_F;
  const build = (method: LsMethod, inGap: boolean, note: string | null): LsMethodInfo => ({
    method,
    label: LABELS[method],
    inGap,
    note,
    sequester: SEQUESTER[method],
  });
  if (t < LS_ZONES.coldMaxF) return build('cold', false, null);
  if (t < LS_ZONES.lowMinF) return build('lowtemp', true, GAP_LOW_NOTE);
  if (t < LS_ZONES.lowMaxF) return build('lowtemp', false, null);
  if (t < LS_ZONES.highMinF) return build('hightemp', true, GAP_HIGH_NOTE);
  return build('hightemp', false, null);
}
