export type GelLikelihood = 'likely' | 'possible' | 'unlikely' | 'ruled_out';

export type GelPhaseEstimate = { likelihood: GelLikelihood; note: string };

/** A lye solution at (or effectively at) 1:1 cannot reach gel from any soaping
 * temperature — the source puts the threshold above the boiling point of water, and cites
 * a 160 °F start that still refused to gel. 1.1 rather than exactly 1.0 tolerates display
 * rounding around a true 1:1 solution. */
const NO_GEL_RATIO = 1.1;

/** "2:1 or less" is the source's own avoid-gel guidance at normal soaping temperatures. */
const HIGH_WATER_RATIO = 2;

const NOTES: Record<GelLikelihood, string> = {
  likely: 'Expect full gel — deeper colour and a translucent look while hot; the bar firms up sooner.',
  possible:
    'The partial-gel zone: a visible ring where the centre gelled and the edges did not. Step warmer for full gel or cooler to skip it.',
  unlikely: 'Probably no gel — lighter, more matte colour, and the bar needs its full cure to firm up.',
  ruled_out: 'No gel at this water level — there is not enough liquid to carry the batch through it.',
};

/**
 * CP gel-phase likelihood from the two axes the source ties gel to: the starting
 * temperature and the lye-solution water:lye ratio. Gel needs BOTH heat and water, so a
 * shortfall on either axis suppresses it.
 *
 * Deliberate model limits (the source quantifies neither, so neither is modelled):
 * in-lye alternative liquids add liquid this ratio does not see, and sugar-family
 * additives add heat this temperature does not see (sugar_total_high covers that
 * separately). Both make the real gel drive higher than this estimate — it errs cool.
 *
 * CP only: an HP cook drives through gel on purpose, and liquid soap has no gel stage.
 */
export function estimateGelPhase(args: {
  soapingTempF: number;
  waterLyeRatio: number;
}): GelPhaseEstimate {
  const { soapingTempF: t, waterLyeRatio: r } = args;
  const of = (likelihood: GelLikelihood): GelPhaseEstimate => ({ likelihood, note: NOTES[likelihood] });

  if (r <= NO_GEL_RATIO) return of('ruled_out');
  if (t < 80) return of('ruled_out');
  if (t < 100) return of('unlikely');
  if (t < 120) return of(r > HIGH_WATER_RATIO ? 'possible' : 'unlikely');
  if (t < 140) return of(r > HIGH_WATER_RATIO ? 'likely' : 'unlikely');
  return of('likely');
}
