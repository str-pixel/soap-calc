import type { AdditiveStage } from '@soap-calc/core';

/**
 * Which glycerin counts as the COOK's solvent.
 *
 * Glycerin reaches a liquid-soap recipe by two routes, and only one of them is a solvent:
 * entered before or during the cook it dissolves the alkali, speeds saponification and
 * cuts the dilution water; stirred into finished soap it is an emollient and a humectant
 * and nothing else — there is no paste left for it to dissolve. Three gates ask this same
 * question (the 30-minute no-paste package's solvent floor, the solvent advisory, and the
 * extras-load sum, which is the mirror image: what is not solvent IS extras), so they ask
 * it in one place rather than each matching on the catalog id alone.
 *
 * The `glycerin` catalog entry is after-dilution only now, so for lines created since that
 * change this is false by construction. It stays a stage test, not a constant, because
 * recipes saved BEFORE it hold glycerin lines staged in the lye water — those really were
 * the cook's solvent and must keep counting as one.
 */
export function isCookGlycerin(line: { catalogId?: string; addAt?: AdditiveStage }): boolean {
  return line.catalogId === 'glycerin' && line.addAt !== 'after_cook';
}
