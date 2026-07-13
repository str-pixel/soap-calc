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

  // ── Slice C batch 1 — literature-sourced, each cross-checked (≥2 sources), SAP kept (all within
  //    the profile-consistency gate vs the profile-derived value), citation URLs verified to resolve.
  'moringa-oil': {
    profile: { oleic: 74.4, behenic: 6.1, palmitic: 6.3, stearic: 5, arachidic: 3.3, eicosenoic: 1.8, palmitoleic: 1.4, linoleic: 0.8, linolenic: 0.5, lignoceric: 0.4, myristic: 0.1 },
    sourceType: 'literature',
    source:
      'Moringa oleifera ("ben oil") — representative composite (Leone et al. 2016, Int J Mol Sci ' +
      '17(12):2141, Table 3), cross-checked vs Anwar 2014 (J Food Sci Technol, Indian origin) and ' +
      'MDPI Foods 2024. Signature long-chain saturates (behenic ~6, arachidic ~3).',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC5187941/',
    note:
      'Legacy profile summed 87% (missing behenic/arachidic/eicosenoic/palmitoleic — the moringa ' +
      'long-chain-saturate fingerprint). Gap-filled to 100%. SAP 0.195 kept (verified/FNWL; ' +
      'profile-derived 0.188 within gate, +3.7%). Property shift +7 hardness/conditioning (under ' +
      'the guard threshold). Cultivar-variable (oleic 72–79); values are a sound composite.',
  },

  'borage-oil': {
    profile: { linoleic: 36.6, oleic: 21.7, linolenic: 17.7, palmitic: 10.9, stearic: 6.1, eicosenoic: 4.1, erucic: 2.3, arachidic: 0.4, behenic: 0.2 },
    sourceType: 'literature',
    source:
      'Borago officinalis (starflower) — full GC table, PMC 12189715 (2025, Table 1), cross-checked ' +
      'vs a GLA monograph (Townsend Letter) and Alfa Chemistry SAP. GLA (C18:3 n-6, ~17%) mapped to ' +
      'the linolenic key (both C18:3, same MW — SAP/IV-equivalent).',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC12189715/',
    note:
      'Legacy profile summed 82% and had linoleic 43/linolenic 5 — the ~17% GLA was mislabeled/' +
      'dropped and eicosenoic/erucic missing. Corrected to the true borage split. SAP 0.186 kept ' +
      '(verified/FNWL; profile-derived 0.191 within gate, −2.6%). Property shift +14 conditioning ' +
      '(under the guard threshold). GLA varies 17–25% by variety (does not move SAP). Unmapped ' +
      '~1.7% (nervonic C24:1, eicosadienoic C20:2 — no keys).',
  },

  'macadamia-nut-oil': {
    profile: { oleic: 59.4, palmitoleic: 19.1, palmitic: 8.6, stearic: 3.5, arachidic: 2.5, eicosenoic: 2.5, linoleic: 2, behenic: 0.9, myristic: 0.8, linolenic: 0.3, erucic: 0.3 },
    sourceType: 'literature',
    acknowledgedShift: true, // conditioning +22.6 — restoring macadamia's signature ~19% palmitoleic
    source:
      'Macadamia integrifolia — representative center of Yang et al. (15 China cultivars, PMC 8151099) ' +
      'and the widely-cited ~60% oleic / ~19% palmitoleic signature. The USDA FDC entry (~3.4% ' +
      'palmitoleic) is a confirmed outlier and was rejected — palmitoleic is macadamia’s signature.',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC8151099/',
    note:
      'Legacy profile summed 75% and omitted palmitoleic entirely — macadamia’s defining ~16–23% ' +
      'C16:1. Restored to 19% (cross-checked, USDA outlier rejected — the avocado lesson). SAP ' +
      '0.195 kept (verified/FNWL; profile-derived 0.194 within gate, +0.5%). Property shift is ' +
      'conditioning +22.6 (palmitoleic is a conditioning acid) — flagged, acknowledged as a ' +
      'signature restore. (macadamia-nut-butter is a distinct processed form — not backfilled here.)',
  },

  'evening-primrose-oil': {
    profile: { linoleic: 73.9, linolenic: 9.2, oleic: 7.7, palmitic: 6.3, stearic: 1.9, eicosenoic: 0.5, arachidic: 0.3, behenic: 0.1 },
    sourceType: 'literature',
    source:
      'Oenothera biennis — GC table, Timoszuk et al. 2018 (Antioxidants 7(8):108, PMC 6116039), SAP/IV ' +
      'from CIR 2017. GLA (~9%) mapped to linolenic. (A pooled CIR minor-acid table with implausible ' +
      'behenic ~8% was identified as a transcription artifact and NOT used.)',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC6116039/',
    note:
      'Legacy profile summed 89% with only linoleic 80 + linolenic 9 — palmitic/stearic/oleic ' +
      'entirely missing. Gap-filled to 100%. SAP 0.188 kept (verified; profile-derived 0.192 within ' +
      'gate, −2.2%). Property shift +8.6 hardness (adds the missing C16/C18 saturates — under the ' +
      'guard threshold). GLA 7–12% by variety.',
  },

  'walnut-oil': {
    profile: { linoleic: 60, oleic: 18.5, linolenic: 11.9, palmitic: 6.5, stearic: 2.7, eicosenoic: 0.2, palmitoleic: 0.1, arachidic: 0.1 },
    sourceType: 'literature',
    source:
      'Juglans regia — USDA FoodData Central "Oil, walnut" (fdcId 171030), cross-checked vs Bulgarian ' +
      'J. Agric. Sci. (4-sample means) and Poggetti et al. 2018. NOT in Codex CXS 210 (verified — the ' +
      '2024 additions were avocado/camellia/sacha-inchi/high-oleic-soybean, not walnut).',
    url: 'http://agrojournal.org/21/03-04.pdf', // FDC web food-detail URLs 404; cite the verified cross-check PDF + fdcId 171030 in source
    note:
      'Legacy profile summed 87% and omitted linolenic — walnut carries ~12% (its drying-oil ' +
      'signature). Gap-filled to 100%. SAP 0.193 kept (verified/FNWL; profile-derived 0.192 within ' +
      'gate, +0.4%). Property shift +12.7 conditioning (under the guard threshold). Oleic/linoleic ' +
      'trade off strongly by cultivar; values are central to the common high-linoleic form.',
  },
};
