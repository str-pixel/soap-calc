/**
 * Curated fatty-acid profile backfill for oils whose legacy profile is truncated (<93% mapped)
 * or wrong. Each entry REPLACES the legacy breakdown with a single-provenance, cited profile
 * (spec Phase 5 — "apply as a replace, single provenance").
 *
 * Profiles are **normalized to 100% of total fatty acids**. Grounded: the SAP oracle is
 * normalization-invariant (mean molar mass divides by Σpct), but iodine value, INS, and every
 * property score are *absolute* sums over the profile — so a consistent ~100 scale keeps
 * backfilled oils comparable with the legacy corpus (which sums ~100). Raw source values (which
 * sum to ~95% of oil weight, the rest being the glycerol backbone) would silently under-weight
 * every backfilled oil's IV/INS/hardness/conditioning.
 *
 * Sources are public and cited (USDA FDC fdcId, or a literature DOI / PlantFAdb id) — numbers and
 * citation only, no dependency on the uncommitted archive. Shared by build-canonical (applies the
 * profile + an `fdc`/provenance source record) and validate-canonical (asserts the built value).
 * A backfill is not "done" until the profile-consistency gate is green — see the note's SAP check.
 */
export type ProfileBackfill = {
  profile: Record<string, number>;
  /** Coarse provenance category for the recorded source (full citation lives in `source`/`note`). */
  sourceType: 'fdc' | 'literature';
  /** Optional user-facing name override — for entries whose legacy name is wrong/misleading. */
  displayName?: string;
  /**
   * Set true to acknowledge an expected large property-score shift (≥ PROPERTY_SHIFT_THRESHOLD).
   * The build ERRORS on an unacknowledged large shift, so a big move is a deliberate, reviewed
   * decision (explained in `note`) rather than something that slips through silently.
   */
  acknowledgedShift?: boolean;
  source: string;
  url?: string;
  note: string;
};

export const PROFILE_BACKFILL: Record<string, ProfileBackfill> = {
  'avocado-oil': {
    profile: { oleic: 57, linoleic: 18, palmitic: 15, palmitoleic: 8, stearic: 1, linolenic: 1 },
    sourceType: 'literature',
    source:
      'Representative avocado composition — mean of four varieties (Ettinger, Fuerte, Hass, Reed) ' +
      'from "Chemical characterization of oil from four Avocado varieties cultivated in Morocco", ' +
      'OCL — Oilseeds & fats, Crops and Lipids (2021). Cross-checked against USDA FDC SR-Legacy ' +
      '(fdcId 173573), which is a high-oleic / low-palmitoleic outlier (palmitoleic 3% vs lit. 6–12%).',
    url: 'https://www.ocl-journal.org/articles/ocl/full_html/2021/01/ocl200126/ocl200126.html',
    note:
      'Legacy profile summed 92% (no palmitoleic/linolenic; palmitic 20% high). Avocado FA is highly ' +
      'cultivar-variable (palmitic 10–29%, oleic 36–74%, palmitoleic 6–12%), so a single source is ' +
      'unsafe; replaced with the peer-reviewed 4-variety mean, restoring the signature palmitoleic ' +
      '(~8%). Profile-derived SAP 0.194 agrees with stored 0.188 (−3.3%, within the gate). Property ' +
      'scores (hardness 16, conditioning 84) land between legacy (22/70) and the FDC point (12/88).',
  },

  'rapeseed-oil-canola': {
    profile: { oleic: 17, linoleic: 13, linolenic: 9, palmitic: 4, stearic: 1, erucic: 48, eicosenoic: 8 },
    sourceType: 'literature',
    displayName: 'Rapeseed Oil (high-erucic)',
    acknowledgedShift: true, // conditioning +56 is expected — restoring the truncated ~50% erucic
    source:
      'High-erucic rapeseed (HEAR). Legacy minors (oleic/linoleic/linolenic/palmitic/stearic — all ' +
      'within Codex CXS 210 high-erucic rapeseed ranges) kept; erucic (48%) and eicosenoic (8%) ' +
      'gap-filled to representative HEAR values (erucic ~46–50% per literature). Codex CXS 210, ' +
      'Standard for Named Vegetable Oils, Table 1 (rapeseed oil).',
    url: 'https://www.fao.org/4/y2774e/y2774e04.htm',
    note:
      'Identity correction: this entry (legacy displayName "Rapeseed Oil, unrefined canola") is ' +
      'high-erucic rapeseed, NOT canola — a separate canola-oil entry already exists. Its SAP 0.175 ' +
      'is the HEAR value (erucic’s high MW lowers SAP) and STAYS; the legacy profile had the ~50% ' +
      'erucic + eicosenoic truncated (sum 44%). Gap-filled to 100%; derived SAP 0.174 agrees with ' +
      'stored 0.175 (+0.6%). Property shift is conditioning +56 (erucic/eicosenoic are conditioning ' +
      'acids) — the property-shift guard flags it, correctly (restoring truncated data). Renamed to ' +
      'drop the canola misnomer.',
  },

  'mustard-oil-kachi-ghani': {
    profile: { oleic: 18, linoleic: 14, linolenic: 9, palmitic: 2, stearic: 2, erucic: 42, eicosenoic: 9, behenic: 2, arachidic: 1, myristic: 1 },
    sourceType: 'literature',
    acknowledgedShift: true, // conditioning +51 — restoring the truncated ~42% erucic
    source:
      'High-erucic mustard (Brassica juncea, kachi ghani). Present acids kept — all within Codex ' +
      'CXS 210 mustardseed ranges (verified against the FAO standard); erucic 42% + eicosenoic 9% ' +
      'gap-filled to a kachi-ghani-representative value (literature erucic 40–48%, above the Codex ' +
      'all-mustard midpoint of 36%, which understates the traditional high-erucic variety). Codex ' +
      'CXS 210 Table 1 (mustardseed oil).',
    url: 'https://www.fao.org/4/y2774e/y2774e04.htm',
    note:
      'Legacy profile summed 45% — the classic SoapCalc high-erucic truncation (erucic + eicosenoic ' +
      'dropped). Gap-filled to 100%; SAP 0.172 kept (verified/FNWL, within Codex [0.168–0.184]; ' +
      'profile-derived 0.175 agrees, −1.6%; derived IV 105 ≈ stored 101). Property shift is ' +
      'conditioning +51 (erucic/eicosenoic are conditioning acids) — flagged, acknowledged as a ' +
      'truncation restore. Two Codex minors (C20:2, C24:1, ~2%) are unmapped in our acid model.',
  },
};
