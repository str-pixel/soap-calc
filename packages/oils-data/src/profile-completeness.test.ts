import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MIN_MAPPED_PERCENT } from '@soap-calc/core';
import { incompleteProfileOils, MAX_PROFILE_SUM_PERCENT, overfullProfileOils } from './profile-completeness.js';
import type { CanonicalOilDatabase } from './schema.js';

const dataPath = join(dirname(fileURLToPath(import.meta.url)), '../data/canonical-oils.json');
const db = JSON.parse(readFileSync(dataPath, 'utf8')) as CanonicalOilDatabase;

// Same "complete enough" threshold the derivation gate uses. For current data every stored
// fatty-acid key is a mapped acid, so raw profile sum == mapped percent.
const COMPLETENESS_THRESHOLD_PCT = MIN_MAPPED_PERCENT;

/**
 * Property-ready oils whose fatty-acid profile sums below the threshold.
 *
 * ORIGIN (traced): the legacy source (soap_oils.json ≈ SoapCalc) tracks a fixed 8-acid schema
 * (lauric, myristic, palmitic, stearic, ricinoleic, oleic, linoleic, linolenic). palmitoleic,
 * behenic, and arachidic have no column at all; caprylic/capric/eicosenoic/erucic only appear
 * when an acid *dominates* an oil. So oils where an untracked acid is significant-but-not-dominant
 * sum short — the gap IS the untracked-acid content (coconut's ~13% C8/C10, mustard's ~40% erucic,
 * macadamia's ~20% palmitoleic). 26 of these 27 use only SoapCalc-tracked acids, confirming the cause.
 *
 * This set is the backlog for the Phase 5 USDA FoodData Central backfill (which carries the missing
 * acids in C:D notation). A NEW id appearing here means a freshly-added oil shipped a truncated
 * profile and needs backfill/review; a REMOVED id means a backfill succeeded — update this list.
 */
const KNOWN_INCOMPLETE_PROFILES = new Set<string>([
  // rapeseed-oil-canola was here — Phase 5 gap-filled it as high-erucic rapeseed (see PROFILE_BACKFILL).
  // mustard-oil-kachi-ghani — Phase 5 gap-filled to 100% (high-erucic, Codex + literature).
  // pracaxi-seed-oil — Phase 5 FULL REPLACE (was 54%, legacy dropped ~31% C22:0/C24:0); see PROFILE_BACKFILL.
  'sea-buckthorn-oil-seed-and-berry',
  // soybean-27-5-hydrogenated — Phase 5 backfill via the new elaidic (trans-C18:1) key; see PROFILE_BACKFILL.
  'macadamia-nut-butter',
  'tallow-sheep',
  // coconut-oil-92 — Phase 5 backfill (hydrogenation transform of CODEX_COCONUT); restored C8/C10 + fixed the
  // profile to reflect hydrogenation. See PROFILE_BACKFILL.
  'tallow-bear',
  // avocado-oil was here — Phase 5 backfilled it to 100% from USDA FDC (see PROFILE_BACKFILL).
  'avocado-butter',
  // japan-wax joined this list when SAP reclassified it from "wax" to the triglyceride it is
  // (215 mg KOH/g). Its 92% is NOT the legacy 8-acid truncation above and no backfill will clear
  // it: the balance is dibasic acids (japanic C21, eicosanedioic C20) that our model has no key
  // for, since they are diacids rather than fatty acids. Leaving it short is the honest reading —
  // it understates rather than inflates, which the lower-bound thresholds are safe against.
  'japan-wax',
]);

describe('fatty-acid profile completeness (catalog guard)', () => {
  it('only the known SoapCalc-truncated oils have incomplete profiles', () => {
    const ids = incompleteProfileOils(db.oils, COMPLETENESS_THRESHOLD_PCT).map((o) => o.id);
    expect(ids.sort()).toEqual([...KNOWN_INCOMPLETE_PROFILES].sort());
  });
});

