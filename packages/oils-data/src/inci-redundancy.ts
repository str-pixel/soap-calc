import { normalizeInciName } from './normalize-inci.js';

/**
 * True when the raw FNWL-chart INCI text now matches the (authoritative) `inciCorrections`
 * name, modulo case/whitespace/punctuation — meaning the correction override is no longer
 * changing anything and could be retired. Both sides are normalized before comparing, since
 * `inciCorrections` entries are deliberately un-normalized (they mirror CosIng casing).
 */
export function isInciCorrectionRedundant(
  fnwlChartInci: string | undefined,
  correctionInci: string,
): boolean {
  if (!fnwlChartInci) return false;
  return normalizeInciName(fnwlChartInci) === normalizeInciName(correctionInci);
}
