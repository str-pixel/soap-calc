import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MIN_MAPPED_PERCENT } from '@soap-calc/core';
import { incompleteProfileOils } from './profile-completeness.js';
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
  'soybean-27-5-hydrogenated',
  'macadamia-nut-butter',
  'tallow-sheep',
  'coconut-oil-92',
  'tallow-bear',
  // avocado-oil was here — Phase 5 backfilled it to 100% from USDA FDC (see PROFILE_BACKFILL).
  'avocado-butter',
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
  'babassu-oil', // stored lauric/myristic also inflated (~50/20 vs cited ~47/~16) — full reprofile, source-first
  'cohune-oil', // Attalea cohune (babassu relative) co-produces C8/C10 — truncated; needs a cited profile
  'murumuru-butter', // Astrocaryum murumuru co-produces C8/C10 — truncated; needs a cited profile
  'coconut-oil-92', // hydrogenated coconut — C8/C10 survive hydrogenation (it saturates, not shortens); needs a sourced profile
  'palm-kernel-oil-flakes-hydrogenated', // hydrogenated PKO — same: C8/C10 survive; needs a sourced profile
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
