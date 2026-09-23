import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CanonicalOilDatabase } from './schema.js';

const db = CanonicalOilDatabase.parse(
  JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../data/canonical-oils.json'), 'utf8')),
);
const sapNaohFor = (id: string) => {
  const oil = db.oils.find((o) => o.id === id);
  if (!oil) throw new Error(`no such oil: ${id}`);
  return oil.sapNaoh;
};

/**
 * A worked hot-process example published with its own lye figure, recomputed against the
 * SAP values this package ships. Numbers only — the blend, the superfat and the printed
 * alkali weight (HP:9860).
 *
 * Two jobs, and the second is why it exists:
 *
 * 1. An independent cross-check of five shipped SAP values. Nothing else in this repo tests
 *    them against an outside worked answer; the deviation classifiers compare our sources
 *    to each other. If resolution moves any of these five, this notices.
 *
 * 2. It makes a CITED CLAIM EXECUTABLE. This repo carries ~440 source citations in
 *    comments and not one of them is checked by anything, so a citation that is simply
 *    wrong reads exactly like one that is right. A comment in useRecipeViewModel.ts leans
 *    on this example being append-style — lye sized to the FULL oils, the post-cook reserve
 *    added on top — and that is the part asserted here rather than asserted in prose.
 */
describe('a published worked example reproduces under the shipped SAP values', () => {
  // Mass fractions of the published blend.
  const BLEND: ReadonlyArray<readonly [string, number]> = [
    ['castor-oil', 0.12],
    ['coconut-oil-76', 0.2],
    ['olive-oil', 0.2],
    ['palm-oil', 0.4],
    ['stearic-acid', 0.08],
  ];
  const OIL_GRAMS = 907.2;
  const SUPERFAT = 0.02;
  const PRINTED_NAOH_GRAMS = 130.8;
  /** The published post-cook reserve, as a share of the oil weight. */
  const RESERVE_SHARE = 0.05;

  const naohFor = (grams: number) =>
    BLEND.reduce((sum, [id, fraction]) => sum + fraction * sapNaohFor(id), 0) * grams * (1 - SUPERFAT);

  it('matches the printed alkali weight to a tenth of a gram', () => {
    // Printed to 0.1 g, so that is the tolerance it can be held to.
    expect(naohFor(OIL_GRAMS)).toBeCloseTo(PRINTED_NAOH_GRAMS, 1);
  });

  it('is sized to the FULL oils, so it is an append-style example', () => {
    // The distinction a comment elsewhere depends on: under the subtract method the lye
    // would be sized to the oils LESS the reserve, which lands ~6.6 g lower and nowhere
    // near the printed figure. A published table is therefore evidence about where the
    // reserve sits in the batch, never about how the subtract path composes its base.
    const trimmed = naohFor(OIL_GRAMS * (1 - RESERVE_SHARE));
    expect(Math.abs(trimmed - PRINTED_NAOH_GRAMS)).toBeGreaterThan(5);
    expect(Math.abs(naohFor(OIL_GRAMS) - PRINTED_NAOH_GRAMS)).toBeLessThan(0.5);
  });
});