/**
 * Lauric-oil MCT guard — catches a truncation class the completeness gate above CANNOT see.
 *
 * Natural C12-dominant palm / palm-kernel oils (coconut, palm kernel, babassu, murumuru, cohune,
 * tucumã…) all biosynthesize caprylic (C8:0) + capric (C10:0) alongside lauric/myristic via the
 * same medium-chain acyl-ACP thioesterase pathway. A lauric-dominant oil with LITERALLY ZERO
 * C8/C10 is therefore a truncation artifact, not a real composition. But because lauric+myristic
 * dominate, such a profile still sums ≥93% — so `incompleteProfileOils` never flags it (palm-kernel
 * summed *exactly* 93.0%). Our cleansing score counts C8/C10, so the omission silently understates
 * these oils' cleansing/bubbly bars relative to their backfilled cousins. This guard makes the
 * class explicit and un-missable.
 *
 * Bounds: `lauric ≥ 30` marks a "lauric oil"; `lauric < 90` excludes pure single-acid additives
 * (lauric-acid is ~99% lauric and legitimately carries no C8/C10).
 *
 * Allowlist = lauric oils whose stored profile is still C8/C10-truncated, pending a sourced
 * backfill. REMOVE an id when PROFILE_BACKFILL gives it real C8/C10; a NEW id here means a
 * freshly-added lauric oil shipped a truncated profile and needs review. Per-oil C8/C10 percentages
 * are NOT asserted here (they need a cited source before any backfill) — only the presence gap is.
 */
const LAURIC_DOMINANT_MIN = 30; // % lauric that marks an oil as "a lauric oil"
const PURE_ACID_MAX = 90; // at/above this it is a single-acid additive, not an oil
const LAURIC_OILS_MISSING_MCT = new Set<string>([
  // EMPTY — every lauric-dominant oil in the catalog now carries its real C8/C10 (Phase 5 complete):
  // babassu (Melo 2019 + Jackson 1944), cohune (FAO 1992 + SAP correction), murumuru (CIR 2017),
  // and the two hydrogenated forms coconut-oil-92 + palm-kernel-oil-flakes-hydrogenated (hydrogenation
  // transforms of their Codex-sourced base oils). A NEW id appearing here means a freshly-added lauric
  // oil shipped a C8/C10-truncated profile and needs a sourced backfill.
]);

describe('lauric-oil MCT completeness (catalog guard)', () => {
  it('every lauric-dominant oil carries C8/C10 except the known-truncated allowlist', () => {
    const missing = db.oils
      .filter((o) => {
        const lauric = o.fattyAcids?.lauric ?? 0;
        if (lauric < LAURIC_DOMINANT_MIN || lauric >= PURE_ACID_MAX) return false;
        return ((o.fattyAcids?.caprylic ?? 0) + (o.fattyAcids?.capric ?? 0)) === 0;
      })
      .map((o) => o.id);
    expect(missing.sort()).toEqual([...LAURIC_OILS_MISSING_MCT].sort());
  });
});

describe('incompleteProfileOils', () => {
  const oils: Parameters<typeof incompleteProfileOils>[0] = [
    { id: 'complete', propertiesAvailable: true, fattyAcids: { oleic: 70, palmitic: 30 } }, // 100
    { id: 'incomplete', propertiesAvailable: true, fattyAcids: { oleic: 45 } }, // 45
    { id: 'borderline', propertiesAvailable: true, fattyAcids: { oleic: 90, palmitic: 4 } }, // 94
    { id: 'no-profile', propertiesAvailable: false },
  ];

  it('lists property-ready oils below the threshold, sorted ascending by sum', () => {
    const result = incompleteProfileOils(oils, 93);
    expect(result.map((o) => o.id)).toEqual(['incomplete']);
    expect(result[0].sum).toBe(45);
  });

  it('ignores oils without a profile and those at/above the threshold', () => {
    const ids = incompleteProfileOils(oils, 93).map((o) => o.id);
    expect(ids).not.toContain('complete');
    expect(ids).not.toContain('borderline');
    expect(ids).not.toContain('no-profile');
  });
});

