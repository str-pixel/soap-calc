import { additiveMatches } from '@soap-calc/core';

/** The 30-minute no-paste package: glycerin (split-liquid row or additive — the caller
 * passes the vm's existing union) AND salt-or-sodium-lactate. Sugar strengthens the
 * workflow but never gates detection — verified against every sourced 30-min recipe
 * (see the redesign spec). Temperature is deliberately NOT an input: the caller only
 * consults this when the derived method is already high temp. */
export function ls30MinPackagePresent(args: {
  lsGlycerinPresent: boolean;
  additives: ReadonlyArray<{ catalogId: string; name: string; grams: number }>;
}): boolean {
  if (!args.lsGlycerinPresent) return false;
  const active = args.additives.filter((a) => a.grams > 0);
  return (
    additiveMatches(active, 'salt', 'salt') ||
    additiveMatches(active, 'sodium-lactate', 'sodium lactate')
  );
}
