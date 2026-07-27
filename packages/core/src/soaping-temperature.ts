export type SoapingTempEffect = 'accelerated' | 'average' | 'slowed';

export type SoapingTempBand = {
  /** Display range (°F) as the reference presents it — bands overlap and the bottom one
   * is open-ended downward, so resolution uses thresholds (see soapingTempBand), not
   * these bounds. */
  lowF: number;
  highF: number;
  effect: SoapingTempEffect;
  /** Behavior-only guidance shown under the temperature slider. Original copy. */
  note: string;
};

/** CP starting-temperature bands (oils + lye share one starting temperature), highest
 * first. Verified constants; the notes are qualitative behavior, including the gel
 * tendency each band carries — full gel prediction (temperature × water) is a designed
 * follow-up, deliberately not modelled here. */
export const CP_SOAPING_TEMP_BANDS: readonly SoapingTempBand[] = [
  {
    lowF: 140,
    highF: 160,
    effect: 'accelerated',
    note: 'Fast trace — suits high-melting fats (stearic, palmitic, beeswax) and slow movers like castile. Expect gel unless the water is very low.',
  },
  {
    lowF: 120,
    highF: 130,
    effect: 'average',
    note: 'The most commonly recommended starting range. Gel or partial gel is likely at higher water; keep the solution at 2:1 or stronger to avoid it.',
  },
  {
    lowF: 80,
    highF: 100,
    effect: 'slowed',
    note: 'Slower trace — the usual choice for higher water, sugars, purées, or high castor. Gel is unlikely below 100 °F.',
  },
  {
    lowF: 64,
    highF: 86,
    effect: 'slowed',
    note: 'Slowest — for high water, milks, or high sugar/sorbitol. Removes the risk of gel phase.',
  },
];

/** The band a CP starting temperature falls in. Total by design: thresholds ≥140 / ≥120 /
 * ≥80 / below — the reference's bands overlap (86–100 sits in two) and its bottom band is
 * "or lower", so range-containment would leave holes at both ends. */
export function soapingTempBand(tempF: number): SoapingTempBand {
  if (tempF >= 140) return CP_SOAPING_TEMP_BANDS[0];
  if (tempF >= 120) return CP_SOAPING_TEMP_BANDS[1];
  if (tempF >= 80) return CP_SOAPING_TEMP_BANDS[2];
  return CP_SOAPING_TEMP_BANDS[3];
}

/** Above this CP starting temperature, mold-overflow (volcano) risk rises sharply.
 * The reference prints the figure as "160°C / 71°C" — a °F/°C typo (71 °C IS 160 °F, and
 * its own band table caps at 160 °F). Read as 160 °F; do not "correct" to 160 °C. */
export const CP_OVERFLOW_RISK_F = 160;

/** °F → rounded °C for the two-unit display ("52 °C (125 °F)"). */
export function fToC(tempF: number): number {
  return Math.round(((tempF - 32) * 5) / 9);
}

/** °C → rounded °F. The stored setting and every source constant here are °F; the UI
 * edits in °C and converts at that boundary. Round-trips stably at 1 °C steps
 * (52 °C → 126 °F → 52 °C), which is what keeps the input from fighting the user. */
export function cToF(tempC: number): number {
  return Math.round((tempC * 9) / 5 + 32);
}
