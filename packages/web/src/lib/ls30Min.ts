import { additiveMatches, wordBoundaryMatch } from '@soap-calc/core';

const MAGNESIUM_KEYWORDS = ['epsom', 'magnesium', 'dead sea'];

/** The 30-minute no-paste package. Three sourced gates:
 * (1) glycerin at SOLVENT scale — the source doses it 1–2× the lye weight (20–25% of
 *     oils); a token line is not the no-paste workflow, so the floor is 1× lye;
 * (2) salt or sodium lactate — sodium salts only: magnesium-bearing names (Epsom,
 *     Dead Sea) wreck soap (see magnesium_salt_scum) and never complete the package;
 * (3) temperature is NOT an input — the caller gates on the in-zone high-temp method
 *     (215 °F+), never the gap, because the usable-once-cooled clause is sourced only
 *     for the full 30-minute workflow. */
export function ls30MinPackagePresent(args: {
  glycerinGrams: number;
  lyeGrams: number;
  additives: ReadonlyArray<{ catalogId: string; name: string; grams: number }>;
}): boolean {
  if (!(args.lyeGrams > 0) || !(args.glycerinGrams >= args.lyeGrams)) return false;
  const active = args.additives.filter((a) => a.grams > 0);
  const sodiumOnly = active.filter(
    (a) => !MAGNESIUM_KEYWORDS.some((k) => wordBoundaryMatch(a.name, k)),
  );
  return (
    additiveMatches(sodiumOnly, 'salt', 'salt') ||
    additiveMatches(active, 'sodium-lactate', 'sodium lactate')
  );
}