// A profile summing well above 100% cannot be a measured composition of one oil: three legacy rows
// did (loofa 104, pumpkin 102, mafura 102), and every group total and the Saturated/Unsaturated
// line rode above 100 with them. They were replaced with cited analyses (PROFILE_BACKFILL), and the
// build now errors on any property-ready profile above the tolerance. The tolerance only has to
// absorb rounding: the highest remaining sum is 100.1 (one-decimal profiles of 11-13 acids).
describe('overfull fatty-acid profiles', () => {
  it('flags a profile above the tolerance and nothing at or below it', () => {
    const oils: Parameters<typeof overfullProfileOils>[0] = [
      { id: 'over', propertiesAvailable: true, fattyAcids: { oleic: 60, linoleic: 40.6 } },
      { id: 'edge', propertiesAvailable: true, fattyAcids: { oleic: 60, linoleic: 40.5 } },
      { id: 'rounding', propertiesAvailable: true, fattyAcids: { oleic: 50.05, linoleic: 50.05 } },
      { id: 'not-property-ready', propertiesAvailable: false, fattyAcids: { oleic: 120 } },
      { id: 'no-profile', propertiesAvailable: true },
    ];
    expect(MAX_PROFILE_SUM_PERCENT).toBe(100.5);
    expect(overfullProfileOils(oils)).toEqual([{ id: 'over', sum: 100.6 }]);
  });

  it('finds no overfull profile in the built catalog', () => {
    expect(overfullProfileOils(db.oils)).toEqual([]);
  });

  it('keeps the three replaced profiles within their published analyses', () => {
    const profile = (id: string) => db.oils.find((o) => o.id === id)!.fattyAcids!;
    const sum = (p: Record<string, number>) => Object.values(p).reduce((a, b) => a + b, 0);
    // Loofa: 42 genotypes measured palmitic 10.76-17.75 and stearic 5.93-11.12 (Tyagi 2023,
    // Front Nutr, PMC10228728). The legacy row had palmitic 9 and stearic 18, in reverse order.
    const loofa = profile('loofa-seed-oil-luffa-cylinderica');
    expect(loofa.palmitic).toBeGreaterThanOrEqual(10.76);
    expect(loofa.palmitic).toBeLessThanOrEqual(17.75);
    expect(loofa.stearic).toBeGreaterThanOrEqual(5.93);
    expect(loofa.stearic).toBeLessThanOrEqual(11.12);
    // Mafura: the commercial butter, kernel fat and seed-coat oil pressed together, inside the supplier
    // spec for INCI "Trichilia emetica seed butter". The kernel fat alone is palmitic-rich (Mabaso
    // 2025, PMC12526083) and is not what soapmakers buy.
    const mafura = profile('mafura-butter-trichilia-emetica');
    const within = (value: number, low: number, high: number) => value >= low && value <= high;
    expect(within(mafura.palmitic, 30, 40), `palmitic ${mafura.palmitic}`).toBe(true);
    expect(within(mafura.stearic, 2, 4), `stearic ${mafura.stearic}`).toBe(true);
    expect(within(mafura.oleic, 45, 55), `oleic ${mafura.oleic}`).toBe(true);
    expect(within(mafura.linoleic, 8, 13), `linoleic ${mafura.linoleic}`).toBe(true);
    expect(within(mafura.linolenic, 1, 2), `linolenic ${mafura.linolenic}`).toBe(true);
    // Pumpkin: linoleic-dominant (Bardaa 2016, Lipids Health Dis, PMC4827242).
    const pumpkin = profile('pumpkin-seed-oil');
    expect(pumpkin.linoleic).toBeGreaterThan(pumpkin.oleic);
    for (const p of [loofa, mafura, pumpkin]) expect(sum(p)).toBeCloseTo(100, 1);
  });
});
